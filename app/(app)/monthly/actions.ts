'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { bizWeeks, n } from '@/lib/monthly';
type R = { ok: boolean; msg: string };
const canEdit = (me: { role: string; team_id: number | null }, team: number) => me.role === 'admin' || (me.role === 'manager' && me.team_id === team);

export type MemberState = {
  renew: Record<string, 'o' | 't' | 'x'>;                       // settle_no → mark
  pipes: Record<string, { checked: boolean; week_no: number | null }>;   // pipeline_id → 체크
  upsells: { cust_name: string; proposal: string; amount: number; week_no: number | null }[];
  activities: { activity: string; plan: Record<string, number>; actual: Record<string, number> }[];
  weeks: Record<string, { new_cnt: number; new_amt: number; keep_amt: number; goal: string; tried: string; judged: string; changed: string }>;
  verdict: string; strategy: string; target_note: string;
};
export type PlanState = {
  strategy: string;
  weeks: Record<string, { plan_margin: number; issue: string; fix: string; focus: string; support: string; risk: string }>;
  members: Record<string, MemberState>;
};
type RenewRef = { settle_no: string; user_id: string; cust_name: string; prod_name: string; amount: number; date_to: string };
type PipeRef = { id: number; owner_id: string; amount: number };

export async function savePlan(teamId: number, bm: string, st: PlanState, refs: { renewals: RenewRef[]; pipes: PipeRef[]; weightT: number }, mode: 'save' | 'submit' | 'review'): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!canEdit(me, teamId)) return { ok: false, msg: '해당 팀 팀장만 작성할 수 있습니다' };
  if (!/^\d{4}-\d{2}$/.test(bm)) return { ok: false, msg: '월 형식 오류' };
  const sb = supabaseServer(); const month = bm + '-01'; const weeks = bizWeeks(bm);
  const { data: ex } = await sb.from('monthly_plans').select('id,status').eq('team_id', teamId).eq('month', month).maybeSingle();
  let pid = ex?.id as number | undefined;
  const patch: Record<string, unknown> = { strategy: st.strategy ?? '', updated_at: new Date().toISOString() };
  if (mode === 'submit') { patch.status = 'submitted'; patch.submitted_at = new Date().toISOString(); }
  if (mode === 'review') patch.last_review_at = new Date().toISOString();
  if (pid) { const { error } = await sb.from('monthly_plans').update(patch).eq('id', pid); if (error) return { ok: false, msg: error.message }; }
  else { const { data, error } = await sb.from('monthly_plans').insert({ team_id: teamId, month, created_by: me.id, ...patch }).select('id').single(); if (error) return { ok: false, msg: error.message }; pid = data.id; }
  // 멤버 금액 계산
  const w = (m: 'o' | 't' | 'x') => m === 'o' ? 1 : m === 't' ? refs.weightT : 0;
  const memberRows: any[] = [], renewRows: any[] = [], pipeRows: any[] = [], upRows: any[] = [], actRows: any[] = [], mwRows: any[] = [];
  for (const [uid, m] of Object.entries(st.members ?? {})) {
    const myRen = refs.renewals.filter(r => r.user_id === uid); let renew = 0;
    for (const r of myRen) { const mk = m.renew?.[r.settle_no] ?? 'o'; renew += Math.round(n(r.amount) * w(mk)); renewRows.push({ plan_id: pid, user_id: uid, settle_no: r.settle_no, cust_name: r.cust_name, prod_name: r.prod_name, amount: n(r.amount), date_to: r.date_to, mark: mk }); }
    let pipe = 0;
    for (const p of refs.pipes.filter(x => x.owner_id === uid)) { const c = m.pipes?.[String(p.id)]; if (c?.checked) pipe += n(p.amount); pipeRows.push({ plan_id: pid, pipeline_id: p.id, user_id: uid, checked: !!c?.checked, amount: n(p.amount), week_no: c?.week_no ?? null }); }
    const upsell = (m.upsells ?? []).reduce((a, u) => a + n(u.amount), 0);
    for (const u of (m.upsells ?? []).filter(u => u.cust_name?.trim())) upRows.push({ plan_id: pid, user_id: uid, cust_name: u.cust_name.trim(), proposal: u.proposal ?? '', amount: n(u.amount), week_no: u.week_no ?? null });
    const newAmt = Object.values(m.weeks ?? {}).reduce((a, x) => a + n(x.new_amt), 0);
    for (const a of (m.activities ?? []).filter(a => a.activity?.trim())) actRows.push({ plan_id: pid, user_id: uid, activity: a.activity.trim(), plan: a.plan ?? {}, actual: a.actual ?? {} });
    for (const wk of weeks) { const x = m.weeks?.[String(wk.no)]; if (!x) continue; mwRows.push({ plan_id: pid, user_id: uid, week_no: wk.no, new_cnt: n(x.new_cnt), new_amt: n(x.new_amt), keep_amt: n(x.keep_amt), goal: x.goal ?? '', tried: x.tried ?? '', judged: x.judged ?? '', changed: x.changed ?? '' }); }
    memberRows.push({ plan_id: pid, user_id: uid, renew_amt: renew, pipe_amt: pipe, new_amt: newAmt, upsell_amt: upsell, verdict: m.verdict ?? '', strategy: m.strategy ?? '', target_note: m.target_note ?? '' });
  }
  const weekRows = weeks.map(wk => { const x = st.weeks?.[String(wk.no)]; const reviewedBefore = mode === 'review' && wk.end < new Date().toISOString().slice(0, 10); return { plan_id: pid, week_no: wk.no, start_date: wk.start, end_date: wk.end, plan_margin: n(x?.plan_margin), issue: x?.issue ?? '', fix: x?.fix ?? '', focus: x?.focus ?? '', support: x?.support ?? '', risk: x?.risk ?? '', ...(reviewedBefore && (x?.issue || x?.fix) ? { reviewed_at: new Date().toISOString() } : {}) }; });
  // 자식 테이블: 지우고 다시 넣기 (plan 단위)
  for (const t of ['monthly_plan_renewals', 'monthly_plan_pipes', 'monthly_plan_upsells', 'monthly_plan_activities', 'monthly_plan_member_weeks', 'monthly_plan_members']) { const { error } = await sb.from(t).delete().eq('plan_id', pid); if (error) return { ok: false, msg: `${t} 정리 실패: ${error.message}` }; }
  const ins = async (t: string, rows: any[]) => { if (!rows.length) return null; const { error } = await sb.from(t).insert(rows); return error ? `${t} 저장 실패: ${error.message}` : null; };
  for (const [t, rows] of [['monthly_plan_members', memberRows], ['monthly_plan_renewals', renewRows], ['monthly_plan_pipes', pipeRows], ['monthly_plan_upsells', upRows], ['monthly_plan_activities', actRows], ['monthly_plan_member_weeks', mwRows]] as const) { const e = await ins(t, rows as any[]); if (e) return { ok: false, msg: e }; }
  { const { error } = await sb.from('monthly_plan_weeks').upsert(weekRows, { onConflict: 'plan_id,week_no' }); if (error) return { ok: false, msg: `주차 저장 실패: ${error.message}` }; }
  // 개인 목표 → monthly_targets (①+②+③+④)
  const tRows = memberRows.map(m => ({ month, user_id: m.user_id, team_id: null, margin: m.renew_amt + m.pipe_amt + m.new_amt + m.upsell_amt })).filter(x => x.margin > 0);
  if (tRows.length) { const { error } = await sb.from('monthly_targets').upsert(tRows, { onConflict: 'month,user_id' }); if (error) return { ok: false, msg: `개인 목표 반영 실패: ${error.message}` }; }
  ['/monthly', '/', '/overview', '/margin'].forEach(p => revalidatePath(p));
  return { ok: true, msg: mode === 'submit' ? '계획서 제출 완료 — 개인 목표 반영됨' : mode === 'review' ? '주차 리뷰 저장됨' : '저장됨' };
}

export async function addActivityType(name: string): Promise<R> {
  const me = await getProfile(); if (!me || !['admin', 'manager'].includes(me.role)) return { ok: false, msg: '권한 없음' };
  const nm = name.trim(); if (!nm) return { ok: false, msg: '이름을 입력하세요' };
  const { error } = await supabaseServer().from('activity_types').upsert({ name: nm, created_by: me.id, is_active: true }, { onConflict: 'name' });
  if (error) return { ok: false, msg: error.message }; revalidatePath('/monthly'); return { ok: true, msg: `활동 '${nm}' 추가` };
}
