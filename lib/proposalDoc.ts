// 키워드 제안서 — 시크릿 지수(nsc) 조회 결과만으로 문장·수치를 전부 계산 (LLM 호출 없음)
import type { NscResult, Product } from '@/lib/nsc';

export type Target = { rank: number; mallName: string; title: string; price: number; reviews: number; image?: string | null; link?: string; hit?: number; sale?: number; quality?: number };
export type Brand = { name: string; nameEn: string; email: string; owner?: string; phone?: string };
export type Offer = { basic: string; rec: string };   // 옵션 가격 표기 (비우면 '담당자 안내')
export type Doc = {
  keyword: string; date: string; brand: Brand; target: Target | null;
  n: number; avgPrice: number; avgPrice10: number; avgReview: number; avgReview10: number; newRate: number; adCount10: number;
  minPrice10: number; maxPrice10: number; medianReview10: number;
  related: string[];
  top: Product[];                 // 상위 10
  priceBands: { label: string; count: number }[];
  axes: { key: string; label: string; desc: string; v: number }[];   // 0~5
  strongAxis: string;
  competition: { level: string; why: string }; barrier: { level: string; why: string }; timing: { level: string; why: string };
  facts: string[];                // 데이터 문장
  targetFacts: string[];          // 귀사 비교 문장 (target 있을 때)
  entry: { price: string; review: string };
  offer: Offer;
  natural10: number;            // (미사용) 상위 10 중 자연 노출 수
  /** 유입(리워드) 반영도 근거 */
  traffic: { verdict: '높음' | '보통' | '낮음'; why: string[]; inversions: number; lowReviewTop: number; hitTop: number; hitMid: number; saleTop: number; saleMid: number; midN: number };
  checklist: { label: string; ok: boolean | null; note: string }[];   // 귀사 조건 체크 (target 있을 때)
  gapTop10: number | null;      // 귀사 → 10위 계단 수
  meetsPrice: boolean; meetsReview: boolean;
};
const won = (n: number) => Math.round(n).toLocaleString('ko-KR') + '원';
const cnt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const isAd = (p: Product) => /광고|ad/i.test(String(p.상품유형 ?? ''));
const days = (d?: string) => d ? (Date.now() - new Date(d).getTime()) / 864e5 : NaN;

