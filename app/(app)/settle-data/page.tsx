import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, won } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, bizLabel, prevBizMonth, nextBizMonth } from '@/lib/date/period';
import { fetchCustomers, fetchTaxInvoices, fetchPayroll } from '@/lib/settlement/extra';
import DataClient from './DataClient';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export default async function Page({ searchParams }: { searchParams: { t?: string; m?: string; q?: string } }) {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) redirect('/');
  const sb = supabaseServer(); const today = todayKST(); const tab = ['customers', 'tax', 'payroll', 'bycust'].includes(searchParams.t ?? '') ? searchParams.t! : 'bycust';
  const bm = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : bizMonthOf(today); const [ms, me2] = bizMonthRange(bm);
  let rows: any[] = []; let err = '';
  try {
    if (tab === 'customers') rows = await fetchCustomers();
    else if (tab === 'tax') rows = await fetchTaxInvoices(ms, me2);
    else if (tab === 'payroll') rows = await fetchPayroll(ms, me2);
    else { const { data, error } = await sb.rpc('settlement_customer_month_sums', { p_month: bm }); if (error) err = error.message; rows = data ?? []; }
  } catch (e: any) { err = e.message; }
  const { data: emplMap } = await sb.from('profiles').select('email,name').eq('is_active', true);
  return <DataClient tab={tab} bm={bm} label={bizLabel(bm)} prev={prevBizMonth(bm)} next={nextBizMonth(bm)} rows={rows} err={err} q={searchParams.q ?? ''} />;
}
