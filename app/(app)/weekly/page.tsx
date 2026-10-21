import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange } from '@/lib/date/period';
import { resolvePeriod, endOf, suggestPeriod } from '@/lib/reports';
import { addDays } from '@/lib/date/kst';
import WeeklyClient from './WeeklyClient';
export const dynamic = 'force-dynamic';
export default async function WeeklyPage({ searchParams }: { searchParams: { team?: string; w?: string; e?: string } }) {
  const me = (await getProfile())!;
  if (me.role === 'staff') redirect('/');
  const sb = supabaseServer(); const today = todayKST();
  const { data: teams } = await sb.from('teams').select('id,name,leader_id').eq('is_active', true).neq('name', '관리팀').order('sort_order');
  const teamId = me.role === 'manager' ? (me.team_id ?? 0) : Number(searchParams.team) || teams?.[0]?.id || 0;
  if (!teamId) return <div className="card">팀이 배정되지 않았습니다.</div>;
  // 보고 기간: 팀장이 지정(저장값) > URL 지정 > 기본 제안(월~일, 20일이 끼면 20일에서 끊음)
  const { data: reps } = await sb.from('weekly_reports').select('id,team_id,week_start,week_end,status').eq('team_id', teamId).order('week_start', { ascending: false }).limit(30);
  const rp = resolvePeriod(reps ?? [], teamId, today, searchParams.w, searchParams.e);
  const ws = rp.cur.start, we = rp.cur.end, ps = rp.prev.start, pe = rp.prev.end; const bm = bizMonthOf(we); const [ms, me2] = bizMonthRange(bm);
  const [{ data: members }, { data: kpi }, { data: report }, { data: pipeline }, { data: targets }] = await Promise.all([
    sb.from('profiles').select('id,name,position').eq('team_id', teamId).eq('role', 'staff').eq('is_active', true).order('name'),
    sb.from('kpi_daily').select('user_id,work_date,calls,new_cnt,margin,kakao_db,overtime,new_margin,work_report,feedback').eq('team_id', teamId).gte('work_date', ps < ms ? ps : ms).lte('work_date', we > me2 ? we : me2).order('work_date'),
    sb.from('weekly_reports').select('id,goal_margin,issues,checkpoints,common_directive,status,submitted_at').eq('team_id', teamId).eq('week_start', ws).maybeSingle(),
    sb.from('pipeline').select('id,owner_id,client,stage,expected_margin,next_action,risk,support,memo').eq('team_id', teamId).eq('is_active', true).order('id'),
    sb.from('monthly_targets').select('user_id,margin').eq('month', bm + '-01'),
  ]);
  const { data: notes } = report ? await sb.from('weekly_member_notes').select('user_id,directive,feedback').eq('report_id', report.id) : { data: [] };
  // 드롭다운: 저장된 보고서들 + (없으면) 기본 제안 기간 몇 개
  const saved = (reps ?? []).map(r => ({ start: r.week_start, end: endOf(r), status: r.status ?? 'draft', saved: true }));
  const sug: { start: string; end: string; status: string; saved: boolean }[] = []; { let p = suggestPeriod(today); for (let i = 0; i < 6; i++) { if (!saved.some(x => x.start <= p.end && x.end >= p.start)) sug.push({ ...p, status: '', saved: false }); const q = suggestPeriod(addDays(p.start, -1)); if (q.start >= p.start) break; p = q; } }
  const weeks = [...saved, ...sug].sort((a, b) => b.start.localeCompare(a.start));
  const { data: custs } = await sb.from('settlement_customers').select('cust_name').order('cust_name').limit(3000);
  return <WeeklyClient customers={[...new Set((custs ?? []).map(c => c.cust_name).filter(Boolean))] as string[]} me={me} teams={teams ?? []} teamId={teamId} ws={ws} we={we} ps={ps} pe={pe} weeks={weeks} members={members ?? []} kpi={kpi ?? []} report={report} notes={notes ?? []} pipeline={pipeline ?? []} targets={Object.fromEntries((targets ?? []).filter(t => t.user_id).map(t => [t.user_id!, Number(t.margin)]))} monthStart={ms} monthEnd={me2} monthKey={bm} />;
}
