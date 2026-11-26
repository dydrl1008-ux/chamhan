// 메타 보고 — 숫자는 인바운드 DB(meta_leads)에서 자동 집계, 사람은 글만 쓴다. 일일: 사원 본인 / 주간: 팀장(팀 전체)
import { supabaseAdmin } from '@/lib/supabase/admin';
import { addDays } from '@/lib/date/kst';
export * from './metaReportShared';
import type { DailyAuto, WeekLine, WeeklyAuto } from './metaReportShared';
const kday = (t: string | null) => t ? new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : '';
async function leadsOf(filter: (q: any) => any, cols: string): Promise<any[]> {
  const sb = supabaseAdmin(); const out: any[] = [];
  for (let f = 0; f < 30000; f += 1000) { const { data, error } = await filter(sb.from('meta_leads').select(cols)).order('id').range(f, f + 999); if (error) throw new Error(/cost_amt/.test(error.message) ? '0102 SQL(상품비 칸 · 메타 보고)을 먼저 실행해 주세요' : error.message); out.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  return out;
}
/** 한 사람의 하루 숫자 */
export async function dailyAuto(userId: string, day: string): Promise<DailyAuto> {
  const rows = await leadsOf(q => q.eq('owner_id', userId), 'status,paid_amt,cost_amt,paid_at,next_on,assigned_at,updated_at');
  const a: DailyAuto = { assigned: 0, handled: 0, by: {}, paid: 0, paidAmt: 0, costAmt: 0, margin: 0, noCost: 0, waiting: 0, tomorrow: 0 }; const tm = addDays(day, 1);
  for (const r of rows) {
    if (kday(r.assigned_at) === day) a.assigned++; if (r.status === '미연락') a.waiting++; if (r.next_on === tm) a.tomorrow++;
    if (r.status !== '미연락' && kday(r.updated_at) === day) { a.handled++; a.by[r.status] = (a.by[r.status] ?? 0) + 1; }
  }
  { const { data: pays, error } = await supabaseAdmin().from('meta_payments').select('amount,cost,kind').eq('owner_id', userId).eq('paid_on', day).is('canceled_at', null); if (error) throw new Error(/meta_payments/.test(error.message) ? '0105 SQL(결제 내역 · 월 마감)을 먼저 실행해 주세요' : error.message);
    for (const p of pays ?? []) { if (p.kind === '결제') a.paid++; a.paidAmt += Number(p.amount); a.costAmt += Number(p.cost); if (p.kind === '결제' && !Number(p.cost)) a.noCost++; } }   // 오늘 결제(1차 · 재결제 모두) — 결제 내역 기준
  a.margin = a.paidAmt - a.costAmt; return a;
}
/** 팀 전체의 한 주(월~일, 들어온 날 기준) 숫자 */
export async function weeklyAuto(from: string, people: { id: string; name: string }[]): Promise<WeeklyAuto> {
  const to = addDays(from, 6); const rows = await leadsOf(q => q.gte('received_on', from).lte('received_on', to), 'owner_id,source,status,paid_amt,cost_amt');
  const cut = new Date(Date.now() - 24 * 3600e3).toISOString(); const stale = await leadsOf(q => q.eq('status', '미연락').not('owner_id', 'is', null).lt('assigned_at', cut), 'owner_id');
  const mk = (id: string, name: string): WeekLine => ({ id, name, n: 0, valid: 0, reached: 0, paid: 0, amt: 0, cost: 0, stale: stale.filter(s => s.owner_id === id).length });
  const by = new Map<string, WeekLine>(people.map(p => [p.id, mk(p.id, p.name)])); const src = new Map<string, { name: string; valid: number; paid: number }>(); let junk = 0;
  for (const r of rows) { const k = r.owner_id ?? 'none'; if (!by.has(k)) by.set(k, mk(k, k === 'none' ? '미배정' : '(팀 밖)')); const g = by.get(k)!; g.n++;
    if (r.status === '허수' || r.status === '중복') { junk++; continue; } g.valid++; if (r.status !== '미연락' && r.status !== '부재') g.reached++;
    if (!src.has(r.source)) src.set(r.source, { name: r.source, valid: 0, paid: 0 }); const s = src.get(r.source)!; s.valid++;
    if (r.status === '결제') { g.paid++; s.paid++; } }
  { const { data: pays, error } = await supabaseAdmin().from('meta_payments').select('owner_id,amount,cost').gte('paid_on', from).lte('paid_on', to).is('canceled_at', null).limit(5000); if (error) throw new Error(/meta_payments/.test(error.message) ? '0105 SQL(결제 내역 · 월 마감)을 먼저 실행해 주세요' : error.message);
    for (const p of pays ?? []) { const k = p.owner_id ?? 'none'; if (!by.has(k)) by.set(k, mk(k, k === 'none' ? '미배정' : '(팀 밖)')); const g = by.get(k)!; g.amt += Number(p.amount); g.cost += Number(p.cost); } }   // 그 주에 결제한 금액 (재결제 포함)
  return { lines: [...by.values()], src: [...src.values()], total: rows.length, junk };
}
