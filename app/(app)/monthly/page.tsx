import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import { bizMonthOf, nextBizMonth } from '@/lib/date/period';
import { loadPlan, teamSummary } from '@/lib/monthly';
import MonthlyClient from './MonthlyClient';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export default async function MonthlyPage({ searchParams }: { searchParams: { team?: string; m?: string; tab?: string } }) {
  const me = await getProfile(); if (!me) redirect('/');
  if (!['admin', 'head', 'manager'].includes(me.role)) redirect('/');   // 팀장(본인 팀 작성) · 총괄·대표(전체 열람)
  const sb = supabaseServer(); const today = todayKST(); const curBm = bizMonthOf(today);
  const { data: teams } = await sb.from('teams').select('id,name,leader_id').eq('is_active', true).neq('name', '관리팀').order('sort_order');
  const teamId = me.role === 'manager' ? (me.team_id ?? 0) : Number(searchParams.team) || 0;
  const bm = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : curBm;
  if (!teamId && me.role === 'manager') return <div className="card">팀이 배정되지 않았습니다.</div>;
  // 전사 탭(총괄·대표·관리팀): 팀별 요약
  const summaries = me.role !== 'manager' ? await Promise.all((teams ?? []).map(async t => { const d = await loadPlan(t.id, bm); return { team: t, ...teamSummary(d), leader: '' }; })) : [];
  const data = teamId ? await loadPlan(teamId, bm) : null;
  const { data: leaders } = await sb.from('profiles').select('id,name').in('id', (teams ?? []).map(t => t.leader_id).filter(Boolean) as string[]);
  const canEdit = me.role === 'admin' || (me.role === 'manager' && me.team_id === teamId);
  return <MonthlyClient key={`${teamId}:${bm}:${searchParams.tab ?? ''}`} me={me} teams={(teams ?? []).map(t => ({ ...t, leader: leaders?.find(l => l.id === t.leader_id)?.name ?? '' }))} teamId={teamId} bm={bm} curBm={curBm} nextBm={nextBizMonth(curBm)} data={data} summaries={summaries} canEdit={canEdit} tab={searchParams.tab ?? ''} />;
}
