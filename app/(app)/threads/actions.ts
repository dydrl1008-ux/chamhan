'use server';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { thMe, encToken, nextSlots, requestPosts, publishPost, queueUp, type ThAccount, type Persona } from '@/lib/threads';
type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
export type ThView = { id: number; username: string; token_expires_at: string | null; enabled: boolean; per_day: number; hours: string; tail: string; tone: string; persona: Persona };
export type ThPost = { id: number; keyword: string; text: string; status: string; scheduled_at: string | null; posted_at: string | null; error: string | null };
const cut = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
const head = async () => { const me = await getProfile(); return me && me.is_active && me.role === 'head' ? me : null; };
const needSql = (m: string) => /persona/.test(m) ? '페르소나 SQL(한 줄)을 먼저 실행해 주세요' : /threads_/.test(m) ? '0088 SQL(쓰레드 표)을 먼저 실행해 주세요' : m;
const mine = async (sb: ReturnType<typeof supabaseAdmin>, uid: string) => { const { data, error } = await sb.from('threads_accounts').select('*').eq('owner_id', uid).maybeSingle(); if (error) throw new Error(needSql(error.message)); return (data ?? null) as ThAccount | null; };

export async function thState(): Promise<R<{ acc: ThView | null; queue: ThPost[]; done: ThPost[]; aiTask: number; rvTask: number }>> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  try {
    const sb = supabaseAdmin(); const a = await mine(sb, me.id); if (!a) return { ok: true, msg: '', acc: null, queue: [], done: [], aiTask: 0, rvTask: 0 };
    const sel = 'id,keyword,text,status,scheduled_at,posted_at,error';
    const [{ data: q }, { data: d }, { data: st }] = await Promise.all([
      sb.from('threads_posts').select(sel).eq('account_id', a.id).in('status', ['queued', 'hold']).order('scheduled_at', { ascending: true, nullsFirst: false }).limit(200),
      sb.from('threads_posts').select(sel).eq('account_id', a.id).in('status', ['posted', 'failed']).order('id', { ascending: false }).limit(40),
      sb.from('ai_settings').select('key,value').in('key', [`threads_ai_task:${a.id}`, `threads_rv_task:${a.id}`])]);
    const tk = (k: string) => Number((st ?? []).find(x => x.key === `${k}:${a.id}`)?.value) || 0;
    return { ok: true, msg: '', acc: { id: a.id, username: a.username, token_expires_at: a.token_expires_at, enabled: a.enabled, per_day: a.per_day, hours: a.hours, tail: a.tail, tone: a.tone, persona: (a.persona ?? {}) as Persona }, queue: (q ?? []) as ThPost[], done: (d ?? []) as ThPost[], aiTask: tk('threads_ai_task'), rvTask: tk('threads_rv_task') };
  } catch (e: any) { return { ok: false, msg: String(e?.message ?? e) }; }
}
/** 계정 연결 — 토큰을 확인하고 암호화해 저장. 토큰 값은 어디에도 돌려주지 않는다 */
export async function thConnect(token: string): Promise<R> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  const t = String(token ?? '').trim(); if (t.length < 30) return { ok: false, msg: '토큰을 붙여 넣어 주세요' };
  try {
    const u = await thMe(t); const sb = supabaseAdmin();
    const { error } = await sb.from('threads_accounts').upsert({ owner_id: me.id, username: u.username, th_user_id: String(u.id), token_enc: encToken(t), token_expires_at: new Date(Date.now() + 55 * 86400e3).toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'owner_id' });
    if (error) return { ok: false, msg: needSql(error.message) };
    return { ok: true, msg: `@${u.username} 연결됨` };
  } catch (e: any) { return { ok: false, msg: String(e?.message ?? e).slice(0, 200) }; }
}
export async function thSave(v: { enabled: boolean; per_day: number; hours: string; tail: string; persona: Persona }): Promise<R> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  const hours = Array.from(new Set(String(v.hours ?? '').split(/[,\s]+/).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 23))).sort((a, b) => a - b); if (!hours.length) return { ok: false, msg: '발행 시각을 0~23 사이 숫자로 적어 주세요 (예: 9,13,20)' };
  const per = Math.max(1, Math.min(hours.length, Math.round(Number(v.per_day) || 1)));
  const { error } = await supabaseAdmin().from('threads_accounts').update({ enabled: !!v.enabled, per_day: per, hours: hours.join(','), tail: String(v.tail ?? '').slice(0, 200), persona: { who: cut(v.persona?.who, 200), audience: cut(v.persona?.audience, 200), voice: cut(v.persona?.voice, 300), view: cut(v.persona?.view, 300), samples: cut(v.persona?.samples, 1500) }, updated_at: new Date().toISOString() }).eq('owner_id', me.id);
  return error ? { ok: false, msg: needSql(error.message) } : { ok: true, msg: `저장됨 — 하루 ${per}개 · ${hours.join('시, ')}시${v.enabled ? ' · 자동 발행 켜짐' : ' · 자동 발행 꺼짐'}` };
}
export async function thGenerate(): Promise<R> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  try { const sb = supabaseAdmin(); const a = await mine(sb, me.id); if (!a) return { ok: false, msg: '먼저 계정을 연결해 주세요' }; const r = await requestPosts(sb, a, Math.max(4, a.per_day * 2)); return r; } catch (e: any) { return { ok: false, msg: String(e?.message ?? e) }; }
}
/** 직접 쓴 글을 대기열에 추가 */
export async function thAdd(text: string): Promise<R> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  const t = String(text ?? '').trim(); if (t.length < 5 || t.length > 480) return { ok: false, msg: '글은 5~480자로 적어 주세요' };
  try {
    const sb = supabaseAdmin(); const a = await mine(sb, me.id); if (!a) return { ok: false, msg: '먼저 계정을 연결해 주세요' };
    const { data: taken } = await sb.from('threads_posts').select('scheduled_at').eq('account_id', a.id).in('status', ['queued', 'posted']).gte('scheduled_at', new Date(Date.now() - 86400e3).toISOString());
    const [slot] = nextSlots(a, (taken ?? []).map(r => r.scheduled_at).filter(Boolean) as string[], 1);
    const { error } = await sb.from('threads_posts').insert({ account_id: a.id, keyword: '', text: t, status: 'queued', scheduled_at: slot ?? null });
    return error ? { ok: false, msg: needSql(error.message) } : { ok: true, msg: '대기열에 추가됨' };
  } catch (e: any) { return { ok: false, msg: String(e?.message ?? e) }; }
}
export async function thEdit(id: number, v: { text?: string; del?: boolean }): Promise<R> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  const sb = supabaseAdmin(); const a = await mine(sb, me.id); if (!a) return { ok: false, msg: '계정 없음' };
  if (v.del) { const { error } = await sb.from('threads_posts').delete().eq('id', id).eq('account_id', a.id).in('status', ['queued', 'hold', 'failed']); return error ? { ok: false, msg: error.message } : { ok: true, msg: '삭제됨' }; }
  const t = String(v.text ?? '').trim(); if (t.length < 5 || t.length > 480) return { ok: false, msg: '글은 5~480자로 적어 주세요' };
  const { error } = await sb.from('threads_posts').update({ text: t }).eq('id', id).eq('account_id', a.id).in('status', ['queued', 'hold']);
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '저장됨' };
}
/** 보류된 글을 내가 확인하고 대기열로 올리기 */
export async function thRelease(id: number): Promise<R> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  const sb = supabaseAdmin(); const a = await mine(sb, me.id); if (!a) return { ok: false, msg: '계정 없음' };
  await queueUp(sb, a, [{ id }]); return { ok: true, msg: '대기열로 올렸습니다' };
}
/** 지금 바로 발행 (대기열의 글 한 개) */
export async function thPostNow(id: number): Promise<R> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  const sb = supabaseAdmin(); const a = await mine(sb, me.id); if (!a) return { ok: false, msg: '계정 없음' };
  const { data: p } = await sb.from('threads_posts').select('id,text,status').eq('id', id).eq('account_id', a.id).maybeSingle(); if (!p || !['queued', 'hold', 'failed'].includes(p.status)) return { ok: false, msg: '발행할 수 없는 글입니다' };
  const r = await publishPost(sb, a, p); return r.ok ? { ok: true, msg: '발행됨 — 쓰레드에서 확인해 보세요' } : { ok: false, msg: '발행 실패: ' + r.msg };
}
export async function thDisconnect(): Promise<R> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  const { error } = await supabaseAdmin().from('threads_accounts').delete().eq('owner_id', me.id);
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '연결 해제됨 (대기열·내역도 같이 지워졌습니다)' };
}
