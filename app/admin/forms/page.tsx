import { supabaseServer } from '@/lib/supabase/server';
import FormsAdmin from './FormsAdmin';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const sb = supabaseServer();
  const [{ data: forms }, { data: fields }, { data: asg }, { data: teams }, { data: people }, { data: subs }] = await Promise.all([
    sb.from('report_forms').select('*').eq('is_active', true).order('id'), sb.from('report_form_fields').select('*').order('sort_order'), sb.from('report_form_assignments').select('*'),
    sb.from('teams').select('id,name').eq('is_active', true).order('sort_order'), sb.from('profiles').select('id,name,role').eq('is_active', true).order('name'),
    sb.from('report_submissions').select('form_id').eq('status', 'submitted'),
  ]);
  return <FormsAdmin forms={forms ?? []} fields={fields ?? []} asg={asg ?? []} teams={teams ?? []} people={people ?? []} counts={Object.fromEntries((forms ?? []).map(f => [f.id, (subs ?? []).filter(s => s.form_id === f.id).length]))} />;
}
