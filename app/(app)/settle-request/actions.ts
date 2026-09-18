'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { saveCredential, userSession, formData, custInfo, prodInfo, createRequest, cancelRequest, myRequests, type ReqInput } from '@/lib/settlement/request';
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
export async function pickProduct(prodId: string): Promise<R<{ prodAmt: number; prodIncentive: number }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); const p = await prodInfo(cookie, prodId); return { ok: true, msg: '', prodAmt: Number(p?.prodAmt ?? 0) || 0, prodIncentive: Number(p?.prodIncentive ?? 0) || 0 }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function submitRequest(i: ReqInput): Promise<R<{ seq: string | null }>> {
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
