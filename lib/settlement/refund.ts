// 환불요청 — 정산 사이트 refund.html / RefundRestController 동작 그대로 (본인 정산 계정 세션)
import { createClient } from '@supabase/supabase-js';
import { userSession } from './request';
import type { SettleRow } from './client';
import { todayKST, addDays } from '@/lib/date/kst';
import { refundCalc } from './refundCalc';
export { refundCalc, type RefundCalcIn } from './refundCalc';
const BASE = () => (process.env.SETTLE_BASE_URL || 'https://chamhan.info').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const H = (cookie: string, json = false) => ({ Cookie: cookie, Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA, Referer: `${BASE()}/`, ...(json ? { 'Content-Type': 'application/json' } : {}) });
const n = (v: unknown) => { const x = Number(String(v ?? '0').replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : 0; };
async function getJ(cookie: string, path: string) { const res = await fetch(`${BASE()}${path}`, { headers: H(cookie), cache: 'no-store', redirect: 'manual' }); const t = await res.text(); if (res.status >= 300) throw new Error(`세션 만료 또는 권한 없음 (${res.status})`); try { return JSON.parse(t); } catch { throw new Error(`JSON 아님 ${path}: ${t.slice(0, 80)}`); } }
async function send(cookie: string, path: string, method: string, body: unknown) { const res = await fetch(`${BASE()}${path}`, { method, headers: H(cookie, true), body: JSON.stringify(body), cache: 'no-store', redirect: 'manual' }); return { status: res.status, text: await res.text() }; }

/** 환불 가능한 원 정산 (승인완료·미환불·본인). 작업기간이 검색기간과 겹치는 건 */
export const refundablePayments = (cookie: string, from: string, to: string): Promise<SettleRow[]> => getJ(cookie, `/api/pages/refund/payment/list?searchStartDate=${from}&searchEndDate=${to}&custName=&prodName=`).then(j => Array.isArray(j) ? j : []);
export const refundItemDefs = (cookie: string): Promise<{ refundItemId: string; refundItemName: string }[]> => getJ(cookie, '/api/pages/refund/refund-items').then(j => (Array.isArray(j) ? j : []).map((x: any) => ({ refundItemId: String(x.refundItemId), refundItemName: String(x.refundItemName) })));
export const origProdItems = (cookie: string, settlementSeq: string, prodId: string) => getJ(cookie, `/api/pages/refund/prodItem/list/${encodeURIComponent(settlementSeq)}/${encodeURIComponent(prodId)}`).then(j => (Array.isArray(j) ? j : []) as { seq: number; name: string; inputValue: string }[]);
export const myRefunds = (cookie: string, from: string, to: string): Promise<SettleRow[]> => getJ(cookie, `/api/pages/refund?searchStartDate=${from}&searchEndDate=${to}&custName=&prodName=`).then(j => Array.isArray(j) ? j : (j?.data ?? []));

/** 원 정산별 기존 환불 집계 (승인취소 03 제외) */
export type PriorRefunds = { count: number; usedCnt: number; list: { seq: string; date: string; cnt: number; status: string; statusName: string }[] };
export function priorRefundsOf(refunds: SettleRow[]): Map<string, PriorRefunds> {
  const m = new Map<string, PriorRefunds>();
  for (const r of refunds) {
    if (String(r.applyStatus) === '03') continue;
    const k = String(r.settlementSeq); const p = m.get(k) ?? { count: 0, usedCnt: 0, list: [] };
    p.count++; p.usedCnt += n(r.refundInflowCnt); p.list.push({ seq: String(r.refundSettlementSeq), date: String(r.refundDate ?? '').slice(0, 10), cnt: n(r.refundInflowCnt), status: String(r.applyStatus ?? ''), statusName: String(r.applyStatusName ?? '') });
    m.set(k, p);
  }
  return m;
}
/**
 * 추가 환불 대상 — 이미 환불요청이 1건 이상 있어 사이트 환불 화면(findSettlement NOT EXISTS)에는 안 나오지만 유입수가 남은 승인완료 원 정산.
 * 사이트 저장(saveRefund)은 원건당 1회 제한이 없고(화면 목록만 제외), 승인·급여·킵 적립은 환불 행 단위로 독립 계산되므로 환불킵(04)으로 나눠 등록해도 정확함.
 * 원 정산 정보는 정산요청 목록(applypayment)에서, 상품수수료 여부는 워크허브 동기화 데이터에서 보충.
 */
export async function extraRefundables(cookie: string, from: string, to: string): Promise<(SettleRow & { _extra: PriorRefunds & { remainCnt: number } })[]> {
  const { myRequests } = await import('./request');
  const [reqs, refunds] = await Promise.all([myRequests(cookie, addDays(from, -120), to), myRefunds(cookie, addDays(from, -120), addDays(to, 60))]);
  const prior = priorRefundsOf(refunds);
  const cands = reqs.filter(r => String(r.applyStatus) === '02' && prior.has(String(r.settlementSeq)) && String(r.dateWorkTo ?? '').slice(0, 10) >= from && String(r.dateWorkFrom ?? '').slice(0, 10) <= to);
  if (!cands.length) return [];
  const seqs = cands.map(r => String(r.settlementSeq)); const indMap = new Map<string, string>();
  try { const { data } = await admin().from('settlement_items').select('raw').in('raw->>settlementSeq', seqs); for (const x of data ?? []) { const raw: any = (x as any).raw ?? {}; if (raw.settlementSeq) indMap.set(String(raw.settlementSeq), String(raw.prodIncentiveInd ?? 'N')); } } catch {}
  const out: (SettleRow & { _extra: PriorRefunds & { remainCnt: number } })[] = [];
  for (const r of cands) {
    const p = prior.get(String(r.settlementSeq))!; const remain = n(r.inflowCnt) - p.usedCnt; if (remain <= 0) continue;
    const workDay = n(r.workDay), inflow = n(r.inflowCnt);
    // findSettlement(환불 화면 원건 조회) 필드명으로 맞춤 — 사이트 refund.html 모달 바인딩과 동일한 키
    out.push({ ...r, empName: String(r.userName ?? r.empName ?? ''), existMileage: n(r.curExistMileage ?? r.existMileage), reqGubun: 'AQ', prodIncentiveInd: indMap.get(String(r.settlementSeq)) ?? 'N', prodIncentive: workDay && inflow ? n(r.expectRateAmt) / workDay / inflow : 0, statusName: String(r.applyStatusName ?? ''), _extra: { ...p, remainCnt: remain } });
  }
  return out;
}

export async function createRefund(userId: string, orig: SettleRow, inp: { refundDate: string; refundInflowCnt: number; gubun: string; memo?: string; items: { refundItemId: string; refundItemName: string; inputValue: string }[] }) {
  const { cookie } = await userSession(userId);
  let gubun = ['05', '06'].includes(String(orig.gubun)) ? '07' : inp.gubun;   // 선입금 원건은 환불구분 07 고정 (사이트와 동일)
  // 추가 환불(같은 원건에 이미 환불요청 있음): 잔여 유입수 초과 금지 + 환불킵(04)만 허용 (사이트 승인/급여가 04는 행 단위로 독립 계산, 그 외 구분은 원건 금액을 다시 빼서 중복됨)
  { const all = await myRefunds(cookie, addDays(todayKST(), -365), addDays(todayKST(), 60)).catch(() => [] as SettleRow[]); const p = priorRefundsOf(all).get(String(orig.settlementSeq));
    const total = n(orig.inflowCnt); const used = p?.usedCnt ?? 0; const remain = total - used;
    if (inp.refundInflowCnt > remain) throw new Error(p ? `잔여 유입수 ${remain} (전체 ${total} − 기존 환불 ${used})를 초과합니다` : `유입수는 원 정산 유입수(${total}) 이하`);
    if (p && p.count > 0) { if (gubun !== '04') throw new Error('추가 환불(같은 원 정산 2회째부터)은 환불킵(04)으로만 접수할 수 있습니다'); } }
  if (!gubun) throw new Error('환불구분을 선택하세요');
  { const { gubunCodes } = await import('./request'); const codes = await gubunCodes(cookie, 'B').catch(() => [] as { code: string; name: string }[]); if (codes.length && !codes.some(c => c.code === gubun)) throw new Error(`환불 구분이 아닙니다 (선택: ${gubun}). 환불 구분: ${codes.map(c => c.name).join(', ')}`); }
  if (!Number.isFinite(inp.refundInflowCnt) || inp.refundInflowCnt < 0) throw new Error('유입수는 0 이상');
  const c = refundCalc({ prodAmt: n(orig.prodAmt), saleAmt: n(orig.saleAmt), refundInflowCnt: inp.refundInflowCnt, dateWorkFrom: String(orig.dateWorkFrom), dateWorkTo: String(orig.dateWorkTo), refundDate: inp.refundDate, workDay: n(orig.workDay), incentiveRate: n(orig.incentiveRate), prodIncentiveInd: String(orig.prodIncentiveInd ?? 'N'), prodIncentive: n(orig.prodIncentive), gubun });
  if (c.err) throw new Error(c.err);
  { const over = inp.items.find(x => String(x.inputValue ?? '').replace(/,/g, '').trim().length > 10); if (over) throw new Error(`환불 항목 '${over.refundItemName}' 값은 최대 10자 (정산 사이트 DB 컬럼 제한)`); }
  // refund.html saveRefund(): 모달의 모든 input/select(원 정산 바인딩 + 환불 입력) → 서버가 refundInd Y / reqGubun RQ / refundSettlementSeq=settlementSeq 세팅
  const payload = {
    settlementSeq: String(orig.settlementSeq), empName: String(orig.empName ?? ''), custName: String(orig.custName ?? ''), prodName: String(orig.prodName ?? ''), dateWorkFrom: String(orig.dateWorkFrom ?? '').slice(0, 10), dateWorkTo: String(orig.dateWorkTo ?? '').slice(0, 10), workDay: String(n(orig.workDay)), inflowCnt: String(n(orig.inflowCnt)), prodAmt: String(n(orig.prodAmt)), saleAmt: String(n(orig.saleAmt)), saleTotalAmt: String(n(orig.saleTotalAmt)), memo: (inp.memo ?? String(orig.memo ?? '')).slice(0, 500), reqDate: String(orig.reqDate ?? '').slice(0, 10), incentiveRate: String(n(orig.incentiveRate)), custId: String(orig.custId), prodId: String(orig.prodId), userId: String(orig.userId), prodTotalAmt: String(n(orig.prodTotalAmt)), expectAmt: String(n(orig.expectAmt)), expectRateAmt: String(n(orig.expectRateAmt)), mileageUseInd: String(orig.mileageUseInd ?? 'N'), useMileage: String(n(orig.useMileage)), reqGubun: String(orig.reqGubun ?? ''), existMileage: String(n(orig.existMileage)), prodIncentiveInd: String(orig.prodIncentiveInd ?? 'N'), prodIncentive: String(n(orig.prodIncentive)),
    refundDate: inp.refundDate, refundInflowCnt: String(inp.refundInflowCnt), refundWorkDay: String(c.refundWorkDay), refundProdTotalAmt: String(c.refundProdTotalAmt), refundExpectRateAmt: String(c.refundExpectRateAmt), gubun, refundSaleTotalAmt: String(c.refundSaleTotalAmt),
    tbSettlementRefundItemDtoList: inp.items.map(x => ({ refundItemId: x.refundItemId, refundItemName: x.refundItemName, inputValue: String(x.inputValue ?? '').replace(/,/g, '').trim() })),   // 사이트 saveRefund(): 모든 입력값의 쉼표 제거
  };
  const before = await myRefunds(cookie, inp.refundDate, inp.refundDate).catch(() => [] as SettleRow[]);
  const res = await send(cookie, '/api/pages/refund', 'POST', payload); const okNum = Number(res.text) > 0;
  let seq: string | null = null;
  if (okNum) { const after = await myRefunds(cookie, inp.refundDate, inp.refundDate).catch(() => [] as SettleRow[]); const bs = new Set(before.map(x => String(x.refundSettlementSeq))); const fresh = after.filter(x => !bs.has(String(x.refundSettlementSeq)) && String(x.settlementSeq) === String(orig.settlementSeq)); seq = fresh.at(-1)?.refundSettlementSeq ? String(fresh.at(-1)!.refundSettlementSeq) : null; }
  await admin().from('settlement_requests').insert({ user_id: userId, settlement_seq: seq, action: 'create', payload: { _type: 'refund', ...payload }, result: `${res.status} ${res.text.slice(0, 200)}`, ok: okNum });
  if (!okNum) throw new Error(`정산 사이트 응답: ${res.text.slice(0, 200) || res.status}`);
  return { seq, calc: c };
}
/** 환불요청 삭제(취소) — 승인요청 상태만 */
export async function deleteRefund(userId: string, refundSettlementSeq: string) {
  const { cookie } = await userSession(userId);
  const list = await myRefunds(cookie, addDays(todayKST(), -180), addDays(todayKST(), 60)); const row = list.find(r => String(r.refundSettlementSeq) === refundSettlementSeq);
  if (!row) throw new Error('내 환불요청에서 찾지 못했습니다'); if (String(row.applyStatus) !== '01') throw new Error(`승인요청 상태만 삭제 가능 (현재 ${row.applyStatusName ?? row.applyStatus})`);
  const payload = { settlementSeq: refundSettlementSeq, prodId: row.prodId, userId: row.userId, custId: row.custId };
  const res = await send(cookie, '/api/pages/refund', 'DELETE', payload); const okNum = Number(res.text) > 0;
  await admin().from('settlement_requests').insert({ user_id: userId, settlement_seq: refundSettlementSeq, action: 'cancel', payload: { _type: 'refund', ...payload }, result: `${res.status} ${res.text.slice(0, 200)}`, ok: okNum });
  if (!okNum) throw new Error(`정산 사이트 응답: ${res.text.slice(0, 200) || res.status}`);
}
