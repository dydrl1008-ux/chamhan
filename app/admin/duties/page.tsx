import { supabaseServer } from '@/lib/supabase/server';
import DutiesAdmin from './DutiesAdmin';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const sb = supabaseServer();
  const [{ data: rows }, { data: people }] = await Promise.all([sb.from('mgmt_duties').select('*').eq('is_active', true).order('sort_order').order('id'), sb.from('profiles').select('id,name,is_mgmt').eq('is_active', true).order('name')]);
  return <DutiesAdmin rows={rows ?? []} people={people ?? []} />;
}
