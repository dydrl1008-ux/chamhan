// 메타 보고 — 일일(사원 · 팀장 본인) / 주간(팀장). 숫자는 인바운드 DB 에서 자동으로 채운다. 사원: 내 보고 / 팀장 · 총괄: 팀 전체
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { metaAccess } from '@/lib/meta';
import { metaDeployed } from '@/lib/metaEdu';
import { todayKST, weekStartOf, addDays } from '@/lib/date/kst';
import { dailyAuto, weeklyAuto, type DailyAuto, type WeeklyAuto } from '@/lib/metaReport';
import { PageHeader } from '@/components/ui';
import { metaPeople } from '../meta-db/actions';
import MetaReportClient from './MetaReportClient';
export const dynamic = 'force-dynamic';
export default async function MetaReportPage({ searchParams }: { searchParams: { d?: string; w?: string } }) {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const a = await metaAccess(me); if (!a.ok) redirect('/'); if (!a.lead && !(await metaDeployed(me))) redirect('/meta-edu');
  const today = todayKST(); const sb = supabaseAdmin(); const people = await metaPeople(); const names = Object.fromEntries(people.map(p => [p.id, p.name])); names[me.id] = me.name;
  const day = a.lead && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d ?? '') && searchParams.d! <= today ? searchParams.d! : today;
  const thisWeek = weekStartOf(today); const week = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.w ?? '') && weekStartOf(searchParams.w!) === searchParams.w && searchParams.w! <= thisWeek ? searchParams.w! : addDays(thisWeek, -7);
  let err = ''; let myAuto: DailyAuto | null = null; let wAuto: WeeklyAuto | null = null;
  try { if (!a.boss) myAuto = await dailyAuto(me.id, today); if (a.lead) wAuto = await weeklyAuto(week, people); } catch (e: any) { err = String(e?.message ?? e); }
  // 보고 내역 — 사원: 내 최근 30건 / 팀장 · 총괄: 고른 날의 팀 일일 보고 + 최근 주간 보고
  const q = sb.from('meta_reports').select('id,user_id,kind,period_key,auto,data,submitted_at').order('period_key', { ascending: false }).order('id', { ascending: false });
  const { data: reps, error } = a.lead ? await q.or(`and(kind.eq.daily,period_key.eq.${day}),kind.eq.weekly,and(kind.eq.daily,user_id.eq.${me.id})`).limit(200) : await q.eq('user_id', me.id).limit(30);
  if (error && !err) err = /meta_reports/.test(error.message) ? '0102 SQL(상품비 칸 · 메타 보고)을 먼저 실행해 주세요' : error.message;
  const list = (reps ?? []) as any[]; const mineToday = list.find(r => r.kind === 'daily' && r.user_id === me.id && r.period_key === today) ?? null;
  return <>
    <PageHeader title="메타 보고" desc="숫자는 인바운드 DB 에 남긴 상태 · 결제 금액 · 상품비에서 자동으로 채워집니다. 글로 쓸 것만 적어 주세요" />
    {err && <div className="card" style={{ color: '#B42318', marginBottom: 12 }}>{err}</div>}
    <MetaReportClient lead={a.lead} boss={a.boss} meId={me.id} today={today} day={day} week={week} thisWeek={thisWeek} myAuto={myAuto} mineToday={mineToday} wAuto={wAuto} reports={list} names={names} staff={people.filter(p => p.role === 'staff' || p.id !== me.id).map(p => ({ id: p.id, name: p.name }))} />
  </>;
}
