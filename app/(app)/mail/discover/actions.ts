'use server';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { keywordVolumes, adConfigured } from '@/lib/naverAd';
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
/** 연관 키워드 찾기 — 씨앗(직접 입력, 없으면 수집된 키워드 중 무작위 25개)을 5개씩 묶어 검색광고 API 5번 호출. 이미 수집·후보에 있는 건 빼고 쌓는다 */
export async function discover(seedText: string, minVol: number): Promise<R<{ added: number; seen: number; seeds: string[] }>> {
  const me = await head(); if (!me) return { ok: false, msg: '총괄만' };
  if (!adConfigured()) return { ok: false, msg: '검색광고 API 환경변수가 없습니다 (NAVER_AD_CUSTOMER_ID / NAVER_AD_API_KEY / NAVER_AD_SECRET)' };
  const sb = supabaseAdmin(); const { set: have, list } = await haveSet(sb); const min = Math.max(0, Math.round(Number(minVol) || 0));
  let seeds = Array.from(new Set(String(seedText ?? '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean))).slice(0, 25);
  if (!seeds.length) { const pool = [...list]; for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } seeds = pool.slice(0, 25); }
  if (!seeds.length) return { ok: false, msg: '씨앗 키워드가 없습니다 — 위 칸에 키워드를 몇 개 적어 주세요' };
  const found = new Map<string, { keyword: string; vol: number; seed: string }>(); let seen = 0; const errs: string[] = [];
  for (let i = 0; i < seeds.length; i += 5) {
    const g = seeds.slice(i, i + 5);
    try { for (const k of await keywordVolumes(g)) { seen++; const kw = k.keyword.trim(); const key = norm(kw); if (!kw || kw.length > 20 || k.total < min || have.has(key) || found.has(key)) continue; found.set(key, { keyword: kw, vol: k.total, seed: g[0] }); } }
    catch (e: any) { errs.push(String(e?.message ?? e).slice(0, 80)); }
    await new Promise(r => setTimeout(r, 400));
  }
  if (!found.size) return errs.length ? { ok: false, msg: '검색광고 API 오류: ' + errs[0] } : { ok: true, msg: `새 키워드 없음 (연관 ${seen}개 확인 — 이미 있거나 검색량 ${min} 미만)`, added: 0, seen, seeds };
  const rows = [...found.values()]; let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await sb.from('mail_kw_pool').upsert(rows.slice(i, i + 500), { onConflict: 'keyword', ignoreDuplicates: true }).select('keyword');
    if (error) return { ok: false, msg: needSql(error.message) }; added += data?.length ?? 0;
  }
  return { ok: true, msg: `새 키워드 ${added}개 추가 (연관 ${seen}개 확인${errs.length ? ` · 일부 실패 ${errs.length}` : ''})`, added, seen, seeds };
}
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
