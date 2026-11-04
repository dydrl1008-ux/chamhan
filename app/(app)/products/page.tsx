import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import ProductsList from './ProductsList';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const me = (await getProfile())!;
  const { data: rows } = await supabaseServer().from('products').select('id,name,category,description,unit_price,intake_process,required_materials,caution').eq('is_active', true).order('sort_order').order('id');
  return <ProductsList rows={(rows ?? []) as any[]} canManage={me.role === 'admin' || me.role === 'head'} />;
}
