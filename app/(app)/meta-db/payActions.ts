'use server';
// 메타 결제 내역 — 한 건에 1차 · 2차 · 3차 … 여러 번. 금액은 VAT 제외. 넣는 사람: 담당자 본인 / 메타팀 팀장 / 총괄. 잘못 넣은 건은 지우지 않고 취소 표시
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { metaAccess } from '@/lib/meta';
import { todayKST } from '@/lib/date/kst';
import { bizMonthOf, bizLabel } from '@/lib/date/period';
import { computeMetaStats, isClosedDay, statsSqlMsg } from '@/lib/metaStats';
import { metaPeople } from './actions';
type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
export type MetaPay = { id: number; lead_id: number; owner_id: string | null; kind: string; paid_on: string; amount: number; cost: number; product: string; memo: string; canceled_at: string | null; created_at: string; by?: string };
const COLS = 'id,lead_id,owner_id,kind,paid_on,amount,cost,product,memo,canceled_at,created_by,created_at';
async function gate(leadId: number) {
  const me = await getProfile(); if (!me || !me.is_active) return null; const a = await metaAccess(me); if (!a.ok) return null;
  const { data: lead } = await supabaseAdmin().from('meta_leads').select('id,owner_id,status,product,name').eq('id', leadId).maybeSingle(); if (!lead) return null;
  if (!a.lead && lead.owner_id !== me.id) return null; return { me, a, lead };
}
/** 결제 내역이 바뀌면 건의 합계(결제 금액 · 상품비 · 첫 결제일)와 상태를 다시 맞춘다 — 내 DB 줄에도 같이 */
async function resum(leadId: number, markPaid: boolean) {
  const sb = supabaseAdmin(); const { data } = await sb.from('meta_payments').select('kind,paid_on,amount,cost').eq('lead_id', leadId).is('canceled_at', null).order('paid_on');
  const list = data ?? []; const amt = list.reduce((s, p) => s + Number(p.amount), 0), cost = list.reduce((s, p) => s + Number(p.cost), 0); const firstPay = list.find(p => p.kind === '결제');
  const up: Record<string, unknown> = { paid_amt: list.length ? amt : null, cost_amt: list.length ? cost : null, paid_at: firstPay ? `${firstPay.paid_on}T12:00:00+09:00` : null, updated_at: new Date().toISOString() }; if (markPaid && firstPay) up.status = '결제';
  await sb.from('meta_leads').update(up).eq('id', leadId);
  const my: Record<string, unknown> = { paid_amt: up.paid_amt, cost_amt: up.cost_amt, updated_at: up.updated_at }; if (markPaid && firstPay) { my.status = '결제'; my.paid_at = up.paid_at; }
  await sb.from('my_db').update(my).eq('meta_id', leadId);
}
export async function mpList(leadId: number): Promise<R<{ rows: MetaPay[]; name: string; product: string }>> {
  const g = await gate(leadId); if (!g) return { ok: false, msg: '권한 없음' }; const sb = supabaseAdmin();
  const { data, error } = await sb.from('meta_payments').select(COLS).eq('lead_id', leadId).order('paid_on').order('id'); if (error) return { ok: false, msg: statsSqlMsg(error.message) };
  const ids = [...new Set((data ?? []).map((p: any) => p.created_by).filter(Boolean))]; const { data: ppl } = ids.length ? await sb.from('profiles').select('id,name').in('id', ids) : { data: [] as any[] }; const nm = new Map((ppl ?? []).map((p: any) => [p.id, p.name]));
  return { ok: true, msg: '', rows: (data ?? []).map((p: any) => ({ ...p, by: nm.get(p.created_by) ?? '' })), name: g.lead.name, product: g.lead.product };
}
export async function mpAdd(leadId: number, p: { kind?: string; paid_on?: string; amount: number; cost?: number; product?: string; memo?: string }): Promise<R> {
  const g = await gate(leadId); if (!g) return { ok: false, msg: '권한 없음' }; if (!g.lead.owner_id) return { ok: false, msg: '담당자를 먼저 배정해 주세요' };
  const today = todayKST(); const day = /^\d{4}-\d{2}-\d{2}$/.test(p.paid_on ?? '') ? p.paid_on! : today; if (day > today) return { ok: false, msg: '결제일이 오늘보다 뒤입니다' };
  const refund = p.kind === '환불'; const n = Math.round(Math.abs(Number(p.amount) || 0)); const c = Math.round(Math.abs(Number(p.cost) || 0)); if (!n || n > 1e11) return { ok: false, msg: '금액을 넣어 주세요 (VAT 제외)' }; if (!refund && c > n) return { ok: false, msg: '상품비가 결제 금액보다 큽니다 — 다시 확인해 주세요' };
  if (!g.a.boss && await isClosedDay(day)) return { ok: false, msg: `${bizLabel(bizMonthOf(day))} 은 마감되었습니다 — 마감된 달의 결제는 총괄만 넣을 수 있습니다` };
  const { error } = await supabaseAdmin().from('meta_payments').insert({ lead_id: leadId, owner_id: g.lead.owner_id, kind: refund ? '환불' : '결제', paid_on: day, amount: refund ? -n : n, cost: refund ? -c : c, product: String(p.product ?? g.lead.product ?? '').trim().slice(0, 80), memo: String(p.memo ?? '').trim().slice(0, 500), created_by: g.me.id });
  if (error) return { ok: false, msg: statsSqlMsg(error.message) };
  await resum(leadId, !refund); revalidatePath('/meta-stats'); return { ok: true, msg: refund ? '환불을 기록했습니다' : '결제를 추가했습니다' };
}
export async function mpCancel(payId: number): Promise<R> {
  const sb = supabaseAdmin(); const { data: pay } = await sb.from('meta_payments').select('id,lead_id,paid_on,canceled_at').eq('id', payId).maybeSingle(); if (!pay) return { ok: false, msg: '없는 결제 내역' }; if (pay.canceled_at) return { ok: false, msg: '이미 취소된 내역입니다' };
  const g = await gate(pay.lead_id); if (!g) return { ok: false, msg: '권한 없음' };
  if (!g.a.boss && await isClosedDay(pay.paid_on)) return { ok: false, msg: '마감된 달의 결제는 총괄만 취소할 수 있습니다' };
  const { error } = await sb.from('meta_payments').update({ canceled_at: new Date().toISOString(), canceled_by: g.me.id }).eq('id', payId); if (error) return { ok: false, msg: error.message };
  await resum(pay.lead_id, false); revalidatePath('/meta-stats'); return { ok: true, msg: '취소 표시했습니다 (기록은 남습니다)' };
}
/** 회사월 마감 / 마감 취소 — 총괄 · 어드민만. 마감하면 그 달 효율 숫자를 그대로 저장한다 */
export async function metaClose(month: string, on: boolean): Promise<R> {
  const me = await getProfile(); if (!me || !me.is_active) return { ok: false, msg: '권한 없음' }; const a = await metaAccess(me); if (!a.boss) return { ok: false, msg: '총괄만 마감할 수 있습니다' };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, msg: '월이 올바르지 않습니다' }; const sb = supabaseAdmin();
  if (!on) { const { error } = await sb.from('meta_closings').delete().eq('month', month); if (error) return { ok: false, msg: statsSqlMsg(error.message) }; revalidatePath('/meta-stats'); return { ok: true, msg: '마감을 취소했습니다 — 다시 실시간 숫자로 보입니다' }; }
  if (month >= bizMonthOf(todayKST())) return { ok: false, msg: '아직 끝나지 않은 달입니다 — 20일이 지난 뒤에 마감해 주세요' };
  try { const snapshot = await computeMetaStats(month, await metaPeople()); const { error } = await sb.from('meta_closings').upsert({ month, snapshot, closed_by: me.id, closed_at: new Date().toISOString() }, { onConflict: 'month' }); if (error) return { ok: false, msg: statsSqlMsg(error.message) }; }
  catch (e: any) { return { ok: false, msg: statsSqlMsg(String(e?.message ?? e)) }; }
  revalidatePath('/meta-stats'); return { ok: true, msg: `${bizLabel(month)} 마감 — 이 숫자로 고정됩니다` };
}
