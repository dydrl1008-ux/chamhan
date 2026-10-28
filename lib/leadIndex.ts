// 콜 리스트용 상품 지수 — 시크릿 지수(nsc_searches) 캐시에서 리드의 키워드·상품을 찾아 붙임 (새 조회 없음)
import { createClient } from '@supabase/supabase-js';
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
export type LeadIndex = { rank: number | null; total: number | null; hit: number; sale: number; quality: number; review: number; reviewCount: number; diag: string | null; fetched_at: string; matched: 'product' | 'mall'; by: 'name' | 'keyword' };
const norm = (t: string) => (t ?? '').toLowerCase().replace(/\s|\(주\)|주식회사|스토어|store|공식|몰$/g, '');
const pid = (url: string) => url.match(/\/products\/(\d+)/)?.[1] ?? null;
/** leads(keyword, product_url, store_name) → id별 지수. 캐시된 키워드만 */
/** 시크릿 지수 검색어로 쓸 상품명 (사이트 제한 40자) */
export const nameQuery = (name: string) => (name ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
export async function leadIndexes(rows: { id: number; keyword: string; product_url?: string; store_name: string; category?: string }[]): Promise<Record<number, LeadIndex>> {
  // 조회 키: 상품명(정확) 우선, 키워드(상위 100 안에 있을 때만) 보조
  const keyOf = (r: typeof rows[number]) => [nameQuery(r.category ?? ''), r.keyword.trim().replace(/\s+/g, ' ')].filter(Boolean);
  const kws = [...new Set(rows.flatMap(keyOf))]; if (!kws.length) return {};
  const out: Record<number, LeadIndex> = {};
  for (let i = 0; i < kws.length; i += 100) {
    const { data } = await admin().from('nsc_searches').select('keyword,data,fetched_at').in('keyword', kws.slice(i, i + 100));
    for (const s of data ?? []) {
      const prods: any[] = s.data?.products ?? [];
      for (const r of rows) {
        if (!keyOf(r).includes(s.keyword)) continue;
        if (out[r.id] && out[r.id].matched === 'product') continue;   // 상품ID로 이미 찾았으면 유지
        const id = r.product_url ? pid(r.product_url) : null;
        let p = id ? prods.find(x => String(x.link ?? '').includes(`/products/${id}`) || String(x.nvmid ?? '') === id) : undefined; let how: 'product' | 'mall' = 'product';
        if (!p) { p = prods.find(x => norm(String(x.mallName ?? '')) === norm(r.store_name)); how = 'mall'; }
        if (!p) continue;
        const n = (v: unknown) => Number(v ?? 0) || 0;
        out[r.id] = { rank: n(p.rank) || null, total: p['종합점수'] != null ? n(p['종합점수']) : (p.prediction?.['종합점수'] != null ? n(p.prediction['종합점수']) : null), hit: n(p.hitStarScore), sale: n(p.saleStarScore), quality: n(p.qualityStarScore), review: n(p.reviewCountStarScore), reviewCount: n(p.reviewCount), diag: p['진단'] ?? p.prediction?.['진단'] ?? null, fetched_at: s.fetched_at, matched: how, by: s.keyword === r.keyword.trim().replace(/\s+/g, ' ') ? 'keyword' : 'name' };
      }
    }
  }
  return out;
}
