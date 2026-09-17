import { supabaseServer } from '@/lib/supabase/server';
import ProductsAdmin from './ProductsAdmin';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const sb = supabaseServer();
  const [{ data: rows }, { data: people }] = await Promise.all([sb.from('products').select('*').eq('is_active', true).order('sort_order').order('id'), sb.from('profiles').select('id,name').eq('is_active', true).order('name')]);
  return <ProductsAdmin rows={rows ?? []} people={people ?? []} />;
}
