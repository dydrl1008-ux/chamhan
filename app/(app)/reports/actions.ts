'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
export async function saveSubmission(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const form_id = Number(fd.get('form_id')); const period_key = String(fd.get('period_key')); const status = fd.get('submit') === '1' ? 'submitted' : 'draft';
  const data: Record<string, unknown> = {}; for (const [k, v] of fd.entries()) if (k.startsWith('d_')) data[k.slice(2)] = String(v);
  const { data: fields } = await supabaseServer().from('report_form_fields').select('key,label,required,type').eq('form_id', form_id);
  if (status === 'submitted') for (const f of fields ?? []) if (f.required && !String(f.type).startsWith('auto') && !String(data[f.key] ?? '').trim()) return { ok: false, msg: `'${f.label}' 은(는) 필수입니다.` };
  const { error } = await supabaseServer().from('report_submissions').upsert({ form_id, user_id: me.id, period_key, data, status, submitted_at: status === 'submitted' ? new Date().toISOString() : null }, { onConflict: 'form_id,user_id,period_key' });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/reports'); revalidatePath('/'); return { ok: true, msg: status === 'submitted' ? '제출 완료' : '임시저장' };
}
