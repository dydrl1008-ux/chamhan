import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import RequestClient from './RequestClient';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export default async function Page() {
  const me = (await getProfile())!; const sb = supabaseServer();
  const { data: cred } = await sb.from('settlement_credentials').select('settle_user_id,verified_at,last_error').eq('user_id', me.id).maybeSingle();
  return <RequestClient linked={!!cred} settleId={cred?.settle_user_id ?? ''} lastError={cred?.last_error ?? ''} today={todayKST()} />;
}