export function buildDoc(r: NscResult, brand: Brand, target: Target | null, offer: Offer = { basic: '', rec: '' }, date = new Date()): Doc {
  const ps = (r.products ?? []).filter(p => p.rank > 0).sort((a, b) => a.rank - b.rank);
  const top = ps.slice(0, 10); const prices = ps.map(p => p.lowPrice).filter(p => p > 0); const p10 = top.map(p => p.lowPrice).filter(p => p > 0);
  const reviews = ps.map(p => p.reviewCount); const r10 = top.map(p => p.reviewCount);
  const newRate = ps.length ? Math.round(100 * ps.filter(p => days(p.openDate) <= 90).length / ps.length) : 0;
  const adCount10 = top.filter(isAd).length;
  // 가격 분포 6구간
  const lo = Math.min(...prices, Infinity), hi = Math.max(...prices, 0); const step = Math.max(1, Math.ceil((hi - lo) / 6 / 1000) * 1000);
  const priceBands = Array.from({ length: 6 }, (_, i) => { const a = lo + i * step, b = a + step; return { label: a >= 10000 ? `${Math.round(a / 1000)}천` : `${Math.round(a / 1000)}천`, count: prices.filter(p => p >= a && (i === 5 ? p <= b : p < b)).length }; });
  // 지수 6축 (상위 10 평균, 0~5) — nsc 별점은 1~5
  const ax = (k: keyof Product) => avg(top.map(p => Number(p[k] ?? 0)).filter(v => v > 0));
  const fresh = top.length ? 5 * top.filter(p => days(p.openDate) <= 180).length / top.length : 0;
  const axes = [
    { key: 'hit', label: '인기도', desc: '조회·클릭·찜 등 관심 신호', v: ax('hitStarScore') },
    { key: 'quality', label: '적합도', desc: '키워드-상품 연관성', v: ax('qualityStarScore') },
    { key: 'fresh', label: '최신성', desc: '최근 등록·갱신 활발도', v: fresh },
    { key: 'review', label: '리뷰평점', desc: '구매 후 만족도', v: ax('reviewCountStarScore') },
    { key: 'sale', label: '판매지수', desc: '실제 판매 실적', v: ax('saleStarScore') },
    { key: 'click', label: '클릭지수', desc: '노출 대비 클릭 매력도', v: ax('hitStarScore') * 0.9 },
  ].map(a => ({ ...a, v: Math.round(Math.min(5, Math.max(0, a.v)) * 10) / 10 }));
  const strongAxis = [...axes].sort((a, b) => b.v - a.v)[0]?.label ?? '적합도';
  const avgReview10 = avg(r10), avgPrice10 = avg(p10);
  const diffScore = Number((r.summary as any)?.difficulty?.score ?? NaN);
  const competition = { level: !isNaN(diffScore) ? (diffScore >= 70 ? '높음' : diffScore >= 40 ? '보통' : '낮음') : (avgReview10 >= 3000 ? '높음' : avgReview10 >= 500 ? '보통' : '낮음'), why: `상위 ${ps.length}개 기준 · 1페이지 광고 ${adCount10}개` };
  const barrier = { level: avgReview10 >= 2000 ? '높음' : avgReview10 >= 300 ? '보통' : '낮음', why: `상위 10개 평균 리뷰 ${cnt(avgReview10)}개` };
  const timing = { level: newRate >= 20 ? '활발' : newRate >= 8 ? '보통' : '안정', why: `최근 90일 등록 ${newRate}%` };
  const related = (r.trend ?? []).map(t => String(t ?? '').trim()).filter(t => t && t !== r.keyword && t.length <= 12 && !/[:：]|\d+\s?(개|원|%|위)|제품|상품|리뷰/.test(t)).slice(0, 8);   // 키워드만 (문장형 인사이트 제외)
  const facts = [
    `상위 평균가 ${won(avgPrice10)} · 평균 리뷰 ${cnt(avgReview10)}개`,
    `상위 10개 — 광고 ${adCount10} / 자연 ${10 - adCount10}`,
    `상위 상품 최고 지수 — ${strongAxis}`,
  ];
  const targetFacts: string[] = [];
  if (target) {
    const pr = target.price, rv = target.reviews;
    if (pr > 0 && p10.length) targetFacts.push(pr >= Math.min(...p10) * 0.9 && pr <= Math.max(...p10) * 1.1 ? `가격 ${won(pr)} — 상위 10개 가격대(${won(Math.min(...p10))}~${won(Math.max(...p10))}) 안` : pr < Math.min(...p10) ? `가격 ${won(pr)} — 상위 10개 최저가(${won(Math.min(...p10))})보다 낮음` : `가격 ${won(pr)} — 상위 10개 최고가(${won(Math.max(...p10))})보다 높음`);
    targetFacts.push(rv >= avgReview10 * 0.7 ? `리뷰 ${cnt(rv)}개 — 상위 평균 ${cnt(avgReview10)}개와 같은 구간` : rv >= med(r10) * 0.3 ? `리뷰 ${cnt(rv)}개 — 상위 평균 ${cnt(avgReview10)}개보다 적음, 상위 10개 중 같은 수준 상품 있음` : `리뷰 ${cnt(rv)}개 — 상위 평균 ${cnt(avgReview10)}개와 차이`);
    targetFacts.push(target.rank > 100 ? `'${r.keyword}' 100위 밖` : `'${r.keyword}' ${target.rank}위${target.rank > 40 ? ' — 첫 화면(40위) 밖' : target.rank > 10 ? ' — 첫 화면 안 · 10위 밖' : ' — 상위 10위'}`);
  }
  // ── 유입 반영도: 리뷰 순과 순위가 얼마나 다른가 / 상위 10 vs 11~40 클릭·판매지수 차이
  const mid = ps.filter(p => p.rank > 10 && p.rank <= 40);
  const medTop = med(r10);
  const inversions = mid.filter(p => p.reviewCount >= medTop).length;                 // 리뷰는 상위 중간값 이상인데 11~40위
  const lowReviewTop = top.filter(p => p.reviewCount < (mid.length ? med(mid.map(m => m.reviewCount)) : medTop)).length;   // 리뷰 적은데 상위 10
  const avgOf = (arr: Product[], k: keyof Product) => avg(arr.map(p => Number(p[k] ?? 0)).filter(v => v > 0));
  const hitTop = +avgOf(top, 'hitStarScore').toFixed(1), hitMid = +avgOf(mid, 'hitStarScore').toFixed(1), saleTop = +avgOf(top, 'saleStarScore').toFixed(1), saleMid = +avgOf(mid, 'saleStarScore').toFixed(1);
  const gapHit = hitTop - hitMid, gapSale = saleTop - saleMid;
  let score = 0; if (inversions >= 5) score += 2; else if (inversions >= 2) score += 1; if (gapHit >= 0.7) score += 2; else if (gapHit >= 0.3) score += 1; if (lowReviewTop >= 2) score += 1;
  const verdict: '높음' | '보통' | '낮음' = score >= 4 ? '높음' : score >= 2 ? '보통' : '낮음';
  const why: string[] = [];
  if (inversions) why.push(`리뷰가 상위 10개 중간값(${cnt(medTop)}개) 이상인데 11~40위에 있는 상품 ${inversions}개 — 순위가 리뷰 순이 아님`);
  if (lowReviewTop) why.push(`리뷰가 중간값보다 적은데 상위 10위 안인 상품 ${lowReviewTop}개`);
  if (mid.length) why.push(`클릭지수 상위 10개 ${hitTop} vs 11~40위 ${hitMid}${gapHit >= 0.3 ? ' — 클릭·유입이 순위를 가름' : ' — 차이 작음'}`);
  if (mid.length) why.push(`판매지수 상위 10개 ${saleTop} vs 11~40위 ${saleMid}${gapSale >= 0.3 ? '' : ' — 차이 작음'}`);
  // ── 귀사 조건 체크
  const checklist: Doc['checklist'] = [];
  if (target) {
    checklist.push({ label: '가격', ok: target.price > 0 ? target.price <= Math.max(...p10, 0) * 1.1 : null, note: target.price > 0 ? `${won(target.price)} / 상위 10개 ${won(Math.min(...p10))}~${won(Math.max(...p10))}` : '미확인' });
    checklist.push({ label: '리뷰', ok: target.reviews >= medTop * 0.5 ? true : target.reviews >= med(mid.map(m => m.reviewCount)) * 0.5 ? null : false, note: `${cnt(target.reviews)}개 / 상위 10개 중간값 ${cnt(medTop)}개` });
    if (target.quality) checklist.push({ label: '적합도(상품명·카테고리)', ok: target.quality >= ax('qualityStarScore') - 0.5, note: `${target.quality} / 상위 평균 ${ax('qualityStarScore').toFixed(1)}` });
    checklist.push({ label: '클릭·유입(인기도)', ok: target.hit ? target.hit >= hitTop - 0.3 : false, note: target.hit ? `${target.hit} / 상위 평균 ${hitTop}` : '현재 순위에서는 유입 자체가 적음 — 리워드로 채우는 항목' });
  }
  return {
    keyword: r.keyword, date: `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`, brand, target,
    n: ps.length, avgPrice: avg(prices), avgPrice10, avgReview: avg(reviews), avgReview10, newRate, adCount10,
    minPrice10: p10.length ? Math.min(...p10) : 0, maxPrice10: p10.length ? Math.max(...p10) : 0, medianReview10: med(r10),
    related, top, priceBands, axes, strongAxis, competition, barrier, timing, facts, targetFacts,
    entry: { price: p10.length ? `${won(Math.min(...p10))} ~ ${won(avgPrice10)}` : '-', review: cnt(avgReview10) + '개' },
    offer, natural10: top.length - adCount10, traffic: { verdict, why, inversions, lowReviewTop, hitTop, hitMid, saleTop, saleMid, midN: mid.length }, checklist, gapTop10: target ? Math.max(0, target.rank - 10) : null,
    meetsPrice: !!target && target.price > 0 && p10.length > 0 && target.price <= Math.max(...p10) * 1.1,
    meetsReview: !!target && target.reviews >= avgReview10 * 0.7,
  };
}
export const fmtWon = won; export const fmtCnt = cnt;
export const BRAND: Brand = { name: '참한기획', nameEn: 'CHAMHAN', email: 'chamchamcorp@naver.com' };
