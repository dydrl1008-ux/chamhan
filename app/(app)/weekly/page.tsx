import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, reportPeriodOf, prevReportPeriod, recentReportPeriods } from '@/lib/date/period';
import WeeklyClient from './WeeklyClient';
export const dynamic = 'force-dynamic';
export default async function WeeklyPage({ searchParams }: { searchParams: { team?: string; w?: string } }) {
  const me = (await getProfile())!;
  if (me.role === 'staff') redirect('/');
  const sb = supabaseServer(); const today = todayKST();
  const { data: teams } = await sb.from('teams').select('id,name,leader_id').eq('is_active', true).neq('name', '관리팀').order('sort_order');
  const teamId = me.role === 'manager' ? (me.team_id ?? 0) : Number(searchParams.team) || teams?.[0]?.id || 0;
  if (!teamId) return <div className="card">팀이 배정되지 않았습니다.</div>;
  // 보고 기간: 월~일 주 단위, 단 회사 월 마감(20일)에서 끊음 (10/19~10/20, 10/21~10/25)
  const cur = reportPeriodOf(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.w ?? '') ? searchParams.w! : today); const prv = prevReportPeriod(cur);
  const ws = cur.start, we = cur.end, ps = prv.start, pe = prv.end; const bm = bizMonthOf(we); const [ms, me2] = bizMonthRange(bm);
  const [{ data: members }, { data: kpi }, { data: report }, { data: pipeline }, { data: targets }] = await Promise.all([
    sb.from('profiles').select('id,name,position').eq('team_id', teamId).eq('role', 'staff').eq('is_active', true).order('name'),
    sb.from('kpi_daily').select('user_id,work_date,calls,new_cnt,margin,kakao_db,overtime,new_margin,work_report,feedback').eq('team_id', teamId).gte('work_date', ps < ms ? ps : ms).lte('work_date', we > me2 ? we : me2).order('work_date'),
    sb.from('weekly_reports').select('id,goal_margin,issues,checkpoints,common_directive,status,submitted_at').eq('team_id', teamId).eq('week_start', ws).maybeSingle(),
    sb.from('pipeline').select('id,owner_id,client,stage,expected_margin,next_action,risk,support,memo').eq('team_id', teamId).eq('is_active', true).order('id'),
    sb.from('monthly_targets').select('user_id,margin').eq('month', bm + '-01'),
  ]);
  const { data: notes } = report ? await sb.from('weekly_member_notes').select('user_id,directive,feedback').eq('report_id', report.id) : { data: [] };
  const weeks = recentReportPeriods(today, 8);
  const { data: custs } = await sb.from('settlement_customers').select('cust_name').order('cust_name').limit(3000);
  return <WeeklyClient customers={[...new Set((custs ?? []).map(c => c.cust_name).filter(Boolean))] as string[]} me={me} teams={teams ?? []} teamId={teamId} ws={ws} we={we} ps={ps} pe={pe} weeks={weeks} members={members ?? []} kpi={kpi ?? []} report={report} notes={notes ?? []} pipeline={pipeline ?? []} targets={Object.fromEntries((targets ?? []).filter(t => t.user_id).map(t => [t.user_id!, Number(t.margin)]))} monthStart={ms} monthEnd={me2} monthKey={bm} />;
}
