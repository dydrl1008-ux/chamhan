import { supabaseServer } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { todayKST, addDays } from '@/lib/date/kst';
import SettlementAdmin from './SettlementAdmin';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;   // 정산 사이트 조회 대기 (Hobby 최대 60초)
export default async function Page() {
  const me = await requireRole(['admin', 'head']);
  const sb = supabaseServer(); const today = todayKST();
  const [{ data: set }, { data: runs }, { data: empls }, { data: maps }, { data: people }, { count }] = await Promise.all([
    sb.from('app_settings').select('key,value').in('key', ['settle_field_map', 'settle_vat_divisor']),
    sb.from('settlement_sync_runs').select('*').order('id', { ascending: false }).limit(10),
    sb.from('settlement_items').select('empl_id').gte('req_date', addDays(today, -90)),
    sb.from('settlement_empl_map').select('*'),
    sb.from('profiles').select('id,name,email').eq('is_active', true).order('name'),
    sb.from('settlement_items').select('settle_no', { count: 'exact', head: true }),
  ]);
  const v = (k: string) => set?.find(s => s.key === k)?.value ?? '';
  let map: Record<string, string> = {}; try { map = JSON.parse(v('settle_field_map') || '{}'); } catch {}
  const emplIds = [...new Set((empls ?? []).map(e => e.empl_id).filter(Boolean))] as string[];
  return <SettlementAdmin isAdmin={me.role === 'admin'} map={map} vat={v('settle_vat_divisor') || '1.1'} runs={runs ?? []} emplIds={emplIds} maps={maps ?? []} people={people ?? []} total={count ?? 0} today={today} envReady={!!(process.env.SETTLE_CO_CODE && process.env.SETTLE_USER_ID && process.env.SETTLE_USER_PW)} />;
}
