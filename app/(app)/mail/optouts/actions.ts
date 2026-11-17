'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
type R = { ok: boolean; msg: string };
const can = (me: { role: string } | null) => !!me && (me.role === 'admin' || me.role === 'head');
export async function addOptouts(text: string): Promise<R> {
  const me = await getProfile(); if (!can(me)) return { ok: false, msg: '권한 없음' };
  const list = Array.from(new Set(String(text ?? '').toLowerCase().split(/[\s,;]+/).map(s => s.trim()).filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)))).slice(0, 5000);
  if (!list.length) return { ok: false, msg: '이메일 주소가 없습니다' };
  const { error } = await supabaseAdmin().from('email_optouts').upsert(list.map(email => ({ email, code: 'manual' })), { onConflict: 'email', ignoreDuplicates: true });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/mail/optouts'); return { ok: true, msg: `${list.length}개 추가됨 (이미 있던 주소는 그대로)` };
}
export async function removeOptout(email: string): Promise<R> {
  const me = await getProfile(); if (!can(me)) return { ok: false, msg: '권한 없음' };
  const { error } = await supabaseAdmin().from('email_optouts').delete().eq('email', String(email ?? '').toLowerCase());
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/mail/optouts'); return { ok: true, msg: '삭제됨 — 이 주소는 다시 발송 대상이 됩니다' };
}
