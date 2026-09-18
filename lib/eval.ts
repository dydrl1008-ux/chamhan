import { supabaseServer } from '@/lib/supabase/server';
import { evalPromotion, incentiveOf, monthsBetween, scopeFor, isTeamScope, type Criteria, type Tier } from '@/lib/rules';
import { bizMonthOf } from '@/lib/date/period';
export type PersonEval = { id: string; name: string; position: string | null; team_id: number | null; role: string; hired_at: string | null; monthMargin: number; yearMargin: number; newMargin: number; consecutiveOk: boolean; late: number; absent: number; sick: number; tenure: number; promo: ReturnType<typeof evalPromotion>; inc: ReturnType<typeof incentiveOf> };
/** RLS 범위 내 인원의 진급·인센티브 평가 (총괄·어드민=전사, 팀장=팀, 직원=본인) */
export async function evaluatePeople(today: string, onlyUser?: string) {
  const sb = supabaseServer(); const bm = bizMonthOf(today); const ms = bm + '-01'; const year = Number(today.slice(0, 4));
  const [{ data: people }, { data: mm }, { data: ly }, { data: lm }, { data: crit }, { data: tiers }, { data: set }, { data: teams }] = await Promise.all([
    onlyUser ? sb.from('profiles').select('id,name,position,team_id,role,hired_at').eq('id', onlyUser) : sb.from('profiles').select('id,name,position,team_id,role,hired_at').eq('is_active', true).in('role', ['staff', 'manager']).order('team_id').order('name'),
    sb.from('v_margin_monthly').select('user_id,team_id,month,margin,new_margin').gte('month', `${year}-01-01`),
    sb.from('v_leave_yearly').select('user_id,late_cnt,absent_cnt,sick_cnt').eq('year', year),
    sb.from('v_leave_monthly').select('user_id,late_cnt,absent_cnt,sick_cnt').eq('month', ms),
    sb.from('promotion_criteria').select('*').eq('is_active', true).order('sort_order'),
    sb.from('incentive_tiers').select('*').eq('is_active', true).order('sort_order'),
    sb.from('app_settings').select('key,value').in('key', ['new_margin_bonus_rate', 'incentive_team_scopes']),
    sb.from('teams').select('id,name'),
  ]);
  const newRate = Number(set?.find(s => s.key === 'new_margin_bonus_rate')?.value ?? 0);
  const teamScopes = String(set?.find(s => s.key === 'incentive_team_scopes')?.value ?? '').split(',').map((x: string) => x.trim()).filter(Boolean);
  const T = (tiers ?? []) as Tier[]; const C = (crit ?? []) as Criteria[];
  const prevMonths = (n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(Number(bm.slice(0, 4)), Number(bm.slice(5, 7)) - 1 - i, 1)); return d.toISOString().slice(0, 10); });
  const out: PersonEval[] = (people ?? []).map(p => {
    const rows = (mm ?? []).filter(x => x.user_id === p.id);
    const scope = scopeFor(T, p.position, p.role); const isMgr = isTeamScope(scope, teamScopes);
    const teamRows = isMgr ? (mm ?? []).filter(x => x.team_id === p.team_id) : [];
    const monthMargin = isMgr ? teamRows.filter(x => x.month === ms).reduce((a, x) => a + Number(x.margin), 0) : Number(rows.find(x => x.month === ms)?.margin ?? 0);
    const yearMargin = rows.reduce((a, x) => a + Number(x.margin), 0);
    const newMargin = Number(rows.find(x => x.month === ms)?.new_margin ?? 0);
    const c = C.find(x => x.from_position === p.position) ?? null;
    // 연속 N개월: 진행 중인 이달은 제외하고 직전 완료된 N개월로 판정
    const consecutiveOk = c ? prevMonths(c.consecutive_months + 1).slice(1).every(mo => Number(rows.find(x => x.month === mo)?.margin ?? 0) >= Number(c.monthly_margin_min)) : true;
    const y = (ly ?? []).find(x => x.user_id === p.id); const m = (lm ?? []).find(x => x.user_id === p.id);
    const late = Number(m?.late_cnt ?? 0), absent = Number(y?.absent_cnt ?? 0), sick = Number(m?.sick_cnt ?? 0);
    const tenure = monthsBetween(p.hired_at, today);
    return { ...p, monthMargin, yearMargin, newMargin, consecutiveOk, late, absent, sick, tenure, promo: evalPromotion(c, { monthMargin, yearMargin, consecutiveOk, late, absent, sick, tenure }), inc: incentiveOf(T, scope, monthMargin, newMargin, newRate, isMgr) };
  });
  return { people: out, tiers: T, criteria: C, newRate, teams: teams ?? [], teamScopes };
}
