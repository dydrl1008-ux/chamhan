'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { userSession, gubunCodes } from '@/lib/settlement/request';
import { refundablePayments, refundItemDefs, origProdItems, myRefunds, createRefund, deleteRefund } from '@/lib/settlement/refund';
import { todayKST, addDays } from '@/lib/date/kst';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
export async function loadRefundForm(from: string, to: string): Promise<R<{ payments: any[]; itemDefs: { refundItemId: string; refundItemName: string }[]; gubuns: { code: string; name: string }[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); const [payments, itemDefs, gubuns] = await Promise.all([refundablePayments(cookie, from, to), refundItemDefs(cookie), gubunCodes(cookie, 'B')]); return { ok: true, msg: '', payments, itemDefs, gubuns }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function loadOrigItems(settlementSeq: string, prodId: string): Promise<R<{ items: { seq: number; name: string; inputValue: string }[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); return { ok: true, msg: '', items: await origProdItems(cookie, settlementSeq, prodId) }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function submitRefund(orig: any, inp: { refundDate: string; refundInflowCnt: number; gubun: string; memo?: string; items: { refundItemId: string; refundItemName: string; inputValue: string }[] }): Promise<R<{ seq: string | null }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const r = await createRefund(me.id, orig, inp); revalidatePath('/settle-refund'); return { ok: true, msg: r.seq ? `환불요청 ${r.seq} 접수됨 · 환불금액 ${r.calc.refundProdTotalAmt.toLocaleString('ko-KR')} · 환불수수료 ${r.calc.refundExpectRateAmt.toLocaleString('ko-KR')}` : '접수됐습니다 (목록에서 확인)', seq: r.seq }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function myRefundList(days = 90): Promise<R<{ rows: any[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); const rows = await myRefunds(cookie, addDays(todayKST(), -days), addDays(todayKST(), 60)); return { ok: true, msg: '', rows: rows.sort((a: any, b: any) => String(b.refundDate).localeCompare(String(a.refundDate))) }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function cancelRefund(seq: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { await deleteRefund(me.id, seq); revalidatePath('/settle-refund'); return { ok: true, msg: `${seq} 환불요청 삭제` }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
