import { supabaseServer } from '@/lib/supabase/server';
import UsersClient from './UsersClient';
export const dynamic = 'force-dynamic';
export default async function UsersPage() {
  const sb = supabaseServer();
  const [{ data: users }, { data: teams }] = await Promise.all([
    sb.from('profiles').select('id,name,email,role,team_id,is_mgmt,position,hired_at,annual_leave_granted,is_active').order('role').order('team_id').order('name'),
    sb.from('teams').select('id,name,leader_id').eq('is_active', true).order('sort_order'),
  ]);
  return <UsersClient users={users ?? []} teams={teams ?? []} />;
}
