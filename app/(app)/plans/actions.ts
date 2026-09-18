'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
type R = { ok: boolean; msg: string };
export async function addPlan(fd: FormData): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const title = String(fd.get('title') || '').trim(); if (!title) return { ok: false, msg: '내용을 입력하세요.' };
  const type = String(fd.get('type')); const s = String(fd.get('start_date')); const e = String(fd.get('end_date') || s);
  if (!['daily', 'weekly', 'monthly'].includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, msg: '입력값 확인' };
  const { error } = await supabaseServer().from('plans').insert({ user_id: me.id, type, title, detail: String(fd.get('detail') || ''), start_date: s, end_date: e < s ? s : e });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/plans'); revalidatePath('/me'); return { ok: true, msg: '계획 추가됨' };
}
export async function togglePlan(id: number, done: boolean, missReason?: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseServer().from('plans').update({ is_done: done, miss_reason: missReason ?? null }).eq('id', id).select('id');
  if (error) return { ok: false, msg: error.message }; if (!data?.length) return { ok: false, msg: '본인 계획만 변경할 수 있습니다.' };
  revalidatePath('/plans'); revalidatePath('/me'); return { ok: true, msg: done ? '완료 처리' : '미완료로 변경' };
}
export async function removePlan(id: number): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseServer().from('plans').update({ is_active: false }).eq('id', id).select('id');
  if (error) return { ok: false, msg: error.message }; if (!data?.length) return { ok: false, msg: '본인 계획만 삭제할 수 있습니다.' };
  revalidatePath('/plans'); return { ok: true, msg: '삭제됨' };
}

export async function updatePlan(fd: FormData): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const id = Number(fd.get('id')); const title = String(fd.get('title') || '').trim(); if (!id || !title) return { ok: false, msg: '내용을 입력하세요.' };
  const type = String(fd.get('type')); const s = String(fd.get('start_date')); const e = String(fd.get('end_date') || s);
  if (!['daily', 'weekly', 'monthly'].includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, msg: '입력값 확인' };
  const { data, error } = await supabaseServer().from('plans').update({ type, title, detail: String(fd.get('detail') || ''), start_date: s, end_date: e < s ? s : e }).eq('id', id).select('id');
  if (error) return { ok: false, msg: error.message }; if (!data?.length) return { ok: false, msg: '본인 계획만 수정할 수 있습니다.' };
  revalidatePath('/plans'); revalidatePath('/me'); revalidatePath('/'); return { ok: true, msg: '수정됨' };
}
