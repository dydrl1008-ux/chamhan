'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
export async function requestLeave(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const user_id = String(fd.get('user_id') || me.id);
  const type = String(fd.get('type')); const s = String(fd.get('start_date')); const e = String(fd.get('end_date') || s);
  const reason = String(fd.get('reason') || '').trim();
  const isFinal = me.role === 'admin' || me.role === 'head';          // 총괄·어드민: 즉시 확정
  const isManager = me.role === 'manager';                            // 팀장: 팀승인 상태로 등록, 최종 대기
  const row: Record<string, unknown> = { user_id, type, start_date: s, end_date: e, reason, requested_by: me.id, status: isFinal ? 'approved' : 'pending' };
  if (isManager && !['late', 'absent'].includes(type)) { row.team_approved_at = new Date().toISOString(); }   // 지각·결근은 총괄 직접 승인
  const { error } = await supabaseServer().from('leave_requests').insert(row);
  if (error) return { ok: false, msg: error.message.includes('잔여') ? error.message : `등록 실패: ${error.message}` };
  revalidatePath('/leave'); revalidatePath('/attendance');
  return { ok: true, msg: isFinal ? '등록·확정됨' : isManager ? '등록됨 (총괄 최종 승인 대기)' : '신청됨 (팀장 승인 대기)' };
}
export async function decideLeave(id: number, action: 'team_approve' | 'approved' | 'rejected' | 'cancelled'): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const patch: Record<string, unknown> = action === 'team_approve'
    ? { team_approved_at: new Date().toISOString() }
    : { status: action, decided_by: me.id, decided_at: new Date().toISOString() };
  const { data, error } = await supabaseServer().from('leave_requests').update(patch).eq('id', id).select('id');
  if (error) return { ok: false, msg: error.message.includes('최종') ? error.message : `처리 실패: ${error.message}` };
  if (!data?.length) return { ok: false, msg: '권한이 없거나 이미 처리된 건입니다.' };
  revalidatePath('/leave'); revalidatePath('/attendance');
  return { ok: true, msg: { team_approve: '팀 승인 완료 (총괄 최종 승인 대기)', approved: '최종 승인', rejected: '반려', cancelled: '취소' }[action] + (action === 'team_approve' ? '' : ' 처리됨') };
}
