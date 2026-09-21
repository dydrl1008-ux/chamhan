'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { saveCredential, userSession, formData, custInfo, prodInfo, prodItems, createRequest, cancelRequest, myRequests, createCustomer, lastSaleAmt, type ReqInput } from '@/lib/settlement/request';
import { todayKST, addDays } from '@/lib/date/kst';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
export async function linkAccount(fd: FormData): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const id = String(fd.get('settle_user_id') || '').trim(), pw = String(fd.get('settle_pw') || '');
  if (!id || !pw) return { ok: false, msg: '정산 사이트 아이디와 비밀번호를 입력하세요' };
  try { await saveCredential(me.id, id, pw); revalidatePath('/me'); revalidatePath('/settle-request'); revalidatePath('/settlement'); return { ok: true, msg: `정산 계정 ${id} 연결 완료 (로그인 확인됨)` }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function loadForm(): Promise<R<{ data: Awaited<ReturnType<typeof formData>> }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie, settleUserId } = await userSession(me.id); const data = await formData(cookie, settleUserId); return { ok: true, msg: '', data }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function pickCustomer(bizNo: string): Promise<R<{ mileage: number; rate: number }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); const c = await custInfo(cookie, bizNo); return { ok: true, msg: '', mileage: Number(c?.mileage ?? 0) || 0, rate: Number(c?.incentiveRate ?? 0) || 0 }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function pickProduct(prodId: string): Promise<R<{ prodAmt: number; prodIncentive: number; items: { prodId: string; seq: number; name: string }[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); const [p, items] = await Promise.all([prodInfo(cookie, prodId), prodItems(cookie, prodId).catch(() => [])]); return { ok: true, msg: '', prodAmt: Number(p?.prodAmt ?? 0) || 0, prodIncentive: Number(p?.prodIncentive ?? 0) || 0, items }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function submitRequest(i: ReqInput & { reqDate?: string; memo?: string; items?: { prodId: string; seq: number; name: string; inputValue: string }[] }): Promise<R<{ seq: string | null }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const r = await createRequest(me.id, i); revalidatePath('/settle-request'); return { ok: true, msg: r.seq ? `정산요청 ${r.seq} 접수됨 · 예상정산 ${r.calc.expectRateAmt.toLocaleString('ko-KR')}원` : '접수됐습니다 (정산번호는 목록에서 확인)', seq: r.seq }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function myList(days = 60): Promise<R<{ rows: any[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); const rows = await myRequests(cookie, addDays(todayKST(), -days), todayKST()); return { ok: true, msg: '', rows: rows.sort((a: any, b: any) => String(b.reqDate).localeCompare(String(a.reqDate)) || String(b.settlementSeq).localeCompare(String(a.settlementSeq))) }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function cancelMine(seq: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { await cancelRequest(me.id, seq); revalidatePath('/settle-request'); return { ok: true, msg: `${seq} 요청취소 완료` }; } catch (e: any) { return { ok: false, msg: e.message }; }
}

export async function addCustomer(fd: FormData): Promise<R<{ bizNo: string }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const g = (k: string) => String(fd.get(k) || '').trim();
  try { const r = await createCustomer(me.id, { bizNo: g('bizNo'), custName: g('custName'), ownerName: g('ownerName'), custTel: g('custTel'), custMail: g('custMail'), custAddr: g('custAddr'), depositorName: g('depositorName'), bizType: g('bizType'), bizClass: g('bizClass') }); return { ok: true, msg: `고객 '${g('custName')}' 등록됨`, bizNo: r.bizNo }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function suggestSale(custId: string, prodId: string): Promise<R<{ saleAmt: number | null }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); return { ok: true, msg: '', saleAmt: await lastSaleAmt(cookie, custId, prodId) }; } catch (e: any) { return { ok: false, msg: e.message }; }
}

/** 쓰기 없이 실제 호출로 단계별 점검 */
export async function selfTest(): Promise<R<{ steps: { name: string; ok: boolean; note: string }[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const steps: { name: string; ok: boolean; note: string }[] = []; const t0 = Date.now(); const ms = () => `${Date.now() - t0}ms`;
  let cookie = '', settleUserId = '';
  try { const s = await userSession(me.id); cookie = s.cookie; settleUserId = s.settleUserId; steps.push({ name: '1 본인 계정 로그인', ok: true, note: `${settleUserId} · ${ms()}` }); } catch (e: any) { steps.push({ name: '1 본인 계정 로그인', ok: false, note: e.message }); return { ok: false, msg: '로그인 단계 실패', steps }; }
  let fd: any = null;
  try { fd = await formData(cookie, settleUserId); steps.push({ name: '2 고객·상품·요청구분·인센율 조회', ok: fd.customers.length > 0 && fd.products.length > 0 && fd.gubuns.length > 0, note: `고객 ${fd.customers.length} · 상품 ${fd.products.length} · 구분 ${fd.gubuns.map((g: any) => g.name).join('/')} · 직원 인센율 ${fd.empRate} · ${ms()}` }); } catch (e: any) { steps.push({ name: '2 고객·상품·요청구분·인센율 조회', ok: false, note: e.message }); }
  if (fd?.customers?.[0]) { try { const c = await custInfo(cookie, fd.customers[0].bizNo); steps.push({ name: '3 고객 정보(킵·인센율)', ok: c != null, note: `${fd.customers[0].name}: 킵 ${c?.mileage} · 인센 ${c?.incentiveRate} · ${ms()}` }); } catch (e: any) { steps.push({ name: '3 고객 정보', ok: false, note: e.message }); } }
  if (fd?.products?.[0]) { try { const p = await prodInfo(cookie, fd.products[0].prodId); steps.push({ name: '4 상품 정보(상품가·상품인센)', ok: p != null, note: `${fd.products[0].name}: 상품가 ${p?.prodAmt} · 상품인센 ${p?.prodIncentive} · ${ms()}` }); } catch (e: any) { steps.push({ name: '4 상품 정보', ok: false, note: e.message }); } }
  try { const rows = await myRequests(cookie, addDays(todayKST(), -30), todayKST()); steps.push({ name: '5 내 요청 목록(30일)', ok: true, note: `${rows.length}건 · 상태값 ${[...new Set(rows.map((r: any) => r.applyStatusName ?? r.applyStatus))].join('/') || '-'} · ${ms()}` }); } catch (e: any) { steps.push({ name: '5 내 요청 목록', ok: false, note: e.message }); }
  const okAll = steps.every(s => s.ok);
  return { ok: okAll, msg: okAll ? '읽기 단계 전부 정상 — 접수는 실제 테스트 1건으로 확인' : '실패 단계 확인', steps };
}
