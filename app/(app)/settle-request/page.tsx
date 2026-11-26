import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import RequestClient from './RequestClient';
import { isMeta } from '@/lib/meta';
import { myMetaLeadOptions } from '@/lib/metaPay';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export default async function Page() {
  const me = (await getProfile())!; const sb = supabaseServer();
  const { data: cred } = await sb.from('settlement_credentials').select('settle_user_id,verified_at,last_error').eq('user_id', me.id).maybeSingle();
  const metaLeads = (await isMeta(me)) ? await myMetaLeadOptions(me.id) : null;   // 메타팀만 — 정산요청을 인바운드 결제 내역으로 같이 넣기
  return <RequestClient metaLeads={metaLeads} linked={!!cred} settleId={cred?.settle_user_id ?? ''} lastError={cred?.last_error ?? ''} today={todayKST()} canAddCustomer={me.role === 'admin' || me.role === 'head' || !!me.is_mgmt} />;
}
