// 키워드 제안서 — 시크릿 지수(nsc) 조회 결과만으로 문장·수치를 전부 계산 (LLM 호출 없음)
import type { NscResult, Product } from '@/lib/nsc';

export type Target = { rank: number; mallName: string; title: string; price: number; reviews: number; image?: string | null; link?: string };
export type Brand = { name: string; nameEn: string; email: string; owner?: string; phone?: string };
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
};
const won = (n: number) => Math.round(n).toLocaleString('ko-KR') + '원';
const cnt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const isAd = (p: Product) => /광고|ad/i.test(String(p.상품유형 ?? ''));
const days = (d?: string) => d ? (Date.now() - new Date(d).getTime()) / 864e5 : NaN;

export function buildDoc(r: NscResult, brand: Brand, target: Target | null, date = new Date()): Doc {
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
  const competition = { level: !isNaN(diffScore) ? (diffScore >= 70 ? '높음' : diffScore >= 40 ? '보통' : '낮음') : (avgReview10 >= 3000 ? '높음' : avgReview10 >= 500 ? '보통' : '낮음'), why: `상위 100개 분석 기준. 상위 10개 평균 리뷰 ${cnt(avgReview10)}개${adCount10 ? `, 광고 상품 ${adCount10}개` : ''}.` };
  const barrier = { level: avgReview10 >= 2000 ? '높음' : avgReview10 >= 300 ? '보통' : '낮음', why: `평균 리뷰 ${cnt(avgReview10)}개. 리뷰 격차가 ${avgReview10 >= 2000 ? '커 초기 노출·리뷰 확보가 필수' : '크지 않아 노출만 확보되면 진입 가능'}.` };
  const timing = { level: newRate >= 20 ? '활발' : newRate >= 8 ? '보통' : '안정', why: `신상품 비율 ${newRate}%. ${newRate >= 20 ? '신규 상품이 계속 진입하는 시장으로 노출 속도가 중요' : '기존 상품이 자리 잡은 시장으로, 차별화와 노출 확보가 필요'}.` };
  const related = (r.trend ?? []).filter(t => typeof t === 'string' && t.trim() && t.trim() !== r.keyword).slice(0, 8);
  const facts = [
    `상위 상품 평균가 ${won(avgPrice10)}, 평균 리뷰 ${cnt(avgReview10)}개. ${avgReview10 >= 1000 ? '신규 진입이라면 가격 경쟁보다 노출·리뷰를 빠르게 쌓아 상위 조건을 맞추는 것이 우선입니다.' : '리뷰 장벽이 높지 않아 노출 위치만 확보되면 판매로 이어지기 쉬운 시장입니다.'}`,
    `상위 10개 중 광고 상품은 ${adCount10}개 — ${10 - adCount10}개는 자연 검색 순위로 1페이지에 있습니다.`,
    `상위 상품은 특히 ${strongAxis} 지표가 두드러집니다. 이 시장에 진입하려면 ${strongAxis}부터 끌어올려 상위 노출 조건을 맞춰야 합니다.`,
  ];
  const targetFacts: string[] = [];
  if (target) {
    const pr = target.price, rv = target.reviews;
    if (pr > 0 && p10.length) targetFacts.push(pr >= Math.min(...p10) * 0.9 && pr <= Math.max(...p10) * 1.1 ? `가격 ${won(pr)}은 상위 10개 가격대(${won(Math.min(...p10))}~${won(Math.max(...p10))}) 안에 있습니다.` : pr < Math.min(...p10) ? `가격 ${won(pr)}은 상위 10개 최저가(${won(Math.min(...p10))})보다 낮아 가격 경쟁력은 충분합니다.` : `가격 ${won(pr)}은 상위 10개 최고가(${won(Math.max(...p10))})보다 높습니다. 노출 후 전환을 위해 가격·혜택 점검이 필요합니다.`);
    targetFacts.push(rv >= avgReview10 * 0.7 ? `리뷰 ${cnt(rv)}개로 상위 평균(${cnt(avgReview10)}개)과 같은 구간입니다. 차이는 검색 결과에서 보이는 위치입니다.` : rv >= med(r10) * 0.3 ? `리뷰 ${cnt(rv)}개. 상위 평균(${cnt(avgReview10)}개)보다 적지만 상위 10개 중에도 이 수준의 상품이 있습니다.` : `리뷰 ${cnt(rv)}개로 상위 평균(${cnt(avgReview10)}개)과 차이가 있습니다. 노출을 먼저 만들고 리뷰를 쌓는 순서가 필요합니다.`);
    targetFacts.push(`현재 '${r.keyword}' 검색 결과 ${target.rank}위${target.rank > 40 ? ` — 상위 40위(1페이지) 밖` : target.rank > 10 ? ' — 1페이지 안이지만 상위 10위 밖' : ' — 상위 10위 안'}.`);
  }
  return {
    keyword: r.keyword, date: `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`, brand, target,
    n: ps.length, avgPrice: avg(prices), avgPrice10, avgReview: avg(reviews), avgReview10, newRate, adCount10,
    minPrice10: p10.length ? Math.min(...p10) : 0, maxPrice10: p10.length ? Math.max(...p10) : 0, medianReview10: med(r10),
    related, top, priceBands, axes, strongAxis, competition, barrier, timing, facts, targetFacts,
    entry: { price: p10.length ? `${won(Math.min(...p10))} ~ ${won(avgPrice10)}` : '-', review: cnt(avgReview10) + '개' },
  };
}
export const fmtWon = won; export const fmtCnt = cnt;
export const BRAND: Brand = { name: '참한기획', nameEn: 'CHAMHAN', email: 'chamchamcorp@naver.com' };
