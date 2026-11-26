// 메타 결제 내역 공통 — 합계 다시 맞추기, 정산요청에서 자동 등록 · 자동 취소
import { supabaseAdmin } from '@/lib/supabase/admin';
/** 결제 내역이 바뀌면 건의 합계(결제 금액 · 상품비 · 첫 결제일)와 상태를 다시 맞춘다 — 내 DB 줄에도 같이 */
export async function resumLead(leadId: number, markPaid: boolean) {
  const sb = supabaseAdmin(); const { data } = await sb.from('meta_payments').select('kind,paid_on,amount,cost').eq('lead_id', leadId).is('canceled_at', null).order('paid_on');
  const list = data ?? []; const amt = list.reduce((s, p) => s + Number(p.amount), 0), cost = list.reduce((s, p) => s + Number(p.cost), 0); const firstPay = list.find(p => p.kind === '결제'); const now = new Date().toISOString();
  const up: Record<string, unknown> = { paid_amt: list.length ? amt : null, cost_amt: list.length ? cost : null, paid_at: firstPay ? `${firstPay.paid_on}T12:00:00+09:00` : null, updated_at: now }; if (markPaid && firstPay) { up.status = '결제'; up.last_contact_at = now; }
  await sb.from('meta_leads').update(up).eq('id', leadId); await sb.from('meta_leads').update({ first_contact_at: now }).eq('id', leadId).is('first_contact_at', null);
  const my: Record<string, unknown> = { paid_amt: up.paid_amt, cost_amt: up.cost_amt, updated_at: now }; if (markPaid && firstPay) { my.status = '결제'; my.paid_at = up.paid_at; }
  await sb.from('my_db').update(my).eq('meta_id', leadId);
}
const exVat = (n: number) => Math.round((Number(n) || 0) / 1.1);   // 정산요청 금액은 VAT 포함 → 결제 내역은 VAT 제외
/** 정산요청 접수 성공 → 결제 내역 한 줄. 요청구분 05 · 06(환불 계열)은 환불로. 돌려주는 값: 화면에 덧붙일 말 */
export async function payFromSettle(p: { userId: string; leadId: number; seq: string | null; reqDate: string; saleTotalAmt: number; prodTotalAmt: number; gubun: string; prodName: string }): Promise<string> {
  const sb = supabaseAdmin(); const { data: lead } = await sb.from('meta_leads').select('id,owner_id,name').eq('id', p.leadId).maybeSingle();
  if (!lead || lead.owner_id !== p.userId) return ' · ⚠ 인바운드 고객을 찾지 못해 결제 내역에는 넣지 못했습니다 (팀장에게 알려 주세요)';
  const refund = ['05', '06'].includes(p.gubun); const a = exVat(Math.abs(p.saleTotalAmt)), c = exVat(Math.abs(p.prodTotalAmt)); if (!a) return ' · ⚠ 판매총액이 0이라 결제 내역에는 넣지 않았습니다';
  const { error } = await sb.from('meta_payments').insert({ lead_id: lead.id, owner_id: p.userId, kind: refund ? '환불' : '결제', paid_on: p.reqDate, amount: refund ? -a : a, cost: refund ? 0 : c, product: p.prodName.slice(0, 80), memo: `정산요청 ${p.seq ?? '(번호 확인 전)'}`, settle_seq: p.seq, created_by: p.userId });
  if (error) return ` · ⚠ 결제 내역 등록 실패: ${/settle_seq/.test(error.message) ? '0106 SQL 을 먼저 실행해 주세요' : error.message.slice(0, 80)}`;
  await resumLead(lead.id, !refund); return ` · 인바운드 「${lead.name}」 결제 내역에 ${refund ? '환불' : '결제'} ${a.toLocaleString('ko-KR')}원(VAT 제외) 등록`;
}
/** 정산요청 취소 · 반려 → 그 정산번호로 들어간 결제 내역을 취소 표시 */
export async function payCancelBySettle(seq: string, by: string | null): Promise<boolean> {
  if (!seq) return false; const sb = supabaseAdmin(); const { data, error } = await sb.from('meta_payments').update({ canceled_at: new Date().toISOString(), canceled_by: by }).eq('settle_seq', seq).is('canceled_at', null).select('lead_id'); if (error || !data?.length) return false;
  for (const d of data) await resumLead(d.lead_id, false); return true;
}
/** 정산요청 화면에 보여줄 내 인바운드 고객 (메타팀만) */
export async function myMetaLeadOptions(userId: string): Promise<{ id: number; label: string }[]> {
  const { data } = await supabaseAdmin().from('meta_leads').select('id,name,phone,product,status,received_on').eq('owner_id', userId).not('status', 'in', '("중복","허수")').order('id', { ascending: false }).limit(1000);
  return (data ?? []).map(l => ({ id: l.id, label: `${l.name || '(이름 없음)'} · ${l.phone}${l.product ? ' · ' + l.product : ''}${l.status === '결제' ? ' · 결제 고객' : ''}` }));
}
