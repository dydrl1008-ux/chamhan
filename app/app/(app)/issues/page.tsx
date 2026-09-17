import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import IssuesClient from './IssuesClient';
export const dynamic = 'force-dynamic';
export default async function IssuesPage() {
  const me = (await getProfile())!;
  const sb = supabaseServer();
  const [{ data: issues }, { data: reads }, { data: people }, { count: activeCount }] = await Promise.all([
    sb.from('issues').select('id,issue_date,title,body,customer_notice,author_id,created_at').eq('is_active', true).order('issue_date', { ascending: false }).order('id', { ascending: false }).limit(60),
    sb.from('issue_reads').select('issue_id,user_id'),
    sb.from('profiles').select('id,name').eq('is_active', true),
    sb.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  return <IssuesClient me={me} today={todayKST()} issues={issues ?? []} reads={reads ?? []} people={people ?? []} total={activeCount ?? 0} />;
}
