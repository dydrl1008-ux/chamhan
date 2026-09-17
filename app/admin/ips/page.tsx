import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import IpsClient from './IpsClient';
export const dynamic = 'force-dynamic';
export default async function IpsPage() {
  const { data } = await supabaseServer().from('allowed_ips').select('id,label,cidr,is_active,created_at').order('id');
  const h = headers(); const myIp = (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || '').trim();
  return <IpsClient rows={data ?? []} myIp={myIp} />;
}
