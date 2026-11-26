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
/** 정산요청 접수 성공 → 결제 내역 한 줄. 돈이 들어온 때를 결제로 본다(선입금 기준):
 *   · 선입금(05) · 선입금 연장(06) → 결제 금액 = 판매총액
 *   · 킵을 써서 넣은 슬롯 → 결제 금액 = 입금예정(판매총액 − 사용한 킵). 전액 킵이면 0원 「킵 사용」 — 상품비만 잡힌다 (돈은 선입금 때 이미 잡혔으므로 두 번 세지 않는다)
 *   · 킵 없이 그때 입금받는 건 → 결제 금액 = 판매총액
 *   상품비 = 상품총액. 금액은 모두 VAT 제외로 환산. 돌려주는 값: 화면에 덧붙일 말 */
export async function payFromSettle(p: { userId: string; leadId: number; seq: string | null; reqDate: string; cashAmt: number; prodTotalAmt: number; useMileage: number; gubunName: string; prodName: string }): Promise<string> {
  const sb = supabaseAdmin(); const { data: lead } = await sb.from('meta_leads').select('id,owner_id,name').eq('id', p.leadId).maybeSingle();
  if (!lead || lead.owner_id !== p.userId) return ' · ⚠ 인바운드 고객을 찾지 못해 결제 내역에는 넣지 못했습니다 (팀장에게 알려 주세요)';
  const a = exVat(Math.max(0, p.cashAmt)), c = exVat(Math.abs(p.prodTotalAmt)); if (!a && !c) return ' · ⚠ 금액이 0이라 결제 내역에는 넣지 않았습니다';
  const kind = a > 0 ? '결제' : '사용'; const memo = [`정산요청 ${p.seq ?? '(번호 확인 전)'}`, p.gubunName, p.useMileage > 0 ? `킵 사용 ${Math.round(p.useMileage).toLocaleString('ko-KR')}(VAT 포함)` : ''].filter(Boolean).join(' · ').slice(0, 200);
  const { error } = await sb.from('meta_payments').insert({ lead_id: lead.id, owner_id: p.userId, kind, paid_on: p.reqDate, amount: a, cost: c, product: p.prodName.slice(0, 80), memo, settle_seq: p.seq, created_by: p.userId });
  if (error) return ` · ⚠ 결제 내역 등록 실패: ${/settle_seq/.test(error.message) ? '0106 SQL 을 먼저 실행해 주세요' : error.message.slice(0, 80)}`;
  await resumLead(lead.id, kind === '결제'); return kind === '결제' ? ` · 인바운드 「${lead.name}」 결제 ${a.toLocaleString('ko-KR')}원(VAT 제외) 등록` : ` · 인바운드 「${lead.name}」 킵 사용 건 — 상품비 ${c.toLocaleString('ko-KR')}원만 등록 (결제는 선입금 때 잡힘)`;
}
/** 환불요청 접수 성공 → 원 정산 건이 인바운드 결제 내역에 있으면 환불 한 줄. 환불킵(04)은 돈이 나가지 않고 고객 킵으로 돌아가므로 결제 금액은 그대로, 상품비만 되돌린다. 그 밖(선입금 환불 07 등)은 환불 금액만큼 결제 금액에서 뺀다 */
export async function refundFromSettle(p: { userId: string; origSeq: string; refundSeq: string | null; refundDate: string; refundSale: number; refundProd: number; gubun: string }): Promise<string> {
  const sb = supabaseAdmin(); const { data: orig, error } = await sb.from('meta_payments').select('lead_id,owner_id,product').eq('settle_seq', p.origSeq).maybeSingle(); if (error || !orig) return '';   // 인바운드 건이 아니면 아무것도 안 한다
  const keep = p.gubun === '04'; const a = keep ? 0 : exVat(Math.abs(p.refundSale)), c = exVat(Math.abs(p.refundProd)); if (!a && !c) return '';
  const { error: e2 } = await sb.from('meta_payments').insert({ lead_id: orig.lead_id, owner_id: orig.owner_id ?? p.userId, kind: '환불', paid_on: p.refundDate, amount: -a, cost: -c, product: orig.product ?? '', memo: [`환불요청 ${p.refundSeq ?? '(번호 확인 전)'}`, `원 정산 ${p.origSeq}`, keep ? '환불킵 — 고객 킵으로 적립(돈은 안 나감)' : ''].filter(Boolean).join(' · ').slice(0, 200), settle_seq: p.refundSeq ? `R:${p.refundSeq}` : null, created_by: p.userId });
  if (e2) return ` · ⚠ 인바운드 환불 기록 실패: ${e2.message.slice(0, 80)}`;
  await resumLead(orig.lead_id, false); return keep ? ` · 인바운드 결제 내역에 환불킵 기록 (결제 금액은 그대로, 상품비 ${c.toLocaleString('ko-KR')}원 되돌림)` : ` · 인바운드 결제 내역에 환불 ${a.toLocaleString('ko-KR')}원(VAT 제외) 기록`;
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
