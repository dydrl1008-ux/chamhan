'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
type R = { ok: boolean; msg: string };
/** 내 고객 추가 — 업체명 칸에 줄바꿈으로 여러 개 가능 */
export async function addMyCustomer(fd: FormData): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const names = String(fd.get('name') || '').split(/\n/).map(x => x.trim()).filter(Boolean).slice(0, 200);
  const phone = String(fd.get('phone') || '').replace(/[^\d-]/g, ''); const memo = String(fd.get('memo') || '').trim();
  if (!names.length) return { ok: false, msg: '업체명을 입력하세요' };
  const { error } = await supabaseServer().from('my_customers').insert(names.map((name, i) => ({ user_id: me.id, name, phone: i === 0 ? phone : '', memo })));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/calls'); revalidatePath('/leads');
  return { ok: true, msg: `${names.length}곳 추가 — 콜 리스트에서 제외됨` };
}
export async function removeMyCustomer(id: number): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseServer().from('my_customers').delete().eq('id', id).select('id');
  if (error) return { ok: false, msg: error.message }; if (!data?.length) return { ok: false, msg: '본인이 적은 고객만 뺄 수 있습니다' };
  revalidatePath('/calls'); return { ok: true, msg: '뺐음' };
}

export async function updateMyCustomer(id: number, name: string, phone: string, memo: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const n = name.trim(); if (!n) return { ok: false, msg: '업체명을 입력하세요' };
  const { data, error } = await supabaseServer().from('my_customers').update({ name: n, phone: phone.replace(/[^\d-]/g, ''), memo: memo.trim() }).eq('id', id).select('id');
  if (error) return { ok: false, msg: error.message }; if (!data?.length) return { ok: false, msg: '본인이 적은 고객만 수정할 수 있습니다' };
  revalidatePath('/calls'); revalidatePath('/leads'); return { ok: true, msg: '수정됨' };
}
