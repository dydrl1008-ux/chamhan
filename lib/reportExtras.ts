// 고객 순위 리포트에 붙는 추가 내용 — 월 검색수 · 검색이 늘어나는 달 · 바로 위 경쟁 상품 · 상품 지수 변화 · 추가 키워드 후보.
// 경쟁 상품은 순위 체크가 그날 받아 둔 조회 결과(nsc_searches)만 읽는다 — 리포트를 연다고 새 조회(과금)가 나가지 않는다
import { supabaseAdmin } from '@/lib/supabase/admin';
import { keywordVolumes, adConfigured, type KwVol } from '@/lib/naverAd';
import { looksProduct, kwNorm } from '@/lib/kwDiscover';
import { watchRows } from '@/lib/rankWatch';
import { monthTrend, datalabConfigured, type Season } from '@/lib/datalab';

export type Rival = { rank: number; title: string; mall: string; price: number; review: number; keep: number; me: boolean };
export type Pair = [number | null, number | null];   // [시작, 현재]
export type KwExtra = { vol: { pc: number; mobile: number; total: number } | null; season: Season | null; rivals: Rival[]; rivalsAt: string | null; idx: { click: Pair; sale: Pair; quality: Pair } | null };
export type Suggest = { keyword: string; total: number; forKw: string };
export type Extras = { byId: Record<string, KwExtra>; suggest: Suggest[]; notes: string[] };

const sp = (s: string) => s.trim().replace(/\s+/g, ' ');
const SEASON_DAYS = 30;

