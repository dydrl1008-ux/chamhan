import { supabaseServer } from '@/lib/supabase/server';
import AssetsAdmin from './AssetsAdmin';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const sb = supabaseServer();
  const [{ data: biz }, { data: phones }, { data: accounts }, { data: people }, { data: logs }] = await Promise.all([
    sb.from('assets_businesses').select('*').eq('is_active', true).order('id'), sb.from('assets_phones').select('*').eq('is_active', true).order('id'),
    sb.from('assets_accounts').select('id,service,login_id,business_id,owner_id,payment_method,renew_note,url,note,updated_at,password_enc').eq('is_active', true).order('service'),
    sb.from('profiles').select('id,name').eq('is_active', true).order('name'), sb.from('asset_access_logs').select('user_id,account_id,action,at').order('id', { ascending: false }).limit(30),
  ]);
  return <AssetsAdmin biz={biz ?? []} phones={phones ?? []} accounts={(accounts ?? []).map(a => ({ ...a, has_pw: !!a.password_enc, password_enc: undefined }))} people={people ?? []} logs={logs ?? []} secretReady={!!process.env.ASSET_SECRET} />;
}
