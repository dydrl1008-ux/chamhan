import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange } from '@/lib/date/period';
import PnlAdmin from './PnlAdmin';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: { m?: string } }) {
  const sb = supabaseServer(); const today = todayKST();
  const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : bizMonthOf(today);
  const [bs, be] = bizMonthRange(month);
  const [{ data: cats }, { data: mo }, { data: items }, { data: summary }, { data: margin }] = await Promise.all([
    sb.from('pnl_categories').select('*').eq('is_active', true).order('sort_order').order('id'),
    sb.from('pnl_months').select('*').eq('month', month + '-01').maybeSingle(),
    sb.from('pnl_items').select('category_id,amount,note').eq('month', month + '-01'),
    sb.from('v_pnl_summary').select('*').order('month', { ascending: false }).limit(12),
    sb.from('kpi_daily').select('margin').gte('work_date', bs).lte('work_date', be).limit(5000),
  ]);
  const marginSum = (margin ?? []).reduce((a, x) => a + Number(x.margin), 0);
  return <PnlAdmin month={month} range={[bs, be]} cats={cats ?? []} mo={mo} items={items ?? []} summary={(summary ?? []).reverse()} marginSum={marginSum} />;
}
