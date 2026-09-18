'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { pollPending } from '@/lib/settlement/pending';
import { notifyPending } from '@/lib/settlement/notify';
export async function checkNow(): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) return { ok: false, msg: '권한 없음' };
  try { const r = await pollPending(3); if (r.fresh.length) await notifyPending(r.fresh); revalidatePath('/pending'); revalidatePath('/'); return { ok: true, msg: `applyStatus=${r.code} · 조회 ${r.total}건 → 상태 ${Object.entries(r.dist).map(([k, v]) => `${k}:${v}`).join(', ') || '없음'} · 대기 ${r.open}건 (신규 ${r.fresh.length}, 해소 ${r.resolved})${r.healthy ? '' : ' · ⚠ 해소 판정 보류(코드 확인 필요 또는 사이트 응답 없음)'}` }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}

export async function dismissPending(keys: string[], dismiss: boolean): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) return { ok: false, msg: '권한 없음' };
  if (!keys.length) return { ok: false, msg: '선택된 건 없음' };
  const { supabaseServer } = await import('@/lib/supabase/server');
  const { error } = await supabaseServer().from('settlement_pending').update(dismiss ? { dismissed_at: new Date().toISOString(), dismissed_by: me.id } : { dismissed_at: null, dismissed_by: null }).in('item_key', keys);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pending'); revalidatePath('/');
  return { ok: true, msg: dismiss ? `${keys.length}건 알림 해제` : `${keys.length}건 복원` };
}
