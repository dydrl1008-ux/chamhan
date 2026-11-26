// 메타 효율 집계 — 화면과 월 마감(저장본)이 같은 계산을 쓴다.
//   받은 DB · 유효 · 연결 · 결제율 = 그 회사월(21일~20일)에 「들어온」 DB 기준
//   결제 금액 · 상품비 · 마진 = 그 회사월에 「결제한」 내역 기준 (결제 시점 담당자의 실적). 1차 = 신규, 2차 이상 = 재결제
import { supabaseAdmin } from '@/lib/supabase/admin';
import { bizMonthRange } from '@/lib/date/period';
export type StatLine = { key: string; name: string; staff: boolean; n: number; valid: number; wait: number; reached: number; paidLeads: number; newCnt: number; newAmt: number; reCnt: number; reAmt: number; refund: number; amt: number; cost: number; cohortAmt: number };
export type MetaStats = { month: string; from: string; to: string; spend: number; unit: number; lines: StatLine[]; tot: StatLine; src: { name: string; n: number; valid: number; reached: number; paidLeads: number; cohortAmt: number }[]; at: string };
const blank = (key: string, name: string, staff = false): StatLine => ({ key, name, staff, n: 0, valid: 0, wait: 0, reached: 0, paidLeads: 0, newCnt: 0, newAmt: 0, reCnt: 0, reAmt: 0, refund: 0, amt: 0, cost: 0, cohortAmt: 0 });
async function all(table: string, cols: string, f: (q: any) => any): Promise<any[]> {
  const sb = supabaseAdmin(); const out: any[] = []; for (let i = 0; i < 100000; i += 1000) { const { data, error } = await f(sb.from(table).select(cols)).order('id').range(i, i + 999); if (error) throw new Error(error.message); out.push(...(data ?? [])); if ((data ?? []).length < 1000) break; } return out;
}
export const statsSqlMsg = (m: string) => /meta_payments|meta_closings/.test(m) ? '0105 SQL(결제 내역 · 월 마감)을 먼저 실행해 주세요' : /cost_amt/.test(m) ? '0102 SQL 을 먼저 실행해 주세요' : /meta_leads/.test(m) ? '0100 SQL(메타팀 표)을 먼저 실행해 주세요' : m;
export async function computeMetaStats(month: string, people: { id: string; name: string; role: string }[]): Promise<MetaStats> {
  const [from, to] = bizMonthRange(month); const sb = supabaseAdmin();
  const leads = await all('meta_leads', 'id,owner_id,source,status', q => q.gte('received_on', from).lte('received_on', to));
  const pays = (await all('meta_payments', 'id,lead_id,owner_id,kind,paid_on,amount,cost', q => q.is('canceled_at', null))).sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.id - b.id);
  const { data: sp } = await sb.from('meta_ad_spend').select('amount').eq('month', month).eq('source', '전체').maybeSingle(); const spend = Number(sp?.amount ?? 0);
  const by = new Map<string, StatLine>(people.map(p => [p.id, blank(p.id, p.name + (p.role === 'manager' ? ' (팀장)' : ''), true)])); const tot = blank('tot', '합계');
  const line = (k: string | null) => { const key = k ?? 'none'; if (!by.has(key)) by.set(key, blank(key, key === 'none' ? '미배정' : '(팀 밖 · 퇴사)')); return by.get(key)!; };
  const first = new Map<number, number>(); const sumOf = new Map<number, number>();   // 건별 첫 결제 id · 지금까지 낸 금액
  for (const p of pays) { if (p.kind === '결제' && !first.has(p.lead_id)) first.set(p.lead_id, p.id); sumOf.set(p.lead_id, (sumOf.get(p.lead_id) ?? 0) + Number(p.amount)); }
  const src = new Map<string, MetaStats['src'][number]>();
  for (const l of leads) { const g = line(l.owner_id); const s = src.get(l.source) ?? { name: l.source, n: 0, valid: 0, reached: 0, paidLeads: 0, cohortAmt: 0 }; src.set(l.source, s);
    for (const x of [g, tot]) x.n++; s.n++; if (l.status === '허수' || l.status === '중복') continue;
    const reached = l.status !== '미연락' && l.status !== '부재'; const paid = first.has(l.id); const c = sumOf.get(l.id) ?? 0;
    for (const x of [g, tot]) { x.valid++; if (l.status === '미연락') x.wait++; if (reached) x.reached++; if (paid) x.paidLeads++; x.cohortAmt += c; }
    s.valid++; if (reached) s.reached++; if (paid) s.paidLeads++; s.cohortAmt += c; }
  for (const p of pays) { if (p.paid_on < from || p.paid_on > to) continue; const g = line(p.owner_id); const a = Number(p.amount), c = Number(p.cost);
    for (const x of [g, tot]) { x.amt += a; x.cost += c; if (p.kind === '환불') x.refund += a; else if (p.kind !== '결제') { /* 킵 사용 — 상품비만 */ } else if (first.get(p.lead_id) === p.id) { x.newCnt++; x.newAmt += a; } else { x.reCnt++; x.reAmt += a; } } }
  const lines = [...by.values()].filter(l => l.staff || l.n || l.amt || l.newCnt || l.reCnt).sort((a, b) => Number(b.staff) - Number(a.staff));
  return { month, from, to, spend, unit: tot.valid ? spend / tot.valid : 0, lines, tot, src: [...src.values()], at: new Date().toISOString() };
}
/** 마감된 달이면 저장본 */
export async function closedStats(month: string): Promise<{ snapshot: MetaStats; closed_at: string; closed_by: string | null } | null> {
  const { data, error } = await supabaseAdmin().from('meta_closings').select('snapshot,closed_at,closed_by').eq('month', month).maybeSingle(); if (error) throw new Error(error.message); return data ? (data as any) : null;
}
export async function isClosedDay(day: string): Promise<boolean> {
  const { bizMonthOf } = await import('@/lib/date/period'); const { data } = await supabaseAdmin().from('meta_closings').select('month').eq('month', bizMonthOf(day)).maybeSingle(); return !!data;
}
