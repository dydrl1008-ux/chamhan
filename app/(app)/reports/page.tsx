import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, weekStartOf, won } from '@/lib/date/kst';
import ReportsClient from './ReportsClient';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: { f?: string; v?: string } }) {
  const me = (await getProfile())!; const sb = supabaseServer(); const today = todayKST(); const ms = today.slice(0, 7) + '-01';
  const pk = (p: string) => p === 'daily' ? today : p === 'weekly' ? weekStartOf(today) : p === 'monthly' ? today.slice(0, 7) : today;
  const [{ data: myForms }, { data: allForms }, { data: fields }, { data: subs }, { data: people }, { data: mt }, { data: mm }, { data: pr }, { data: lm }] = await Promise.all([
    sb.rpc('my_forms'), sb.from('report_forms').select('id,name,period').eq('is_active', true), sb.from('report_form_fields').select('*').order('sort_order'),
    sb.from('report_submissions').select('id,form_id,user_id,period_key,data,status,submitted_at').order('id', { ascending: false }).limit(200),
    sb.from('profiles').select('id,name').eq('is_active', true),
    sb.from('kpi_daily').select('margin').eq('user_id', me.id).eq('work_date', today).maybeSingle(),
    sb.from('v_margin_monthly').select('margin').eq('user_id', me.id).eq('month', ms).maybeSingle(),
    sb.from('v_plan_rate').select('type,total,done').eq('user_id', me.id).eq('month', ms),
    sb.from('v_leave_monthly').select('late_cnt,absent_cnt,sick_cnt,annual_used').eq('user_id', me.id).eq('month', ms).maybeSingle(),
  ]);
  const daily = (pr ?? []).find(x => x.type === 'daily');
  const auto: Record<string, string> = { auto_margin_today: won(mt?.margin ?? 0), auto_margin_month: won(mm?.margin ?? 0), auto_plan_rate: daily && Number(daily.total) ? Math.round(Number(daily.done) / Number(daily.total) * 100) + '%' : '계획 없음', auto_attendance: `지각 ${Number(lm?.late_cnt ?? 0)} · 결근 ${Number(lm?.absent_cnt ?? 0)} · 병가 ${Number(lm?.sick_cnt ?? 0)} · 연차 ${Number(lm?.annual_used ?? 0)}일` };
  const forms = (myForms ?? []).map((f: any) => ({ ...f, period_key: pk(f.period) }));
  return <ReportsClient me={me} forms={forms} allForms={allForms ?? []} fields={fields ?? []} subs={subs ?? []} people={people ?? []} auto={auto} openForm={Number(searchParams.f) || null} viewSub={Number(searchParams.v) || null} today={today} />;
}
