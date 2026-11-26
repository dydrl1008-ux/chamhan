'use server';
import { refundFromSettle, payCancelBySettle } from '@/lib/metaPay';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { userSession, gubunCodes } from '@/lib/settlement/request';
import { refundablePayments, refundItemDefs, origProdItems, myRefunds, createRefund, deleteRefund, extraRefundables } from '@/lib/settlement/refund';
import { todayKST, addDays } from '@/lib/date/kst';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
export async function loadRefundForm(from: string, to: string): Promise<R<{ payments: any[]; itemDefs: { refundItemId: string; refundItemName: string }[]; gubuns: { code: string; name: string }[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); const [payments, extras, itemDefs, gubuns] = await Promise.all([refundablePayments(cookie, from, to), extraRefundables(cookie, from, to).catch(() => []), refundItemDefs(cookie), gubunCodes(cookie, 'B')]); const seen = new Set(payments.map((p: any) => String(p.settlementSeq))); return { ok: true, msg: '', payments: [...payments, ...extras.filter((e: any) => !seen.has(String(e.settlementSeq)))], itemDefs, gubuns }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function loadOrigItems(settlementSeq: string, prodId: string): Promise<R<{ items: { seq: number; name: string; inputValue: string }[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); return { ok: true, msg: '', items: await origProdItems(cookie, settlementSeq, prodId) }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function submitRefund(orig: any, inp: { refundDate: string; refundInflowCnt: number; gubun: string; memo?: string; items: { refundItemId: string; refundItemName: string; inputValue: string }[] }): Promise<R<{ seq: string | null }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const r = await createRefund(me.id, orig, inp);
    let extra = ''; try { extra = await refundFromSettle({ userId: me.id, origSeq: String(orig?.settlementSeq ?? ''), refundSeq: r.seq, refundDate: inp.refundDate, refundSale: r.calc.refundProdTotalAmt, refundProd: r.calc.refundSaleTotalAmt, gubun: ['05', '06'].includes(String(orig?.gubun)) ? '07' : String(inp.gubun) }); } catch (e: any) { extra = ' · ⚠ 인바운드 환불 기록 실패: ' + String(e?.message ?? e).slice(0, 80); }   // 원 정산이 메타 인바운드 건이면 결제 내역에 환불로 (사이트 필드명: refundProdTotalAmt = 판매가 기준, refundSaleTotalAmt = 상품가 기준)
    revalidatePath('/settle-refund'); return { ok: true, msg: (r.seq ? `환불요청 ${r.seq} 접수됨 · 환불금액 ${r.calc.refundProdTotalAmt.toLocaleString('ko-KR')} · 환불수수료 ${r.calc.refundExpectRateAmt.toLocaleString('ko-KR')}` : '접수됐습니다 (목록에서 확인)') + extra, seq: r.seq }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function myRefundList(days = 90): Promise<R<{ rows: any[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const { cookie } = await userSession(me.id); const rows = await myRefunds(cookie, addDays(todayKST(), -days), addDays(todayKST(), 60)); return { ok: true, msg: '', rows: rows.sort((a: any, b: any) => String(b.refundDate).localeCompare(String(a.refundDate))) }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function cancelRefund(seq: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { await deleteRefund(me.id, seq); let extra = ''; try { if (await payCancelBySettle(`R:${seq}`, me.id)) extra = ' · 인바운드 환불 기록도 취소했습니다'; } catch { /* 환불 기록 취소 실패는 삭제를 막지 않는다 */ } revalidatePath('/settle-refund'); return { ok: true, msg: `${seq} 환불요청 삭제` + extra }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
