'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { pollPending } from '@/lib/settlement/pending';
import { notifyPending } from '@/lib/settlement/notify';
export async function checkNow(): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) return { ok: false, msg: '권한 없음' };
  try { const r = await pollPending(3); if (r.fresh.length) await notifyPending(r.fresh); revalidatePath('/pending'); revalidatePath('/'); return { ok: true, msg: `applyStatus=${r.code} 조회 ${r.total}건 → 상태 ${Object.entries(r.dist).map(([k, v]) => `${k}:${v}`).join(', ') || '없음'} · 대기 ${r.open}건 (신규 ${r.fresh.length}, 해소 ${r.resolved})` }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
