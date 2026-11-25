'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { watchRows, checkWatch, addWatch, setWatchGroup, removeWatch, saveWatchOrder } from '@/lib/rankWatch';
type R = { ok: boolean; msg: string };
export async function toggleGroupStar(groupKey: string, on: boolean): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseServer();
  const { error } = on ? await sb.from('reward_watch_stars').upsert({ user_id: me.id, group_key: groupKey }, { onConflict: 'user_id,group_key' }) : await sb.from('reward_watch_stars').delete().eq('user_id', me.id).eq('group_key', groupKey);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/rank-watch'); return { ok: true, msg: on ? `${groupKey} 주요 업체 — 순위 변동 시 알림` : `${groupKey} 주요 해제` };
}

/** 재체크(바로 조회) — 본인 것만, 총괄·어드민은 누구 것이든. ids 비우고 group 주면 업체 전체 */
export async function recheck(p: { ids?: string[]; group?: string; user: string }): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const all = me.role === 'admin' || me.role === 'head'; if (!all && p.user !== me.id) return { ok: false, msg: '본인 담당 건만 재체크할 수 있습니다' };
  const rows = (await watchRows([p.user])).filter(w => p.ids?.length ? p.ids.includes(w.id) : p.group ? w.group === p.group : false);
  const r = await checkWatch(rows); if (r.ok) revalidatePath('/rank-watch'); return { ok: r.ok, msg: r.msg };
}
/** 등록: 내 담당으로 (단일 상품 링크 · 원부 링크 모두) */
export async function addItems(fd: FormData): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const r = await addWatch({ userId: me.id, url: String(fd.get('url') || ''), keywords: String(fd.get('keywords') || '').split(/[\n,，]/), group: String(fd.get('group') || ''), memo: String(fd.get('memo') || '') });
  if (r.ok) revalidatePath('/rank-watch'); return r;
}
/** 업체 이동 (내 계정 담당 건만) */
export async function moveGroup(ids: string[], group: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const mine = new Set((await watchRows([me.id])).map(w => w.id)); const ok = ids.filter(i => mine.has(i));
  if (!ok.length) return { ok: false, msg: '본인 담당 건만 옮길 수 있습니다' };
  const r = await setWatchGroup(ok, group); if (r.ok) revalidatePath('/rank-watch'); return r;
}
export async function removeItems(ids: string[]): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const mine = new Set((await watchRows([me.id])).map(w => w.id)); const ok = ids.filter(i => mine.has(i));
  if (!ok.length) return { ok: false, msg: '본인 담당 건만 삭제할 수 있습니다' };
  const r = await removeWatch(ok); if (r.ok) revalidatePath('/rank-watch'); return r;
}

/** 드래그 순서 저장 (본인 계정 담당만) */
export async function reorder(p: { groups?: string[]; items?: string[] }): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const r = await saveWatchOrder({ userId: me.id, ...p }); if (r.ok) revalidatePath('/rank-watch'); return r;
}

/** 업체(그룹) 추가 — 상품 없어도 목록에 뜸 */
export async function addGroup(name: string, memo = ''): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const n = name.trim(); if (!n || n === '(미분류)') return { ok: false, msg: '업체명을 입력하세요' };
  const { error } = await supabaseServer().from('reward_watch_groups').upsert({ user_id: me.id, name: n, memo: memo.trim() }, { onConflict: 'user_id,name' });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/rank-watch'); return { ok: true, msg: `업체 추가: ${n} — 이제 상품을 등록하세요` };
}
/** 빈 업체 삭제 (상품이 있으면 ykreward 쪽 상품부터) */
export async function removeGroup(name: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { error } = await supabaseServer().from('reward_watch_groups').delete().eq('user_id', me.id).eq('name', name);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/rank-watch'); return { ok: true, msg: '업체 삭제' };
}
