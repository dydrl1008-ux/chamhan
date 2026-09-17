'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';

function clientMeta() {
  const h = headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || '').trim();
  return { ip, ua: (h.get('user-agent') || '').slice(0, 200) };
}
export async function checkAttendance(kind: 'in' | 'out', time: string): Promise<{ ok: boolean; msg: string }> {
  const p = await getProfile(); if (!p) return { ok: false, msg: '로그인이 필요합니다.' };
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, msg: '시각 형식이 올바르지 않습니다.' };
  const { ip, ua } = clientMeta();
  const { error } = await supabaseServer().rpc('attendance_check', { p_kind: kind, p_time: time, p_ip: ip, p_ua: ua });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/attendance'); revalidatePath('/');
  return { ok: true, msg: kind === 'in' ? `출근 ${time} 기록됨` : `퇴근 ${time} 기록됨` };
}
