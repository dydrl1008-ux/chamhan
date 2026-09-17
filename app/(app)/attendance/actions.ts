'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { nowTimeKST } from '@/lib/date/kst';

function clientMeta() {
  const h = headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || '').trim();
  return { ip, ua: (h.get('user-agent') || '').slice(0, 200) };
}
export async function checkAttendance(kind: 'in' | 'out'): Promise<{ ok: boolean; msg: string }> {
  const p = await getProfile(); if (!p) return { ok: false, msg: '로그인이 필요합니다.' };
  const time = nowTimeKST();   // 시각은 서버 현재 KST 고정 — 화면에서 수정 불가
  const { ip, ua } = clientMeta();
  const { error } = await supabaseServer().rpc('attendance_check', { p_kind: kind, p_time: time, p_ip: ip, p_ua: ua });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/attendance'); revalidatePath('/');
  return { ok: true, msg: kind === 'in' ? `출근 ${time} 기록됨` : `퇴근 ${time} 기록됨` };
}
export async function requestCorrection(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const p = await getProfile(); if (!p) return { ok: false, msg: '로그인이 필요합니다.' };
  const attendance_id = Number(fd.get('attendance_id')); const field = String(fd.get('field')); const new_time = String(fd.get('new_time')); const reason = String(fd.get('reason') || '').trim();
  if (!attendance_id || !['check_in', 'check_out'].includes(field) || !/^\d{2}:\d{2}$/.test(new_time)) return { ok: false, msg: '입력값을 확인하세요.' };
  const { error } = await supabaseServer().rpc('request_correction', { p_attendance: attendance_id, p_field: field, p_new: new_time, p_reason: reason });
  if (error) return { ok: false, msg: error.message.includes('duplicate') ? '이미 대기 중인 요청이 있습니다.' : error.message };
  revalidatePath('/attendance');
  return { ok: true, msg: '수정 요청됨 (총괄 승인 대기)' };
}
export async function decideCorrection(id: number, status: 'approved' | 'rejected'): Promise<{ ok: boolean; msg: string }> {
  const p = await getProfile(); if (!p) return { ok: false, msg: '로그인이 필요합니다.' };
  const { error } = await supabaseServer().rpc('decide_correction', { p_id: id, p_status: status });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/attendance'); revalidatePath('/leave');
  return { ok: true, msg: status === 'approved' ? '승인 · 출퇴근 시각 변경됨' : '반려됨' };
}
