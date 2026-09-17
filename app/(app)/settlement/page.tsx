import { supabaseServer } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { bizMonthOf } from '@/lib/date/period';
import { todayKST, addDays } from '@/lib/date/kst';
import SettlementAdmin from './SettlementAdmin';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;   // 정산 사이트 조회 대기 (Hobby 최대 60초)
export default async function Page() {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) redirect('/');
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
  const statusOk = (() => { try { return JSON.parse(v('settle_field_map') || '{}').status_ok || '승인완료'; } catch { return '승인완료'; } })();
  const { data: sums } = await sb.from('settlement_items').select('empl_id,req_date,profit,name:raw->>empName').eq('status', statusOk);
  const vat = Number(v('settle_vat_divisor') || 1.1);
  const byMonth: Record<string, Record<string, { name: string; sum: number }>> = {};
  for (const x of (sums ?? []) as any[]) { const mk = bizMonthOf(x.req_date); const e = x.empl_id || '(없음)'; byMonth[mk] ??= {}; byMonth[mk][e] ??= { name: x.name ?? '', sum: 0 }; byMonth[mk][e].sum += Number(x.profit); }
  const months = Object.keys(byMonth).sort().reverse().slice(0, 6);
  const emplAll = [...new Set(Object.values(byMonth).flatMap(m => Object.keys(m)))].sort();
  const summary = { months, rows: emplAll.map(e => ({ empl: e, name: Object.values(byMonth).map(m => m[e]?.name).find(Boolean) ?? '', vals: months.map(mk => Math.ceil((byMonth[mk][e]?.sum ?? 0) / vat)) })) };
  let map: Record<string, string> = {}; try { map = JSON.parse(v('settle_field_map') || '{}'); } catch {}
  const emplIds = [...new Set((empls ?? []).map(e => e.empl_id).filter(Boolean))] as string[];
  return <SettlementAdmin isAdmin={me.role === 'admin'} summary={summary} map={map} vat={v('settle_vat_divisor') || '1.1'} runs={runs ?? []} emplIds={emplIds} maps={maps ?? []} people={people ?? []} total={count ?? 0} today={today} envReady={!!(process.env.SETTLE_CO_CODE && process.env.SETTLE_USER_ID && process.env.SETTLE_USER_PW)} />;
}
