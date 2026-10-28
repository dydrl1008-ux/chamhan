'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { accountExists, ykrReady, watchRows, requeueWatch, addWatch, setWatchGroup, removeWatch } from '@/lib/ykreward';
type R = { ok: boolean; msg: string };
export async function linkAccount(login: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!ykrReady()) return { ok: false, msg: 'ykreward 연동 설정이 없습니다.' };
  const id = login.trim().toLowerCase(); if (!id) return { ok: false, msg: '아이디를 입력하세요' };
  const x = await accountExists(id); if (!x.ok) return { ok: false, msg: `ykreward 에 "${id}" 계정이 없습니다` };
  const { error } = await supabaseServer().from('reward_watch_links').upsert({ user_id: me.id, login_id: id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/rank-watch'); return { ok: true, msg: `ykreward 계정 연결: ${id} (${x.name})` };
}
export async function toggleGroupStar(groupKey: string, on: boolean): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseServer();
  const { error } = on ? await sb.from('reward_watch_stars').upsert({ user_id: me.id, group_key: groupKey }, { onConflict: 'user_id,group_key' }) : await sb.from('reward_watch_stars').delete().eq('user_id', me.id).eq('group_key', groupKey);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/rank-watch'); return { ok: true, msg: on ? `${groupKey} 주요 업체 — 순위 변동 시 알림` : `${groupKey} 주요 해제` };
}

/** 재체크 — 본인 연결 계정 담당 건만 (어드민·총괄은 전체). ids 비우고 group 주면 업체 전체 */
export async function recheck(p: { ids?: string[]; group?: string; login: string }): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!ykrReady()) return { ok: false, msg: 'ykreward 연동 설정이 없습니다.' };
  const sb = supabaseServer();
  const { data: link } = await sb.from('reward_watch_links').select('login_id').eq('user_id', me.id).maybeSingle();
  const all = me.role === 'admin' || me.role === 'head';
  if (!all && link?.login_id !== p.login) return { ok: false, msg: '본인 계정 담당 건만 재체크할 수 있습니다' };
  const rows = (await watchRows([p.login])).filter(w => p.ids?.length ? p.ids.includes(w.id) : p.group ? w.group === p.group : false);
  const r = await requeueWatch(rows); if (r.ok) revalidatePath('/rank-watch'); return r;
}

async function myLogin(): Promise<{ me: any; login: string } | null> {
  const me = await getProfile(); if (!me) return null;
  const { data } = await supabaseServer().from('reward_watch_links').select('login_id').eq('user_id', me.id).maybeSingle();
  return { me, login: data?.login_id ?? '' };
}
/** 등록: 내 계정 담당으로 */
export async function addItems(fd: FormData): Promise<R> {
  const x = await myLogin(); if (!x) return { ok: false, msg: '로그인 필요' };
  if (!x.login) return { ok: false, msg: '먼저 내 ykreward 계정을 연결하세요' };
  const r = await addWatch({ ownerLogin: x.login, url: String(fd.get('url') || ''), keywords: String(fd.get('keywords') || '').split(/[\n,，]/), group: String(fd.get('group') || ''), memo: String(fd.get('memo') || '') });
  if (r.ok) revalidatePath('/rank-watch'); return r;
}
/** 업체 이동 (내 계정 담당 건만) */
export async function moveGroup(ids: string[], group: string): Promise<R> {
  const x = await myLogin(); if (!x) return { ok: false, msg: '로그인 필요' };
  const mine = new Set((await watchRows([x.login])).map(w => w.id)); const ok = ids.filter(i => mine.has(i));
  if (!ok.length) return { ok: false, msg: '본인 계정 담당 건만 옮길 수 있습니다' };
  const r = await setWatchGroup(ok, group); if (r.ok) revalidatePath('/rank-watch'); return r;
}
export async function removeItems(ids: string[]): Promise<R> {
  const x = await myLogin(); if (!x) return { ok: false, msg: '로그인 필요' };
  const mine = new Set((await watchRows([x.login])).map(w => w.id)); const ok = ids.filter(i => mine.has(i));
  if (!ok.length) return { ok: false, msg: '본인 계정 담당 건만 삭제할 수 있습니다' };
  const r = await removeWatch(ok); if (r.ok) revalidatePath('/rank-watch'); return r;
}
