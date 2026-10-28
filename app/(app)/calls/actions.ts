'use server';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';

type R = { ok: boolean; msg: string; code?: string };
const RESULTS = ['called', 'interested', 'rejected', 'won', 'excluded'];

export async function setResult(id: number, status: string, note: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!RESULTS.includes(status)) return { ok: false, msg: '잘못된 결과' };
  const { error } = await supabaseServer().rpc('lead_set_result', { p_id: id, p_status: status, p_note: note.slice(0, 1000) });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/calls');
  return { ok: true, msg: '기록됨' };
}

/** 제안서 주소를 추적 링크로 감싸기 — 고객이 열면 담당자에게 알림 */
export async function makeTrackLink(leadId: number | null, title: string, url: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const u = url.trim();
  if (!/^https:\/\/[^\s]+$/.test(u)) return { ok: false, msg: 'https:// 로 시작하는 제안서 주소를 넣어 주세요' };
  const code = randomBytes(6).toString('base64url').slice(0, 8);
  const { error } = await supabaseServer().from('proposals').insert({ code, lead_id: leadId, title: title.slice(0, 120), target_url: u.slice(0, 2000), owner_id: me.id });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/calls');
  return { ok: true, msg: '추적 링크 생성', code };
}

/** 되돌리기 — 오늘 내가 남긴 마지막 결과 삭제 (차수 -1, 다시 오늘 리스트로) */
export async function undoResult(id: number): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { error } = await supabaseServer().rpc('lead_undo_result', { p_id: id });
  if (error) return { ok: false, msg: error.message.replace(/^.*?: /, '') };
  revalidatePath('/calls'); revalidatePath('/leads');
  return { ok: true, msg: '되돌림 — 다시 오늘 리스트에 있음' };
}