async function seasonOf(sb: ReturnType<typeof supabaseAdmin>, kw: string): Promise<Season | null> {
  const key = 'datalab:' + kwNorm(kw);
  const { data: c } = await sb.from('app_settings').select('value,updated_at').eq('key', key).maybeSingle();
  if (c?.value && Date.now() - new Date(c.updated_at).getTime() < SEASON_DAYS * 864e5) { try { return JSON.parse(c.value); } catch { /* 다시 받는다 */ } }
  const s = await monthTrend(kw);
  await sb.from('app_settings').upsert({ key, value: JSON.stringify(s), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return s;
}

/** 후보가 상품명 단어들만으로 이뤄졌는지 (2단어 이상) — 상품과 무관한 연관 키워드를 거른다 */
function madeOf(c: string, tokens: string[]): boolean {
  const n = c.length; const best: number[] = Array(n + 1).fill(-1); best[0] = 0;   // best[i] = c 앞 i글자를 만드는 최소 단어 수(안 되면 -1)
  for (let i = 0; i < n; i++) { if (best[i] < 0) continue; for (const t of tokens) if (c.startsWith(t, i)) { const j = i + t.length; if (best[j] < 0 || best[j] > best[i] + 1) best[j] = best[i] + 1; } }
  return best[n] >= 2;
}

export async function loadExtras(uid: string, group: string, start: string, end: string): Promise<Extras> {
  const sb = supabaseAdmin(); const notes: string[] = []; const byId: Record<string, KwExtra> = {};
  const rows = (await watchRows([uid])).filter(w => w.group === group);
  for (const w of rows) byId[w.id] = { vol: null, season: null, rivals: [], rivalsAt: null, idx: null };
  const kws = [...new Set(rows.map(w => sp(w.keyword)).filter(Boolean))]; if (!kws.length) return { byId, suggest: [], notes };

  // 1) 월 검색수 + 연관 키워드
  let rel: KwVol[] = [];
  if (!adConfigured()) notes.push('검색광고 API 키가 없어 월 검색수 · 추가 키워드를 넣지 못했습니다');
  else try { for (let i = 0; i < kws.length; i += 5) rel.push(...await keywordVolumes(kws.slice(i, i + 5))); } catch (e: any) { notes.push('월 검색수 조회 실패: ' + String(e?.message ?? e).slice(0, 80)); rel = []; }
  const volBy = new Map<string, KwVol>(); for (const r of rel) { const k = kwNorm(r.keyword); if (!volBy.has(k)) volBy.set(k, r); }

  // 2) 검색이 늘어나는 달
  const seasonBy = new Map<string, Season | null>();
  if (!datalabConfigured()) notes.push('데이터랩 키(NAVER_DATALAB_CLIENT_ID / NAVER_DATALAB_CLIENT_SECRET)가 없어 「검색이 늘어나는 달」은 빠졌습니다');
  else for (const k of kws) { try { seasonBy.set(k, await seasonOf(sb, k)); } catch (e: any) { if (!notes.some(n => n.startsWith('검색 흐름'))) notes.push('검색 흐름 조회 실패: ' + String(e?.message ?? e).slice(0, 80)); } }

  // 3) 경쟁 상품 — 순위 체크가 받아 둔 결과에서
  const cache = new Map<string, { products: any[]; at: string }>();
  for (let i = 0; i < kws.length; i += 20) { const { data } = await sb.from('nsc_searches').select('keyword,data,fetched_at').in('keyword', kws.slice(i, i + 20)); for (const r of data ?? []) cache.set(r.keyword, { products: ((r.data as any)?.products ?? []) as any[], at: r.fetched_at }); }

  // 4) 상품 지수 — 계약 기간 첫 기록 → 마지막 기록
  const hist = new Map<string, any[]>(); const ids = rows.map(w => String(w.id)); const since = new Date(start + 'T00:00:00+09:00').toISOString(), until = new Date(end + 'T23:59:59+09:00').toISOString();
  for (let i = 0; i < ids.length; i += 100) for (let off = 0; ; off += 1000) { const { data, error } = await sb.from('rank_watch_hist').select('watch_id,click,sale,quality,checked_at').in('watch_id', ids.slice(i, i + 100)).gte('checked_at', since).lte('checked_at', until).order('checked_at').range(off, off + 999); if (error) break; for (const h of data ?? []) hist.set(h.watch_id, [...(hist.get(h.watch_id) ?? []), h]); if (!data || data.length < 1000) break; }
  const pair = (hs: any[], f: 'click' | 'sale' | 'quality'): Pair => { const v = hs.map(h => h[f]).filter((x: any) => x != null).map(Number); return v.length ? [v[0], v[v.length - 1]] : [null, null]; };

  for (const w of rows) {
    const k = sp(w.keyword); const e = byId[w.id];
    const v = volBy.get(kwNorm(k)); if (v) e.vol = { pc: v.pc, mobile: v.mobile, total: v.total };
    e.season = seasonBy.get(k) ?? null;
    const c = cache.get(k);
    if (c && w.mid) {
      const ps = [...c.products].sort((a, b) => Number(a.rank) - Number(b.rank));
      const mine = ps.find(p => w.mid_type === '원부' ? String(p.nvmid ?? '') === String(w.mid) : String(p.link ?? '').includes(`/products/${w.mid}`));
      if (mine) { const r = Number(mine.rank); const want = new Set(r <= 3 ? [1, 2, 3, 4, 5] : [1, r - 2, r - 1, r]);
        e.rivals = ps.filter(p => want.has(Number(p.rank))).map(p => ({ rank: Number(p.rank), title: String(p.productTitle ?? '').slice(0, 60), mall: String(p.mallName ?? ''), price: Number(p.lowPrice) || 0, review: Number(p.reviewCount) || 0, keep: Number(p.keepCnt) || 0, me: p === mine }));
        e.rivalsAt = c.at; }
    }
    const hs = hist.get(String(w.id)) ?? []; const ix = { click: pair(hs, 'click'), sale: pair(hs, 'sale'), quality: pair(hs, 'quality') };
    if (ix.click[1] != null || ix.sale[1] != null || ix.quality[1] != null) e.idx = ix;
  }

  // 5) 추가 키워드 후보 — 상품명 단어들로만 이뤄진 연관 키워드(2단어 이상) · 상품이 아닌 검색어 · 이미 관리 중 · 자사 상호가 들어간 것은 제외
  const tracked = new Set(kws.map(kwNorm)); const brand = kwNorm(group); const cand: Suggest[] = []; const seen = new Set<string>();
  const byMid = new Map<string, typeof rows>(); for (const w of rows) byMid.set(String(w.mid ?? w.id), [...(byMid.get(String(w.mid ?? w.id)) ?? []), w]);
  for (const list of byMid.values()) {
    const title = list.map(w => w.title ?? '').sort((a, b) => b.length - a.length)[0]; if (!title) continue;
    const tokens = [...new Set([...title.split(/[^0-9A-Za-z가-힣]+/), ...list.map(w => w.keyword)].map(kwNorm).filter(t => t.length >= 2))];
    const own = [brand, ...list.map(w => kwNorm(w.store ?? ''))].filter(b => b.length >= 2);
    const mine = rel.filter(r => { const c = kwNorm(r.keyword); return r.total >= 200 && !tracked.has(c) && !seen.has(c) && looksProduct(r.keyword) && !own.some(b => c.includes(b)) && madeOf(c, tokens); }).slice(0, 2);
    for (const r of mine) { seen.add(kwNorm(r.keyword)); cand.push({ keyword: r.keyword, total: r.total, forKw: list[0].keyword }); }
  }
  return { byId, suggest: cand.sort((a, b) => b.total - a.total).slice(0, 4), notes };
}
