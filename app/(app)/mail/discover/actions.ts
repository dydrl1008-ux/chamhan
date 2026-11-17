'use server';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { adConfigured } from '@/lib/naverAd';
import { discoverCore, kwAutoState, kwAutoSet, type KwAuto } from '@/lib/kwDiscover';
type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
export type PoolRow = { keyword: string; vol: number; seed: string };
const head = async () => { const me = await getProfile(); return me && me.role === 'head' ? me : null; };
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const needSql = (m: string) => /mail_kw_pool/.test(m) ? '0085 SQL(mail_kw_pool 표)을 먼저 실행해 주세요' : m;

/** 이미 수집된 키워드 (메일 대상에 있는 것) */
async function haveSet(sb: ReturnType<typeof supabaseAdmin>): Promise<{ set: Set<string>; list: string[] }> {
  const { data } = await sb.rpc('mail_keywords_json'); const list = ((data ?? []) as { keyword: string }[]).map(k => k.keyword);
  return { set: new Set(list.map(norm)), list };
}
async function waiting(sb: ReturnType<typeof supabaseAdmin>, have: Set<string>, limit: number): Promise<PoolRow[]> {
  const out: PoolRow[] = [];
  for (let from = 0; out.length < limit && from < 20000; from += 1000) {   // 그 사이 수집된 키워드는 건너뛰며 채운다
    const { data, error } = await sb.from('mail_kw_pool').select('keyword,vol,seed').is('taken_at', null).order('vol', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(needSql(error.message)); if (!data?.length) break;
    for (const r of data as PoolRow[]) { if (!have.has(norm(r.keyword))) out.push(r); if (out.length >= limit) break; }
    if (data.length < 1000) break;
  }
  return out;
}
export async function poolState(): Promise<R<{ wait: number; taken: number; have: number; top: PoolRow[]; ad: boolean }>> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  try {
    const sb = supabaseAdmin(); const { set } = await haveSet(sb);
    const [{ count: w, error }, { count: t }] = await Promise.all([
      sb.from('mail_kw_pool').select('keyword', { count: 'exact', head: true }).is('taken_at', null),
      sb.from('mail_kw_pool').select('keyword', { count: 'exact', head: true }).not('taken_at', 'is', null)]);
    if (error) return { ok: false, msg: needSql(error.message) };
    return { ok: true, msg: '', wait: w ?? 0, taken: t ?? 0, have: set.size, top: await waiting(sb, set, 60), ad: adConfigured() };
  } catch (e: any) { return { ok: false, msg: String(e?.message ?? e) }; }
}
export async function discover(seedText: string, minVol: number): Promise<R<{ added: number; seen: number; seeds: string[] }>> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  const r = await discoverCore(supabaseAdmin(), String(seedText ?? '').split(/[\n,]+/), minVol);
  return r.ok ? { ok: true, msg: r.msg, added: r.added, seen: r.seen, seeds: r.seeds } : { ok: false, msg: r.msg };
}
export async function autoState(): Promise<KwAuto | null> { const me = await head(); if (!me) return null; return kwAutoState(supabaseAdmin()); }
export async function autoSet(v: { on?: boolean; minVol?: number }): Promise<R> { const me = await head(); if (!me) return { ok: false, msg: '총괄만' }; await kwAutoSet(supabaseAdmin(), v); return { ok: true, msg: '저장됨' }; }
/** 검색량 높은 순으로 n개 가져가기 — 가져간 것으로 표시 */
export async function take(n: number): Promise<R<{ list: PoolRow[] }>> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  try {
    const sb = supabaseAdmin(); const { set } = await haveSet(sb); const list = await waiting(sb, set, Math.max(1, Math.min(500, Math.round(Number(n) || 100))));
    if (!list.length) return { ok: false, msg: '가져갈 키워드가 없습니다 — 먼저 「키워드 찾기」' };
    const { error } = await sb.from('mail_kw_pool').update({ taken_at: new Date().toISOString() }).in('keyword', list.map(r => r.keyword));
    if (error) return { ok: false, msg: needSql(error.message) };
    return { ok: true, msg: `${list.length}개 가져감`, list };
  } catch (e: any) { return { ok: false, msg: String(e?.message ?? e) }; }
}
/** 방금 가져간 걸 되돌리기 (추출을 안 돌렸을 때) */
export async function untake(keywords: string[]): Promise<R> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  const { error } = await supabaseAdmin().from('mail_kw_pool').update({ taken_at: null }).in('keyword', (keywords ?? []).slice(0, 500));
  return error ? { ok: false, msg: needSql(error.message) } : { ok: true, msg: '되돌림 — 다음 목록에 다시 나옵니다' };
}
