import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import PlansClient from './PlansClient';
export const dynamic = 'force-dynamic';
export default async function PlansPage({ searchParams }: { searchParams: { m?: string; u?: string } }) {
  const me = (await getProfile())!; const sb = supabaseServer(); const today = todayKST();
  const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : today.slice(0, 7);
  const first = month + '-01'; const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const target = me.role === 'staff' ? me.id : (searchParams.u || me.id);
  const [{ data: plans }, { data: people }] = await Promise.all([
    sb.from('plans').select('id,user_id,type,title,detail,start_date,end_date,is_done,miss_reason').eq('is_active', true).eq('user_id', target).lte('start_date', last).gte('end_date', first).order('start_date'),
    me.role === 'staff' ? Promise.resolve({ data: [] as any[] }) : sb.from('profiles').select('id,name,team_id,role').eq('is_active', true).in('role', ['staff', 'manager']).order('team_id').order('name'),
  ]);
  return <PlansClient me={me} month={month} today={today} plans={plans ?? []} people={people ?? []} target={target} />;
}
