// 상품 관리 — 총괄·어드민 (어드민 설정 메뉴의 /admin/products 와 같은 화면)
import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import ProductsAdmin from '@/app/admin/products/ProductsAdmin';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireRole(['admin', 'head']);
  const sb = supabaseServer();
  const [{ data: rows }, { data: people }] = await Promise.all([sb.from('products').select('*').eq('is_active', true).order('sort_order').order('id'), sb.from('profiles').select('id,name').eq('is_active', true).order('name')]);
  return <ProductsAdmin rows={rows ?? []} people={people ?? []} />;
}
