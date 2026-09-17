import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import LeaveClient from './LeaveClient';
export const dynamic = 'force-dynamic';
export default async function LeavePage({ searchParams }: { searchParams: { m?: string; u?: string } }) {
  const me = (await getProfile())!;
  const sb = supabaseServer();
  const today = todayKST(); const year = today.slice(0, 4);
  const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : today.slice(0, 7);
  const [{ data: people }, { data: leaves }, { data: monthly }, { data: yearly }, { data: teams }] = await Promise.all([
    sb.from('profiles').select('id,name,team_id,role,position,annual_leave_granted,monthly_leave_granted,hired_at').eq('is_active', true).order('team_id').order('name'),
    sb.from('leave_requests').select('id,user_id,type,start_date,end_date,days,reason,status,source,requested_by,decided_by').gte('start_date', `${year}-01-01`).order('start_date', { ascending: false }),
    sb.from('v_leave_monthly').select('*').gte('month', `${year}-01-01`),
    sb.from('v_leave_yearly').select('*').eq('year', Number(year)),
    sb.from('teams').select('id,name').eq('is_active', true).order('sort_order'),
  ]);
  return <LeaveClient me={me} people={(people ?? []).filter(p => p.role !== 'admin')} leaves={leaves ?? []} monthly={monthly ?? []} yearly={yearly ?? []} teams={teams ?? []} month={month} today={today} selUser={searchParams.u ?? 'all'} />;
}
