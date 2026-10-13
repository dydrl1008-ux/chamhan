// 시크릿 지수 — navershopping-click.vercel.app 연동 (대표 계정 세션 쿠키 1개를 서버에서만 사용)
// 환경변수: NSC_BASE_URL(기본 https://navershopping-click.vercel.app), NSC_SESSION(브라우저 'session=…' 쿠키 값), NSC_SEARCH_PATH(기본 /api/search), NSC_ME_PATH(기본 /api/me)
import { createClient } from '@supabase/supabase-js';
const BASE = () => (process.env.NSC_BASE_URL || 'https://navershopping-click.vercel.app').replace(/\/$/, '');
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const cookie = () => { const v = (process.env.NSC_SESSION || '').trim(); if (!v) throw new Error('NSC_SESSION 환경변수 없음 (시크릿 지수 사이트 세션 쿠키)'); return v.startsWith('session=') ? v : `session=${v}`; };
const H = (json = false) => ({ Cookie: cookie(), Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Referer: `${BASE()}/app`, Origin: BASE(), ...(json ? { 'Content-Type': 'application/json' } : {}) });
async function call(path: string, init: RequestInit) {
  const res = await fetch(`${BASE()}${path}`, { ...init, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  if (res.status === 401 || res.status === 403 || res.status === 302) throw new Error('시크릿 지수 사이트 로그인이 풀렸습니다 — Vercel 환경변수 NSC_SESSION 을 새 쿠키로 바꿔주세요');
  let j: any; try { j = JSON.parse(text); } catch { throw new Error(`응답이 JSON 이 아님 (${res.status}) ${text.slice(0, 80)}`); }
  if (res.status >= 400 || j?.success === false) throw new Error(j?.error || j?.message || `사이트 오류 ${res.status}`);
  return j;
}
export type NscUser = { name?: string; plan_name?: string; daily_limit?: number; remaining?: number; used_today?: number };
export async function me(): Promise<NscUser> { const j = await call(process.env.NSC_ME_PATH || '/api/me', { headers: H() }); return j.user ?? j; }

export type Product = { rank: number; prev_rank?: number | null; rank_delta?: number; productTitle: string; mallName: string; link: string; imageUrl?: string; lowPrice: number; reviewCount: number; keepCnt: number; purchaseCnt?: number; hitStarScore: number; saleStarScore: number; qualityStarScore: number; reviewCountStarScore: number; 종합점수?: number; 진단?: string; 상품유형?: string; openDate?: string; nvmid?: number | string; category?: string };
export type NscResult = { keyword: string; fetched_at: string; cached: boolean; products: Product[]; summary: any; entry_bar: any; opportunities: any; brief: any; trend: string[]; insights1st: any; user?: NscUser };
const n = (v: unknown) => Number(v ?? 0) || 0;
function slim(data: any): Omit<NscResult, 'keyword' | 'fetched_at' | 'cached'> {
  const products: Product[] = (data?.products ?? []).map((p: any) => ({ rank: n(p.rank), prev_rank: p.prev_rank ?? null, rank_delta: p.rank_delta, productTitle: String(p.productTitle ?? ''), mallName: String(p.mallName ?? ''), link: String(p.link ?? ''), imageUrl: p.imageUrl, lowPrice: n(p.lowPrice), reviewCount: n(p.reviewCount), keepCnt: n(p.keepCnt), purchaseCnt: n(p.purchaseCnt), hitStarScore: n(p.hitStarScore), saleStarScore: n(p.saleStarScore), qualityStarScore: n(p.qualityStarScore), reviewCountStarScore: n(p.reviewCountStarScore), 종합점수: n(p['종합점수'] ?? p.prediction?.['종합점수']), 진단: p['진단'] ?? p.prediction?.['진단'], 상품유형: p['상품유형'], openDate: p.openDate, nvmid: p.nvmid, category: p.category }));
  const r = data?.report ?? {}; const ins = data?.insights ?? {};
  return { products, summary: r.summary ?? null, entry_bar: r.entry_bar ?? null, opportunities: r.opportunities ?? null, brief: ins['셀러브리프'] ?? null, trend: ins['트렌드'] ?? [], insights1st: ins['1등분석'] ?? null };
}
/** 키워드 조회: 캐시(기본 24h) 우선, 없으면 사이트 호출(과금). 1인 하루 한도 초과 시 거부 */
export async function search(keyword: string, userId: string, force = false): Promise<NscResult> {
  const kw = keyword.trim().replace(/\s+/g, ' '); if (!kw) throw new Error('키워드를 입력하세요'); if (kw.length > 40) throw new Error('키워드가 너무 깁니다');
  const sb = admin();
  const { data: cfg } = await sb.from('app_settings').select('key,value').in('key', ['nsc_daily_per_user', 'nsc_cache_hours']);
  const perUser = Number(cfg?.find(x => x.key === 'nsc_daily_per_user')?.value ?? 10), cacheH = Number(cfg?.find(x => x.key === 'nsc_cache_hours')?.value ?? 24);
  const { data: hit } = await sb.from('nsc_searches').select('keyword,data,fetched_at').eq('keyword', kw).maybeSingle();
  const fresh = hit && Date.now() - new Date(hit.fetched_at).getTime() < cacheH * 3600e3;
  if (fresh && !force) { await sb.from('nsc_queries').insert({ user_id: userId, keyword: kw, cached: true }); return { keyword: kw, fetched_at: hit.fetched_at, cached: true, ...slim(hit.data) }; }
  // 한도: 오늘(KST) 실제 호출 수
  const kstDay = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); const dayStart = new Date(kstDay + 'T00:00:00+09:00').toISOString();
  const { count } = await sb.from('nsc_queries').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('cached', false).gte('at', dayStart);
  if ((count ?? 0) >= perUser) throw new Error(`오늘 조회 한도(${perUser}회)를 다 썼습니다. 캐시된 키워드는 계속 볼 수 있어요`);
  const j = await call(process.env.NSC_SEARCH_PATH || '/api/search', { method: 'POST', headers: H(true), body: JSON.stringify({ keyword: kw }) });
  const data = j.data ?? j; const now = new Date().toISOString();
  await sb.from('nsc_searches').upsert({ keyword: kw, data, fetched_at: now, fetched_by: userId }, { onConflict: 'keyword' });
  await sb.from('nsc_queries').insert({ user_id: userId, keyword: kw, cached: false });
  return { keyword: kw, fetched_at: now, cached: false, ...slim(data), user: j.user ? { name: j.user.name, plan_name: j.user.plan_name, daily_limit: j.user.daily_limit, remaining: j.user.remaining, used_today: j.user.used_today } : undefined };
}
export async function recent(limit = 30) { const { data } = await admin().from('nsc_searches').select('keyword,fetched_at').order('fetched_at', { ascending: false }).limit(limit); return data ?? []; }
export async function myUsage(userId: string) { const sb = admin(); const kstDay = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); const dayStart = new Date(kstDay + 'T00:00:00+09:00').toISOString(); const { count } = await sb.from('nsc_queries').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('cached', false).gte('at', dayStart); const { data: cfg } = await sb.from('app_settings').select('value').eq('key', 'nsc_daily_per_user').maybeSingle(); return { used: count ?? 0, limit: Number(cfg?.value ?? 10) }; }
