// 콜 리스트용 상품 지수 — 시크릿 지수(nsc_searches) 캐시에서 리드의 키워드·상품을 찾아 붙임 (새 조회 없음)
import { createClient } from '@supabase/supabase-js';
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
export type LeadIndex = { rank: number | null; total: number | null; hit: number; sale: number; quality: number; review: number; reviewCount: number; diag: string | null; fetched_at: string; matched: 'product' | 'mall' };
const norm = (t: string) => (t ?? '').toLowerCase().replace(/\s|\(주\)|주식회사|스토어|store|공식|몰$/g, '');
const pid = (url: string) => url.match(/\/products\/(\d+)/)?.[1] ?? null;
/** leads(keyword, product_url, store_name) → id별 지수. 캐시된 키워드만 */
export async function leadIndexes(rows: { id: number; keyword: string; product_url?: string; store_name: string }[]): Promise<Record<number, LeadIndex>> {
  const kws = [...new Set(rows.map(r => r.keyword.trim().replace(/\s+/g, ' ')).filter(Boolean))]; if (!kws.length) return {};
  const out: Record<number, LeadIndex> = {};
  for (let i = 0; i < kws.length; i += 100) {
    const { data } = await admin().from('nsc_searches').select('keyword,data,fetched_at').in('keyword', kws.slice(i, i + 100));
    for (const s of data ?? []) {
      const prods: any[] = s.data?.products ?? [];
      for (const r of rows) {
        if (r.keyword.trim().replace(/\s+/g, ' ') !== s.keyword) continue;
        const id = r.product_url ? pid(r.product_url) : null;
        let p = id ? prods.find(x => String(x.link ?? '').includes(`/products/${id}`) || String(x.nvmid ?? '') === id) : undefined; let how: 'product' | 'mall' = 'product';
        if (!p) { p = prods.find(x => norm(String(x.mallName ?? '')) === norm(r.store_name)); how = 'mall'; }
        if (!p) continue;
        const n = (v: unknown) => Number(v ?? 0) || 0;
        out[r.id] = { rank: n(p.rank) || null, total: p['종합점수'] != null ? n(p['종합점수']) : (p.prediction?.['종합점수'] != null ? n(p.prediction['종합점수']) : null), hit: n(p.hitStarScore), sale: n(p.saleStarScore), quality: n(p.qualityStarScore), review: n(p.reviewCountStarScore), reviewCount: n(p.reviewCount), diag: p['진단'] ?? p.prediction?.['진단'] ?? null, fetched_at: s.fetched_at, matched: how };
      }
    }
  }
  return out;
}
