'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
type R = { ok: boolean; msg: string };
const P = ['/admin/forms', '/reports'];
export async function saveForm(fd: FormData): Promise<R> {
  const me = await requireRole(['admin']); const sb = supabaseServer();
  const id = fd.get('id') ? Number(fd.get('id')) : null;
  const name = String(fd.get('name') || '').trim(); const period = String(fd.get('period') || 'daily');
  if (!name) return { ok: false, msg: '양식 이름을 입력하세요.' };
  const keys = fd.getAll('f_key').map(String), labels = fd.getAll('f_label').map(String), types = fd.getAll('f_type').map(String), opts = fd.getAll('f_options').map(String), reqs = fd.getAll('f_required').map(String);
  const fields = labels.map((label, i) => ({ key: (keys[i] || '').trim() || `f${i + 1}`, label: label.trim(), type: types[i], options: types[i] === 'select' ? opts[i].split(',').map(s => s.trim()).filter(Boolean) : null, required: reqs[i] === '1', sort_order: i + 1 })).filter(f => f.label);
  if (!fields.length) return { ok: false, msg: '필드를 1개 이상 추가하세요.' };
  if (new Set(fields.map(f => f.key)).size !== fields.length) return { ok: false, msg: '필드 키가 중복됩니다.' };
  let formId = id;
  if (id) { const { error } = await sb.from('report_forms').update({ name, period, description: String(fd.get('description') || '') }).eq('id', id); if (error) return { ok: false, msg: error.message }; }
  else { const { data, error } = await sb.from('report_forms').insert({ name, period, description: String(fd.get('description') || ''), created_by: me.id }).select('id').single(); if (error) return { ok: false, msg: error.message }; formId = data.id; }
  await sb.from('report_form_fields').delete().eq('form_id', formId!);
  const { error: e2 } = await sb.from('report_form_fields').insert(fields.map(f => ({ ...f, form_id: formId })));
  if (e2) return { ok: false, msg: e2.message };
  // 배정
  await sb.from('report_form_assignments').delete().eq('form_id', formId!);
  const asg: any[] = [];
  fd.getAll('a_team').map(Number).filter(Boolean).forEach(team_id => asg.push({ form_id: formId, team_id }));
  fd.getAll('a_role').map(String).filter(Boolean).forEach(role => asg.push({ form_id: formId, role }));
  fd.getAll('a_user').map(String).filter(Boolean).forEach(user_id => asg.push({ form_id: formId, user_id }));
  if (fd.get('a_mgmt') === 'on') asg.push({ form_id: formId, only_mgmt: true });
  if (asg.length) { const { error: e3 } = await sb.from('report_form_assignments').insert(asg); if (e3) return { ok: false, msg: e3.message }; }
  P.forEach(p => revalidatePath(p)); return { ok: true, msg: id ? '양식 수정됨 (기존 제출물은 그대로 보존)' : '양식 생성됨' };
}
export async function deactivateForm(id: number): Promise<R> {
  await requireRole(['admin']); const { error } = await supabaseServer().from('report_forms').update({ is_active: false }).eq('id', id);
  P.forEach(p => revalidatePath(p)); return { ok: !error, msg: error?.message ?? '양식 비활성화' };
}
