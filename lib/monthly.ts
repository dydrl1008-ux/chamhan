// 월간 계획서 — 데이터 조립 (서버). 숫자는 매출·재계약·영업활동만 자동, 판단·전략·변경은 팀장 글.
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, addDays, weekStartOf } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, prevBizMonth } from '@/lib/date/period';

export type Week = { no: number; start: string; end: string };
/** 업무월(21일~20일)을 월요일 기준 주차로 — 첫 주는 21일부터, 마지막 주는 20일까지 (보통 5주) */
export function bizWeeks(bm: string): Week[] {
  const [ms, me] = bizMonthRange(bm); const out: Week[] = []; let s = ms, n = 1;
  while (s <= me) { const e0 = addDays(weekStartOf(s), 6); const e = e0 > me ? me : e0; out.push({ no: n++, start: s, end: e }); s = addDays(e, 1); }
  return out;
}
export const weekOf = (weeks: Week[], d: string) => weeks.find(w => d >= w.start && d <= w.end)?.no ?? null;
export const n = (v: unknown) => { const x = Number(String(v ?? '0').replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : 0; };

export type MemberAuto = {
  user_id: string; name: string; position: string | null;
  prev: { margin: number; new_margin: number; keep_margin: number; calls: number; new_cnt: number; target: number; conv: number | null; avg_new: number | null };   // 지난달
  weeks: Record<number, { margin: number; new_margin: number; keep_margin: number; calls: number; new_cnt: number; days: number }>;        // 이달 주차별 실제
  month: { margin: number; new_margin: number; keep_margin: number; calls: number; new_cnt: number };
};

export async function loadPlan(teamId: number, bm: string) {
  const sb = supabaseServer(); const today = todayKST(); const [ms, me] = bizMonthRange(bm); const pbm = prevBizMonth(bm); const [pms, pme] = bizMonthRange(pbm);
  const weeks = bizWeeks(bm); const curWeek = weekOf(weeks, today);
  const [{ data: plan }, { data: members }, { data: kpi }, { data: pkpi }, { data: ptargets }, { data: pipes }, { data: types }, { data: slots }, { data: settings }, { data: team }] = await Promise.all([
    sb.from('monthly_plans').select('*').eq('team_id', teamId).eq('month', bm + '-01').maybeSingle(),
    sb.from('profiles').select('id,name,position,role').eq('team_id', teamId).eq('is_active', true).eq('role', 'staff').order('name'),
    sb.from('kpi_daily').select('user_id,work_date,margin,new_margin,calls,new_cnt').eq('team_id', teamId).gte('work_date', ms).lte('work_date', me),
    sb.from('kpi_daily').select('user_id,margin,new_margin,calls,new_cnt').eq('team_id', teamId).gte('work_date', pms).lte('work_date', pme),
    sb.from('monthly_targets').select('user_id,margin').eq('month', pbm + '-01'),
    sb.from('pipeline').select('id,owner_id,client,stage,expected_margin').eq('team_id', teamId).eq('is_active', true).order('id'),
    sb.from('activity_types').select('name,sort_order').eq('is_active', true).order('sort_order'),
    sb.rpc('slots_for_team', { p_from: ms, p_to: me, p_team: teamId }),
    sb.from('app_settings').select('key,value').in('key', ['plan_renew_weight_t', 'plan_alert_week_ratio', 'plan_alert_conv_mult', 'plan_alert_review_days']),
    sb.from('teams').select('id,name,leader_id').eq('id', teamId).maybeSingle(),
  ]);
  const set = Object.fromEntries((settings ?? []).map(s => [s.key, Number(s.value)]));
  const cfg = { wT: Number.isFinite(set.plan_renew_weight_t) ? set.plan_renew_weight_t : 0.5, weekRatio: set.plan_alert_week_ratio || 0.5, convMult: set.plan_alert_conv_mult || 1.5, reviewDays: set.plan_alert_review_days || 3 };
  const auto: MemberAuto[] = (members ?? []).map(m => {
    const rows = (kpi ?? []).filter(k => k.user_id === m.id); const prow = (pkpi ?? []).filter(k => k.user_id === m.id);
    const sum = (arr: any[], k: string) => arr.reduce((a, x) => a + Number(x[k] ?? 0), 0);
    const wk: MemberAuto['weeks'] = {};
    for (const w of weeks) { const r = rows.filter(x => x.work_date >= w.start && x.work_date <= w.end); const mg = sum(r, 'margin'), nm = sum(r, 'new_margin'); wk[w.no] = { margin: mg, new_margin: nm, keep_margin: mg - nm, calls: sum(r, 'calls'), new_cnt: sum(r, 'new_cnt'), days: r.length }; }
    const pm = sum(prow, 'margin'), pn = sum(prow, 'new_margin'), pc = sum(prow, 'calls'), pnc = sum(prow, 'new_cnt');
    const mm = sum(rows, 'margin'), mn = sum(rows, 'new_margin');
    return { user_id: m.id, name: m.name, position: m.position, prev: { margin: pm, new_margin: pn, keep_margin: pm - pn, calls: pc, new_cnt: pnc, target: Number(ptargets?.find(t => t.user_id === m.id)?.margin ?? 0), conv: pc ? pnc / pc : null, avg_new: pnc ? Math.round(pn / pnc) : null }, weeks: wk, month: { margin: mm, new_margin: mn, keep_margin: mm - mn, calls: sum(rows, 'calls'), new_cnt: sum(rows, 'new_cnt') } };
  });
  let detail: any = null;
  if (plan) {
    const pid = plan.id;
    const [w, mem, ren, pp, up, act, mw] = await Promise.all([
      sb.from('monthly_plan_weeks').select('*').eq('plan_id', pid).order('week_no'),
      sb.from('monthly_plan_members').select('*').eq('plan_id', pid),
      sb.from('monthly_plan_renewals').select('*').eq('plan_id', pid),
      sb.from('monthly_plan_pipes').select('*').eq('plan_id', pid),
      sb.from('monthly_plan_upsells').select('*').eq('plan_id', pid).order('id'),
      sb.from('monthly_plan_activities').select('*').eq('plan_id', pid),
      sb.from('monthly_plan_member_weeks').select('*').eq('plan_id', pid),
    ]);
    detail = { weeks: w.data ?? [], members: mem.data ?? [], renewals: ren.data ?? [], pipes: pp.data ?? [], upsells: up.data ?? [], activities: act.data ?? [], memberWeeks: mw.data ?? [] };
  }
  // 재계약 후보: 이달 종료 슬롯 (팀 범위) + 연장 여부(같은 고객·상품으로 종료일 이후 시작 건)
  const slotRows = (slots ?? []) as { user_id: string; settle_no: string; cust_name: string; prod_name: string; date_from: string; date_to: string; inflow_cnt: number | null; sale_total: number; status: string }[];
  const { data: future } = await sb.rpc('slots_for_team', { p_from: addDays(me, 1), p_to: addDays(me, 60), p_team: teamId });
  const all = [...slotRows, ...((future ?? []) as typeof slotRows)];
  const renewals = slotRows.map(r => { const key = `${(r.cust_name ?? '').trim()}|${(r.prod_name ?? '').trim()}`; const rn = all.find(o => o.settle_no !== r.settle_no && `${(o.cust_name ?? '').trim()}|${(o.prod_name ?? '').trim()}` === key && o.date_from > r.date_to); return { ...r, renewed: rn ? { date_from: rn.date_from, status: rn.status } : null, week_no: weekOf(weeks, r.date_to) }; });
  return { team: team ?? { id: teamId, name: '', leader_id: null }, bm, ms, me, weeks, curWeek, today, plan, detail, auto, pipes: (pipes ?? []).map(p => ({ ...p, amount: n(p.expected_margin) })), types: (types ?? []).map(t => t.name), renewals, cfg };
}
export type PlanData = Awaited<ReturnType<typeof loadPlan>>;

/** 팀 요약 (홈·전사 탭용): 목표·확정·이번 주 계획/실제·리뷰 상태 */
export function teamSummary(d: PlanData) {
  const target = (d.detail?.members ?? []).reduce((a: number, m: any) => a + n(m.renew_amt) + n(m.pipe_amt) + n(m.new_amt) + n(m.upsell_amt), 0);
  const confirmed = d.auto.reduce((a, m) => a + m.month.margin, 0);
  const lastDone = d.weeks.filter(w => w.end < d.today).at(-1);
  const wk = lastDone ? d.detail?.weeks?.find((w: any) => w.week_no === lastDone.no) : null;
  const lastPlan = n(wk?.plan_margin); const lastActual = lastDone ? d.auto.reduce((a, m) => a + (m.weeks[lastDone.no]?.margin ?? 0), 0) : 0;
  const reviewDue = lastDone ? addDays(lastDone.end, 1) : null; const reviewed = !!wk?.reviewed_at;
  const overdue = reviewDue && !reviewed ? Math.round((new Date(d.today + 'T00:00:00Z').getTime() - new Date(reviewDue + 'T00:00:00Z').getTime()) / 864e5) : 0;
  return { target, confirmed, pct: target ? Math.round(confirmed / target * 100) : 0, lastWeek: lastDone, lastPlan, lastActual, lastRatio: lastPlan ? lastActual / lastPlan : null, reviewed, overdue, status: d.plan?.status ?? null, hasPlan: !!d.plan };
}
