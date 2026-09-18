import { supabaseServer } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { todayKST, addDays } from '@/lib/date/kst';
import SettlementAdmin from './SettlementAdmin';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;   // 정산 사이트 조회 대기 (Hobby 최대 60초)
export default async function Page() {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) redirect('/');
  const sb = supabaseServer(); const today = todayKST();
  const [{ data: set }, { data: runs }, { data: empls }, { data: maps }, { data: people }, { count }] = await Promise.all([
    sb.from('app_settings').select('key,value').in('key', ['settle_field_map', 'settle_vat_divisor', 'settle_pending_code']),
    sb.from('settlement_sync_runs').select('*').order('id', { ascending: false }).limit(10),
    sb.rpc('settlement_empl_ids'),
    sb.from('settlement_empl_map').select('*'),
    sb.from('profiles').select('id,name,email').eq('is_active', true).order('name'),
    sb.from('settlement_items').select('settle_no', { count: 'exact', head: true }),
  ]);
  const v = (k: string) => set?.find(s => s.key === k)?.value ?? '';
  const statusOk = (() => { try { return JSON.parse(v('settle_field_map') || '{}').status_ok || '승인완료'; } catch { return '승인완료'; } })();
  const { data: sums } = await sb.rpc('settlement_month_sums');
  const vat = Number(v('settle_vat_divisor') || 1.1);
  const byMonth: Record<string, Record<string, { name: string; sum: number }>> = {};
  for (const x of (sums ?? []) as any[]) { const mk = x.biz_month; const e = x.empl_id || '(없음)'; byMonth[mk] ??= {}; byMonth[mk][e] = { name: x.name ?? '', sum: Number(x.sum_profit) }; }
  const months = Object.keys(byMonth).sort().reverse().slice(0, 12);
  const emplAll = [...new Set(Object.values(byMonth).flatMap(m => Object.keys(m)))].sort();
  const summary = { months, rows: emplAll.map(e => ({ empl: e, name: Object.values(byMonth).map(m => m[e]?.name).find(Boolean) ?? '', vals: months.map(mk => Math.ceil((byMonth[mk][e]?.sum ?? 0) / vat)) })),
    // 합계 = 전체 VAT포함 합을 한 번만 ÷1.1 올림 (정산 사이트 합계와 일치). 개인 값 합과 몇 원 차이 날 수 있음
    totals: months.map(mk => Math.ceil(Object.values(byMonth[mk] ?? {}).reduce((a, x) => a + x.sum, 0) / vat)) };
  let map: Record<string, string> = {}; try { map = JSON.parse(v('settle_field_map') || '{}'); } catch {}
  const emplRows = ((empls ?? []) as any[]).sort((a, b) => String(a.empl_id).localeCompare(String(b.empl_id)));
  const emplIds = emplRows.filter(e => !e.hidden).map(e => e.empl_id as string);
  const hiddenIds = emplRows.filter(e => e.hidden).map(e => ({ empl_id: e.empl_id as string, name: e.name as string }));
  return <SettlementAdmin isAdmin={me.role === 'admin'} summary={summary} hiddenIds={hiddenIds} pendingCode={v('settle_pending_code') || '01'} map={map} vat={v('settle_vat_divisor') || '1.1'} runs={runs ?? []} emplIds={emplIds} maps={maps ?? []} people={people ?? []} total={count ?? 0} today={today} envReady={!!(process.env.SETTLE_CO_CODE && process.env.SETTLE_USER_ID && process.env.SETTLE_USER_PW)} />;
}
