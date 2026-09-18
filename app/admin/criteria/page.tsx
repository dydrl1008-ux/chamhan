import { supabaseServer } from '@/lib/supabase/server';
import CriteriaClient from './CriteriaClient';
export const dynamic = 'force-dynamic';
export default async function AdminCriteriaPage() {
  const sb = supabaseServer();
  const [{ data: crit }, { data: tiers }, { data: set }] = await Promise.all([
    sb.from('promotion_criteria').select('*').eq('is_active', true).order('sort_order'),
    sb.from('incentive_tiers').select('*').eq('is_active', true).order('scope').order('sort_order'),
    sb.from('app_settings').select('key,value').in('key', ['new_margin_bonus_rate', 'promotion_doc', 'incentive_doc', 'late_after', 'incentive_team_scopes']),
  ]);
  return <CriteriaClient criteria={crit ?? []} tiers={tiers ?? []} settings={Object.fromEntries((set ?? []).map(s => [s.key, s.value]))} />;
}
