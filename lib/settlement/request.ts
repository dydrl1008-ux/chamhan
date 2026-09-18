// 직원 본인 정산 계정으로 정산요청/조회/취소 — 정산 사이트 applypayment.html 로직 그대로
import { createClient } from '@supabase/supabase-js';
import { settleLogin, type SettleRow } from './client';
import { encrypt, decrypt } from '@/lib/crypto/secret';
import { todayKST, addDays } from '@/lib/date/kst';
import { calc, type ReqInput } from './calc';
export { calc, type ReqInput } from './calc';
const BASE = () => (process.env.SETTLE_BASE_URL || 'http://lchkgy.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const H = (cookie: string, json = false) => ({ Cookie: cookie, Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA, Referer: `${BASE()}/`, ...(json ? { 'Content-Type': 'application/json' } : {}) });
const n = (v: unknown) => { const x = Number(String(v ?? '0').replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : 0; };
async function getJ(cookie: string, path: string) { const res = await fetch(`${BASE()}${path}`, { headers: H(cookie), cache: 'no-store', redirect: 'manual' }); const t = await res.text(); if (res.status >= 300) throw new Error(`세션 만료 또는 권한 없음 (${res.status})`); try { return JSON.parse(t); } catch { throw new Error(`JSON 아님 ${path}: ${t.slice(0, 80)}`); } }
async function send(cookie: string, path: string, method: string, body: unknown) { const res = await fetch(`${BASE()}${path}`, { method, headers: H(cookie, true), body: JSON.stringify(body), cache: 'no-store', redirect: 'manual' }); return { status: res.status, text: await res.text() }; }

// ---- 계정 ----
export async function saveCredential(userId: string, settleUserId: string, pw: string) {
  const cookie = await settleLogin({ userId: settleUserId, userPw: pw });   // 실제 로그인으로 검증
  const me = await getJ(cookie, '/api/pages/customer/login_user').catch(() => null);
  const { error } = await admin().from('settlement_credentials').upsert({ user_id: userId, settle_user_id: settleUserId, pw_enc: encrypt(pw), verified_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  // 담당자 매핑 자동 등록
  await admin().from('settlement_empl_map').upsert({ empl_id: settleUserId, user_id: userId }, { onConflict: 'empl_id' });
  return { me };
}
const sessions = new Map<string, { cookie: string; at: number }>();
export async function userSession(userId: string): Promise<{ cookie: string; settleUserId: string }> {
  const { data: c } = await admin().from('settlement_credentials').select('settle_user_id,pw_enc').eq('user_id', userId).maybeSingle();
  if (!c) throw new Error('정산 계정이 연결되지 않았습니다. 마이페이지에서 연결하세요.');
  const hit = sessions.get(userId); if (hit && Date.now() - hit.at < 15 * 60_000) return { cookie: hit.cookie, settleUserId: c.settle_user_id };
  try { const cookie = await settleLogin({ userId: c.settle_user_id, userPw: decrypt(c.pw_enc) }); sessions.set(userId, { cookie, at: Date.now() }); await admin().from('settlement_credentials').update({ last_error: null }).eq('user_id', userId); return { cookie, settleUserId: c.settle_user_id }; }
  catch (e: any) { await admin().from('settlement_credentials').update({ last_error: e.message }).eq('user_id', userId); throw new Error('정산 사이트 로그인 실패 — 비밀번호가 바뀌었으면 마이페이지에서 다시 연결하세요. (' + e.message + ')'); }
}

// ---- 폼 데이터 ----
export async function formData(cookie: string, settleUserId: string) {
  const today = todayKST();
  const [customers, products, codes, rate] = await Promise.all([
    getJ(cookie, `/api/pages/customer?baseDate=${today}`), getJ(cookie, '/api/pages/product/pop/list?'),
    send(cookie, '/api/system/codes/pages', 'POST', [{ patternCode: 'SE02', groupCode: 'A' }]).then(r => { try { return JSON.parse(r.text); } catch { return {}; } }),
    getJ(cookie, `/api/pages/applypayment/find/incentiveRate?userId=${encodeURIComponent(settleUserId)}`).catch(() => 0),
  ]);
  const gubuns: { code: string; name: string }[] = ((codes?.SE02 ?? []) as any[]).map(x => ({ code: String(x.baseCode), name: String(x.codeName) }));
  return { customers: (customers as any[]).map(c => ({ bizNo: String(c.bizNo), name: String(c.custName), empId: String(c.empId ?? '') })), products: (products as any[]).map(p => ({ prodId: String(p.prodId), name: String(p.prodName) })), gubuns, empRate: Number(rate) || 0 };
}
export const custInfo = (cookie: string, bizNo: string) => getJ(cookie, `/api/pages/applypayment/custinfo?bizNo=${encodeURIComponent(bizNo)}`);
export const prodInfo = (cookie: string, prodId: string) => getJ(cookie, `/api/pages/applypayment/prodinfo?prodId=${encodeURIComponent(prodId)}&baseDate=${todayKST()}`);

/** 정산요청 생성 → 오늘 요청 목록 재조회로 생성 확인 */
export async function createRequest(userId: string, i: ReqInput) {
  const { cookie, settleUserId } = await userSession(userId); const c = calc(i);
  if (!i.custId || !i.prodId) throw new Error('고객·상품을 선택하세요'); if (!i.dateWorkFrom || !i.dateWorkTo) throw new Error('작업 기간을 입력하세요'); if (i.inflowCnt <= 0 && !['05', '06'].includes(i.gubun)) throw new Error('유입수를 입력하세요'); if (!i.gubun) throw new Error('요청구분을 선택하세요');
  if (i.mileageUseInd && c.useMileage <= 0) throw new Error('킵 사용 체크 시 금액을 입력하세요'); if (i.mileageUseInd && c.useMileage > i.existMileage) throw new Error(`킵 잔여(${i.existMileage.toLocaleString()})보다 많이 쓸 수 없습니다`);
  const payload = { rowStatus: 'C', userId: settleUserId, custId: i.custId, prodId: i.prodId, prodAmt: String(i.prodAmt), saleAmt: String(i.saleAmt), inflowCnt: String(i.inflowCnt), saleTotalAmt: String(i.saleTotalAmt), prodTotalAmt: String(c.prodTotalAmt), expectAmt: String(c.expectAmt), expectRateAmt: String(c.expectRateAmt), dateWorkFrom: i.dateWorkFrom, dateWorkTo: i.dateWorkTo, workDay: String(c.workDay), incentiveRate: String(c.incentiveRate), mileageUseInd: i.mileageUseInd ? 'Y' : 'N', useMileage: String(c.useMileage), existMileage: String(i.existMileage), gubun: i.gubun, prodIncentiveInd: c.prodIncentiveInd, prodIncentive: String(i.prodIncentive) };
  const before = await myRequests(cookie, todayKST(), todayKST()).catch(() => [] as any[]);
  const res = await send(cookie, '/api/pages/applypayment', 'POST', payload); const okNum = Number(res.text) > 0;
  let seq: string | null = null;
  if (okNum) { const after = await myRequests(cookie, todayKST(), todayKST()).catch(() => [] as any[]); const bs = new Set(before.map(x => String(x.settlementSeq))); const fresh = after.filter(x => !bs.has(String(x.settlementSeq)) && String(x.custId) === i.custId && String(x.prodId) === i.prodId); seq = fresh.at(-1)?.settlementSeq ? String(fresh.at(-1)!.settlementSeq) : null; }
  await admin().from('settlement_requests').insert({ user_id: userId, settlement_seq: seq, action: 'create', payload, result: `${res.status} ${res.text.slice(0, 200)}`, ok: okNum });
  if (!okNum) throw new Error(`정산 사이트 응답: ${res.text.slice(0, 200) || res.status}`);
  return { seq, calc: c };
}
export async function myRequests(cookie: string, from: string, to: string): Promise<SettleRow[]> { const j = await getJ(cookie, `/api/pages/applypayment?searchStartDate=${from}&searchEndDate=${to}&custName=&prodName=&isAdmin=false`); return Array.isArray(j) ? j : []; }
export async function cancelRequest(userId: string, settlementSeq: string) {
  const { cookie } = await userSession(userId);
  const list = await myRequests(cookie, addDays(todayKST(), -120), todayKST()); const row = list.find(r => String(r.settlementSeq) === settlementSeq);
  if (!row) throw new Error('내 요청 목록에서 찾지 못했습니다'); if (String(row.applyStatus) !== '01') throw new Error(`승인요청 상태만 취소 가능 (현재 ${row.applyStatusName ?? row.applyStatus})`);
  const payload = { settlementDtoList: [{ settlementSeq, custId: row.custId, mileageUseInd: row.mileageUseInd, useMileage: row.useMileage, userId: row.userId }] };
  const res = await send(cookie, '/api/pages/applypayment/cancel', 'POST', payload); const okNum = Number(res.text) > 0;
  await admin().from('settlement_requests').insert({ user_id: userId, settlement_seq: settlementSeq, action: 'cancel', payload, result: `${res.status} ${res.text.slice(0, 200)}`, ok: okNum });
  if (!okNum) throw new Error(`정산 사이트 응답: ${res.text.slice(0, 200) || res.status}`);
}
