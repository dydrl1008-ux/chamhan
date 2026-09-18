import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import { bizMonthOf } from '@/lib/date/period';
import TargetsClient from './TargetsClient';
export const dynamic = 'force-dynamic';
export default async function TargetsPage({ searchParams }: { searchParams: { m?: string } }) {
  const sb = supabaseServer(); const today = todayKST();
  const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : bizMonthOf(today);
  const [{ data: people }, { data: teams }, { data: targets }] = await Promise.all([
    sb.from('profiles').select('id,name,team_id,position').eq('is_active', true).in('role', ['staff', 'manager']).order('team_id').order('name'),
    sb.from('teams').select('id,name').eq('is_active', true).neq('name', '관리팀').order('sort_order'),
    sb.from('monthly_targets').select('user_id,team_id,margin').eq('month', month + '-01'),
  ]);
  return <TargetsClient month={month} people={people ?? []} teams={teams ?? []} targets={targets ?? []} />;
}
