// 쇼핑 진단 — 상품 주소(단일=스마트스토어 상품번호, 원부=가격비교 번호)로 시크릿 지수 결과에서 그 상품을 찾아 10위권 기준과 비교한다.
// 피드백·카톡 문구는 AI 가 아니라 숫자 규칙으로만 만든다 (없는 숫자가 나오지 않게)
import { search, type Product } from '@/lib/nsc';
export type Target = { kind: 'single' | 'catalog'; no: string };
export type Item = { rank: number | null; title: string; mall: string; link: string; price: number; review: number; keep: number; click: number; sale: number; quality: number; score: number; kind: string };
export type Base = { n: number; click: number; sale: number; quality: number; review: number; keep: number; price: number; score: number };
export type KwRow = { keyword: string; total: number; rank: number | null; mine: Item | null; base: Base | null; first: Item | null; same: { rank: number; title: string }[]; fetched_at: string; err?: string };
export type Diag = { target: Target; title: string; mall: string; self: Item | null; selfFrom: string; rows: KwRow[]; scores: { expo: number; click: number | null; sales: number | null; info: number | null; total: number }; grade: string; bad: string[]; good: string[]; talk: string; lookups: number };

/** 주소에서 번호 뽑기 — 단일은 단일로, 원부는 원부로만 맞춘다 */
export function parseTarget(url: string): Target | null {
  const u = String(url ?? '').trim();
  let m = u.match(/catalog\/(\d{6,})/); if (m) return { kind: 'catalog', no: m[1] };
  m = u.match(/naver\.com\/[^?#]*products\/(\d{6,})/); if (m) return { kind: 'single', no: m[1] };
  return null;
}
const isCatalog = (p: Product) => p.상품유형 === '가격비교' || (!p.mallName && !p.link);
const match = (p: Product, t: Target) => t.kind === 'catalog' ? isCatalog(p) && String(p.nvmid ?? '') === t.no : !isCatalog(p) && new RegExp(`/products/${t.no}(\\D|$)`).test(p.link ?? '');
const item = (p: Product, withRank = true): Item => ({ rank: withRank ? p.rank : null, title: p.productTitle, mall: p.mallName, link: p.link, price: p.lowPrice, review: p.reviewCount, keep: p.keepCnt, click: p.hitStarScore, sale: p.saleStarScore, quality: p.qualityStarScore, score: Number(p.종합점수 ?? 0), kind: isCatalog(p) ? '가격비교' : '단일' });
const med = (a: number[]) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return 0; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** 10위권 기준선 = 8~12위 중앙값 (상품이 적으면 있는 만큼) */
function baseline(ps: Product[]): Base | null {
  let g = ps.filter(p => p.rank >= 8 && p.rank <= 12); if (g.length < 3) g = ps.slice(0, Math.min(10, ps.length)); if (!g.length) return null;
  return { n: g.length, click: med(g.map(p => p.hitStarScore)), sale: med(g.map(p => p.saleStarScore)), quality: med(g.map(p => p.qualityStarScore)), review: Math.round(med(g.map(p => p.reviewCount))), keep: Math.round(med(g.map(p => p.keepCnt))), price: Math.round(med(g.map(p => p.lowPrice))), score: med(g.map(p => Number(p.종합점수 ?? 0))) };
}
/** 긴 상품명 → 검색어 후보 (40자 제한, 단어 단위로 줄임) */
export function nameQueries(name: string): string[] {
  const w = String(name ?? '').replace(/[\[\]\(\)\{\},/·|+~!?*"'<>]/g, ' ').split(/\s+/).filter(Boolean); if (!w.length) return [];
  const fit = (ws: string[]) => { let s = ''; for (const x of ws) { const t = s ? s + ' ' + x : x; if (t.length > 40) break; s = t; } return s; };
  return Array.from(new Set([fit(w), fit(w.slice(0, 5)), fit(w.slice(0, 4))].filter(s => s.length >= 4)));
}
const squish = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const ratio = (mine: number, base: number) => base > 0 ? Math.min(1, mine / base) : mine > 0 ? 1 : 0.6;
const rankScore = (r: number | null) => r == null ? 5 : r <= 3 ? 100 : r <= 5 ? 92 : r <= 10 ? 80 : r <= 20 ? 62 : r <= 40 ? 45 : r <= 70 ? 30 : 18;
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1); const num = (n: number) => Math.round(n).toLocaleString('ko-KR');

export async function runDiag(input: { url: string; keywords: string[]; name?: string; honor?: string }, userId: string): Promise<Diag> {
  const target = parseTarget(input.url); if (!target) throw new Error('상품 주소를 알아볼 수 없습니다 (스마트스토어 상품 주소 또는 가격비교 catalog 주소)');
  const kws = Array.from(new Set(input.keywords.map(k => k.trim().replace(/\s+/g, ' ')).filter(Boolean))).slice(0, 5); if (!kws.length) throw new Error('키워드를 1개 이상 넣어 주세요');
  let lookups = 0; let self: Item | null = null; let selfFrom = '';
  const rows: KwRow[] = await Promise.all(kws.map(async (keyword): Promise<KwRow> => {
    try {
      const r = await search(keyword, userId); if (!r.cached) lookups++;
      const hit = r.products.find(p => match(p, target)) ?? null; const mall = hit?.mallName ?? '';
      return { keyword, total: r.products.length, rank: hit ? hit.rank : null, mine: hit ? item(hit) : null, base: baseline(r.products), first: r.products[0] ? item(r.products[0]) : null,
        same: mall ? r.products.filter(p => p.mallName === mall && p !== hit).map(p => ({ rank: p.rank, title: p.productTitle })).slice(0, 12) : [], fetched_at: r.fetched_at };
    } catch (e: any) { return { keyword, total: 0, rank: null, mine: null, base: null, first: null, same: [], fetched_at: '', err: String(e?.message ?? e).slice(0, 120) }; }
  }));
  const found = rows.find(r => r.mine); if (found?.mine) { self = found.mine; selfFrom = `'${found.keyword}' 목록`; }
  if (!self && input.name?.trim()) {   // 100위 밖 — 줄인 상품명으로 검색해 번호가 같은 행만 쓴다
    for (const q of nameQueries(input.name)) { try { const r = await search(q, userId); if (!r.cached) lookups++; const hit = r.products.find(p => match(p, target)); if (hit) { self = item(hit, false); selfFrom = `상품명 검색 「${q}」`; break; } } catch { /* 다음 후보 */ } }
  }
  const main = rows.find(r => !r.err) ?? rows[0]; const b = main?.base ?? null; const title = self?.title || input.name?.trim() || ''; const mall = self?.mall ?? '';
  // 같은 스토어 상품 (100위 밖이라 스토어명을 뒤늦게 안 경우 다시 채움)
  const expo = Math.round(rows.filter(r => !r.err).reduce((a, r) => a + rankScore(r.rank), 0) / Math.max(1, rows.filter(r => !r.err).length));
  const inTitle = (k: string) => !!title && squish(title).includes(squish(k));
  const click = self && b ? Math.round(ratio(self.click, b.click) * 100) : null;
  const sales = self && b ? Math.round((ratio(self.sale, b.sale) + ratio(self.review, b.review) + ratio(self.keep, b.keep)) / 3 * 100) : null;
  const info = self && b ? Math.round(50 * ratio(self.quality, b.quality) + 50 * (kws.filter(inTitle).length / kws.length)) : null;
  const total = click == null || sales == null || info == null ? expo : Math.round(expo * .35 + click * .30 + sales * .25 + info * .10);
  const grade = total >= 83 ? '우수' : total >= 66 ? '양호' : total >= 50 ? '보통' : total >= 33 ? '주의' : '보완 필요';
  const bad: string[] = [], good: string[] = [];
  for (const r of rows) { if (r.err) continue; if (r.rank == null) bad.push(`'${r.keyword}' 100위 안에 노출되지 않습니다.`); else if (r.rank > 10) bad.push(`'${r.keyword}' ${r.rank}위로 10위권 밖에 있습니다.`); else good.push(`'${r.keyword}' ${r.rank}위입니다.`); }
  if (self && b) {
    (self.click < b.click ? bad : good).push(`클릭(유입) 지수 ${f1(self.click)} / 10위권 기준 ${f1(b.click)}`);
    (self.sale < b.sale ? bad : good).push(`판매 지수 ${f1(self.sale)} / 10위권 기준 ${f1(b.sale)}`);
    (self.review < b.review ? bad : good).push(`리뷰 ${num(self.review)}개 / 10위권 기준 ${num(b.review)}개`);
    (self.keep < b.keep ? bad : good).push(`찜 ${num(self.keep)} / 10위권 기준 ${num(b.keep)}`);
    if (b.price > 0 && self.price > 0) (self.price > b.price * 1.15 ? bad : good).push(`가격 ${num(self.price)}원 / 10위권 기준 ${num(b.price)}원`);
  } else if (!self) bad.push('100위 밖이라 상품 지수를 확인하지 못했습니다 — 상품명을 넣으면 상품명으로 다시 찾습니다.');
  if (title) for (const k of kws) if (!inTitle(k)) bad.push(`상품명에 '${k}'가 그대로 들어 있지 않습니다.`);
  if (main && main.same.length >= 2) bad.push(`'${main.keyword}'에 같은 스토어 상품이 ${main.same.length + (main.mine ? 1 : 0)}개 있어 유입이 나뉩니다.`);
  return { target, title, mall, self, selfFrom, rows, scores: { expo, click, sales, info, total }, grade, bad: bad.slice(0, 8), good: good.slice(0, 8), talk: talkText({ honor: input.honor, main, self, title }), lookups };
}
/** 고객에게 보낼 카톡 문구 — 지수 숫자는 넣되 매체·작업 방식은 넣지 않는다 */
export function talkText(a: { honor?: string; main: KwRow | undefined; self: Item | null; title: string }): string {
  const { main, self } = a; const b = main?.base; if (!main || !b) return ''; const honor = (a.honor ?? '').trim() || '대표님';
  const L: string[] = [`${honor}, '${main.keyword}' 기준으로 정리해 드립니다.`, '', `■ ${a.title ? a.title.slice(0, 34) : '해당 상품'} — 현재 ${main.rank != null ? main.rank + '위' : '100위 밖'}`];
  if (!self) { L.push('· 100위 밖이라 상품 지수는 확인 중입니다'); return L.join('\n'); }
  const ok: string[] = [], gap: string[] = []; const okN: string[] = [], gapN: string[] = [];
  const put = (good: boolean, line: string, name: string, tailOk: string, tailBad: string) => { (good ? ok : gap).push(`· ${line} → ${good ? tailOk : tailBad}`); (good ? okN : gapN).push(name); };
  put(self.sale >= b.sale, `판매 지수 ${f1(self.sale)} / 10위권 기준 ${f1(b.sale)}`, '판매', '충분', '부족');
  put(self.review >= b.review, `리뷰 ${num(self.review)}개 / 10위권 기준 ${num(b.review)}개`, '리뷰', '충분', '부족');
  if (b.price > 0 && self.price > 0) put(self.price <= b.price * 1.15, `가격 ${num(self.price)}원 / 10위권 기준 ${num(b.price)}원`, '가격', self.price < b.price * .95 ? '경쟁력 있음' : '비슷한 수준', '높은 편');
  put(self.keep >= b.keep, `찜 ${num(self.keep)} / 10위권 기준 ${num(b.keep)}`, '찜', '충분', '부족');
  put(self.click >= b.click, `클릭 지수 ${f1(self.click)} / 10위권 기준 ${f1(b.click)}`, '클릭(유입)', '충분', '여기가 비어 있습니다');
  L.push(...ok, ...gap, '', '■ 요약');
  if (okN.length) L.push(`${okN.join('·')}${okN.length > 1 ? '은' : '은(는)'} 이미 10위권 수준입니다.`);
  if (gapN.length) L.push(`비어 있는 곳은 ${gapN.join('·')}입니다. 이 부분이 채워지지 않아 ${main.rank != null ? main.rank + '위' : '100위 밖'}에 머물러 있습니다.`);
  else L.push('주요 항목이 모두 10위권 수준입니다.');
  if (a.title && !squish(a.title).includes(squish(main.keyword))) L.push('', '■ 바로 손보실 수 있는 부분', `상품명에 '${main.keyword}'가 그대로 들어 있지 않습니다. 키워드와의 연결이 약해지는 부분이라 상품명 보완을 권해 드립니다.`);
  if (main.same.length >= 2) L.push('', `같은 키워드에 귀사 상품이 ${main.same.length + (main.mine ? 1 : 0)}개 올라와 있어 유입이 나뉘는 점도 함께 보시면 좋습니다.`);
  return L.join('\n');
}
