'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
export async function requestLeave(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const user_id = String(fd.get('user_id') || me.id);
  const type = String(fd.get('type')); const s = String(fd.get('start_date')); const e = String(fd.get('end_date') || s);
  const reason = String(fd.get('reason') || '').trim();
  const isManager = me.role !== 'staff';
  const status = isManager ? 'approved' : 'pending';
  const { error } = await supabaseServer().from('leave_requests').insert({ user_id, type, start_date: s, end_date: e, reason, status, requested_by: me.id, decided_by: isManager ? me.id : null, decided_at: isManager ? new Date().toISOString() : null });
  if (error) return { ok: false, msg: error.message.includes('잔여') ? error.message : `등록 실패: ${error.message}` };
  revalidatePath('/leave'); revalidatePath('/attendance');
  return { ok: true, msg: isManager ? '등록됨' : '신청됨 (팀장 승인 대기)' };
}
export async function decideLeave(id: number, status: 'approved' | 'rejected' | 'cancelled'): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseServer().from('leave_requests').update({ status, decided_by: me.id, decided_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) return { ok: false, msg: error.message };
  if (!data?.length) return { ok: false, msg: '권한이 없거나 이미 처리된 건입니다.' };
  revalidatePath('/leave'); revalidatePath('/attendance');
  return { ok: true, msg: { approved: '승인', rejected: '반려', cancelled: '취소' }[status] + ' 처리됨' };
}
