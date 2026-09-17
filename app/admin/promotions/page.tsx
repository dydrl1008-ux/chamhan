import { supabaseServer } from '@/lib/supabase/server';
import PromosAdmin from './PromosAdmin';
export const dynamic = 'force-dynamic';
export default async function Page() { const { data } = await supabaseServer().from('promotions').select('*').eq('is_active', true).order('sort_order').order('id'); return <PromosAdmin rows={data ?? []} />; }
