// 제안서 v3 — 광고 전체 설계. 코드 계산부 (검색량·상위10·퍼널 판정·리딩 무기·3단계·매출 공식). 글은 워커(ai_tasks)가 씀 → 실패 시 여기 폴백 문장
import type { NscResult, Product } from '@/lib/nsc';
import type { KwVol } from '@/lib/naverAd';

// ── 무기 (고객용 일반 명칭만 · 매체명·슬롯명 없음) ──
export const WEAPONS = {
  search: ['쇼핑 상위노출', '자동완성·연관검색어', '쇼핑검색광고(CPC)', '파워링크(CPC)', '쿠팡 유입 세팅', '상품명·상세페이지 개선'],
  trust: ['맘카페 보장형', '카페 배포', '블로그 체험단·기자단', '지식인'],
  social: ['인스타 체험단·인플루언서', '스레드', '당근', '유튜브'],
  paid: ['메타 광고'],
  content: ['AI 영상·숏폼', '광고 소재 제작', '상세페이지 카피'],
} as const;
export const ALL_WEAPONS = Object.values(WEAPONS).flat() as string[];

export type Leak = 'exposure' | 'trust' | 'awareness' | 'defend' | 'conversion' | 'title';
export const LEAK_LABEL: Record<Leak, string> = { exposure: '노출', trust: '신뢰', awareness: '인지', defend: '방어·확장', conversion: '전환', title: '적합도' };
export const FUNNEL = ['인지', '탐색', '비교', '구매', '재구매'] as const;
const LEAK_STAGE: Record<Leak, number> = { awareness: 0, exposure: 1, title: 1, trust: 2, conversion: 3, defend: 4 };

// 순위별 클릭 점유 (1페이지 40개)
const CTR: Record<number, number> = { 1: .12, 2: .07, 3: .07, 4: .04, 5: .04, 6: .025, 7: .025, 8: .025, 9: .025, 10: .025 };
export const ctr = (r: number) => CTR[r] ?? (r > 0 && r <= 40 ? .006 : 0);
export const TOP10_SHARE = Object.values(CTR).reduce((a, b) => a + b, 0);
export const PAGE1_SHARE = TOP10_SHARE + 30 * .006;
export const CONV = 0.035;

export type Axes = { hit: number; sale: number; quality: number; review: number; fresh: number };
export const AXIS_LABEL: Record<keyof Axes, string> = { hit: '인기도', sale: '판매', quality: '적합도', review: '리뷰', fresh: '최신성' };
export type Top = { rank: number; title: string; mall: string; reviews: number; price: number; click: number; ad: boolean };
export type KwData = {
  keyword: string; date: string;
  volume: { main: number; group: number; related: { keyword: string; total: number }[]; comp: string };
  top10: Top[]; n: number;
  stats: { avgPrice10: number; medianReview10: number; avgReview10: number; avgClick10: number; avgClickMid: number; adCount10: number; newRate: number };
  axes10: Axes;                        // 상위 10 평균 지수 (0~5)
  contentMarket: { blog: number | null; cafe: number | null; youtube: number | null };
  revenue: { aov: number; loss: number; market: number; conv: number };     // 상위10이 가져가는 월 추정 · 1페이지 전체
  kwLeak: Leak;                       // 업체 정보 없을 때 키워드 기본 판정 (검색량 작으면 인지)
};
export type StoreData = {
  store: string; rank: number | null; reviews: number | null; price: number | null; click: number | null; link: string;
  title: string; image: string | null; ad: boolean; axes: Axes | null; weakAxis: keyof Axes | null; strongAxis: keyof Axes | null; keepCnt: number | null; openDays: number | null; band: '상단' | '1페이지 하단' | '2페이지' | '노출권 밖';   // 상위 100 안이면 지수 데이터 보강
  leak: Leak; stage: number; why: string[];                 // 퍼널 판정 + 근거
  lead: string; plan: { phase: 1 | 2 | 3; title: string; when: string; weapons: string[] }[]; skip: { weapon: string; why: string }[];
  target: number;                                            // 목표 순위
  revenue: { gain: number; gainMax: number; keep: number; formula: string; basis: string };   // keep = 방어형에서 지금 지키고 있는 월 매출
  gapReview: number; gapPrice: number;                       // 상위10 중앙값 리뷰 대비 / 평균가 대비 (원)
};

const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const isAd = (p: Product) => /광고|ad/i.test(String(p.상품유형 ?? ''));
const isAdP = isAd;
const days = (d?: string) => d ? (Date.now() - new Date(d).getTime()) / 864e5 : NaN;
const r1 = (v: number) => Math.round(v * 10) / 10;
export const man = (v: number) => `${Math.round(v / 10000).toLocaleString('ko-KR')}만원`;
export const eok = (v: number) => v >= 1e8 ? `${(v / 1e8).toFixed(1)}억원` : man(v);

/** 키워드 단위 계산 */
export function computeKeyword(r: NscResult, vols: KwVol[], content?: { blog?: number | null; cafe?: number | null; youtube?: number | null }): KwData {
  const kw = r.keyword; const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const ps = (r.products ?? []).filter(p => p.rank > 0).sort((a, b) => a.rank - b.rank);
  const top = ps.slice(0, 10); const mid = ps.filter(p => p.rank > 10 && p.rank <= 40);
  const mainV = vols.find(v => norm(v.keyword) === norm(kw)); const main = mainV?.total ?? 0;
  const related = vols.filter(v => norm(v.keyword) !== norm(kw)).sort((a, b) => b.total - a.total).slice(0, 5).map(v => ({ keyword: v.keyword, total: v.total }));
  const group = main + related.reduce((a, v) => a + v.total, 0);
  const p10 = top.map(p => p.lowPrice).filter(p => p > 0); const r10 = top.map(p => p.reviewCount);
  const stats = {
    avgPrice10: Math.round(avg(p10)), medianReview10: med(r10), avgReview10: Math.round(avg(r10)),
    avgClick10: Math.round(avg(top.map(p => p.hitStarScore).filter(v => v > 0)) * 10) / 10,
    avgClickMid: Math.round(avg(mid.map(p => p.hitStarScore).filter(v => v > 0)) * 10) / 10,
    adCount10: top.filter(isAd).length, newRate: ps.length ? Math.round(100 * ps.filter(p => days(p.openDate) <= 90).length / ps.length) : 0,
  };
  const axes10: Axes = { hit: r1(avg(top.map(p => p.hitStarScore).filter(v => v > 0))), sale: r1(avg(top.map(p => p.saleStarScore).filter(v => v > 0))), quality: r1(avg(top.map(p => p.qualityStarScore).filter(v => v > 0))), review: r1(avg(top.map(p => p.reviewCountStarScore).filter(v => v > 0))), fresh: r1(top.length ? 5 * top.filter(p => days(p.openDate) <= 180).length / top.length : 0) };
  const aov = stats.avgPrice10 || Math.round(avg(ps.map(p => p.lowPrice).filter(p => p > 0))) || 30000;
  const rev = (share: number) => group * share * CONV * aov;
  return {
    keyword: kw, date: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.'),
    volume: { main, group, related, comp: mainV?.comp ?? '' },
    top10: top.map(p => ({ rank: p.rank, title: p.productTitle, mall: p.mallName, reviews: p.reviewCount, price: p.lowPrice, click: Math.round(p.hitStarScore * 10) / 10, ad: isAd(p) })), n: ps.length,
    stats, axes10, contentMarket: { blog: content?.blog ?? null, cafe: content?.cafe ?? null, youtube: content?.youtube ?? null },
    revenue: { aov, loss: rev(TOP10_SHARE), market: rev(PAGE1_SHARE), conv: CONV },
    kwLeak: group > 0 && group < 5000 ? 'awareness' : 'exposure',
  };
}

/** 업체 단위 — 퍼널 어디가 새는지 판정 → 리딩 무기 → 3단계. 규칙은 코드가, 글은 워커가 */
/** 지수 데이터(상위 100)에서 이 업체 상품 찾기 — 상품 URL 의 nvmid → 몰명 → 수집 순위 순 */
export function matchProduct(prods: Product[], t: { store: string; productUrl?: string | null; rank: number | null }): Product | null {
  const id = (t.productUrl ?? '').match(/(?:products|catalog)\/(\d{6,})/)?.[1] ?? (t.productUrl ?? '').match(/nvMid=(\d{6,})/)?.[1];
  if (id) { const p = prods.find(x => String(x.nvmid ?? '') === id || x.link.includes(id)); if (p) return p; }
  const norm = (s: string) => s.replace(/[\s\-_()\[\]·.]/g, '').toLowerCase().replace(/(주식회사|주|스토어|몰|샵|공식)/g, '');
  const sn = norm(t.store); if (sn.length >= 2) { const p = prods.find(x => norm(x.mallName) === sn) ?? prods.find(x => norm(x.mallName).includes(sn) || sn.includes(norm(x.mallName))); if (p) return p; }
  if (t.rank) { const p = prods.find(x => x.rank === t.rank); if (p && (sn.length < 2 || norm(p.mallName).includes(sn.slice(0, 2)))) return p; }
  return null;
}

export function computeStore(k: KwData, t: { store: string; rank: number | null; reviews: number | null; price: number | null; click?: number | null; link?: string; product?: Product | null }): StoreData {
  const { medianReview10, avgPrice10, avgClick10 } = k.stats;
  const pr = t.product ?? null;
  const rank = pr?.rank && pr.rank > 0 ? pr.rank : (t.rank && t.rank > 0 ? t.rank : null);
  const reviews = pr ? pr.reviewCount : (t.reviews ?? null); const price = pr ? (pr.lowPrice || null) : (t.price ?? null);
  const click = pr ? r1(pr.hitStarScore) : (t.click ?? null);
  const axes: Axes | null = pr ? { hit: r1(pr.hitStarScore), sale: r1(pr.saleStarScore), quality: r1(pr.qualityStarScore), review: r1(pr.reviewCountStarScore), fresh: days(pr.openDate) <= 180 ? 5 : days(pr.openDate) <= 365 ? 3 : 1 } : null;
  const diffs = axes ? (Object.keys(axes) as (keyof Axes)[]).map(a => ({ a, d: axes[a] - k.axes10[a] })) : [];
  const weakAxis = diffs.length ? diffs.sort((x, y) => x.d - y.d)[0].a : null; const strongAxis = diffs.length ? [...diffs].sort((x, y) => y.d - x.d)[0].a : null;
  const band: StoreData['band'] = rank == null || rank > 100 ? '노출권 밖' : rank <= 10 ? '상단' : rank <= 40 ? '1페이지 하단' : '2페이지';
  const gapReview = reviews != null ? reviews - medianReview10 : 0; const gapPrice = price != null && avgPrice10 ? price - avgPrice10 : 0;
  const why: string[] = [];
  let leak: Leak;
  if (rank != null && rank <= 10) { leak = 'defend'; why.push(`이미 ${rank}위 — 1페이지 상단 자리 보유${axes && weakAxis ? ` · 상위 10 대비 약한 축은 ${AXIS_LABEL[weakAxis]}(${axes[weakAxis]} vs ${k.axes10[weakAxis]})` : ''}`); }
  else if (axes && k.axes10.quality > 0 && axes.quality <= k.axes10.quality - 1.0) { leak = 'title'; why.push(`적합도 ${axes.quality} — 상위 10 평균 ${k.axes10.quality}보다 ${r1(k.axes10.quality - axes.quality)} 낮음 · 상품명·상세가 「${k.keyword}」와 덜 맞는 상태`); }
  else if (k.volume.group > 0 && k.volume.group < 5000) { leak = 'awareness'; why.push(`「${k.keyword}」 키워드군 월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 — 검색 수요 자체가 작은 시장`); }
  else if (reviews != null && medianReview10 > 0 && reviews < medianReview10 * 0.3) { leak = 'trust'; why.push(`리뷰 ${reviews.toLocaleString('ko-KR')}개 — 상위 10개 중앙값 ${medianReview10.toLocaleString('ko-KR')}개의 ${Math.round(100 * reviews / medianReview10)}%`); }
  else if (price != null && avgPrice10 && price > avgPrice10 * 1.2) { leak = 'conversion'; why.push(`판매가 ${price.toLocaleString('ko-KR')}원 — 상위 10개 평균 ${avgPrice10.toLocaleString('ko-KR')}원보다 ${Math.round(100 * (price / avgPrice10 - 1))}% 높은 포지션`); }
  else { leak = 'exposure'; why.push(rank ? `${rank}위 — ${band}, 클릭 점유 ${rank > 40 ? '0' : '0.6'}%대${axes && axes.sale >= k.axes10.sale ? ` · 판매지수는 상위 10 수준(${axes.sale})인데 클릭지수 ${axes.hit}` : ''}` : '1페이지 미진입 — 노출권 밖'); }
  if (pr && isAdP(pr)) why.push('현재 광고 자리로 노출 중 — 자연 순위는 별도');
  if (axes && strongAxis && leak !== 'defend' && axes[strongAxis] >= k.axes10[strongAxis]) why.push(`${AXIS_LABEL[strongAxis]} ${axes[strongAxis]} — 상위 10 평균(${k.axes10[strongAxis]}) 이상, 이미 갖춘 축`);
  if (leak !== 'trust' && reviews != null && medianReview10 > 0 && reviews >= medianReview10) why.push(`리뷰 ${reviews.toLocaleString('ko-KR')}개 — 상위 10개 중앙값 이상, 신뢰 자산 충분`);
  if (leak !== 'conversion' && price != null && avgPrice10 && price <= avgPrice10) why.push(`판매가 ${price.toLocaleString('ko-KR')}원 — 상위 10개 평균보다 ${(avgPrice10 - price).toLocaleString('ko-KR')}원 낮은 위치`);
  if (click != null && avgClick10 && leak === 'exposure') why.push(`클릭지수 ${click} vs 상위 10 평균 ${avgClick10}`);

  const target = leak === 'defend' ? Math.max(1, (rank ?? 5) - 2) : rank != null && rank <= 20 ? 3 : rank != null && rank <= 40 ? 5 : 10;   // 구간별 1차 목표 (21~40 → 5위, 밖 → 10위 진입 먼저)
  const P = (phase: 1 | 2 | 3, title: string, when: string, weapons: string[]) => ({ phase, title, when, weapons });
  let lead: string, plan: StoreData['plan'], skip: StoreData['skip'];
  switch (leak) {
    case 'exposure':
      lead = '쇼핑 상위노출';
      plan = [P(1, '노출', '1~10일', ['쇼핑 상위노출', '자동완성·연관검색어', '쇼핑검색광고(CPC)']), P(2, '검색 밖 수요', '2개월차', ['맘카페 보장형', '카페 배포', '블로그 체험단·기자단', '쿠팡 유입 세팅']), P(3, '자산화', '3개월차~', ['스레드', '당근', '인스타 체험단·인플루언서', 'AI 영상·숏폼'])];
      skip = [{ weapon: '메타 광고', why: '검색 수요가 이미 큰 키워드 — 검색 안에서 받는 게 먼저' }, { weapon: '파워링크(CPC)', why: '쇼핑 탭 상품이라 쇼핑검색광고가 우선' }];
      break;
    case 'trust':
      lead = '맘카페 보장형';
      plan = [P(1, '신뢰 쌓기', '1~3주', ['맘카페 보장형', '카페 배포', '블로그 체험단·기자단', '상세페이지 카피']), P(2, '노출', '리뷰·후기 자리 잡은 뒤', ['쇼핑 상위노출', '자동완성·연관검색어', '쇼핑검색광고(CPC)']), P(3, '자산화', '3개월차~', ['인스타 체험단·인플루언서', '스레드', 'AI 영상·숏폼'])];
      skip = [{ weapon: '쇼핑 상위노출 (지금)', why: '후기 없는 상태로 올리면 클릭은 늘고 전환이 안 따라옴 — 2단계로' }, { weapon: '메타 광고', why: '검색 수요가 있는 키워드 — 후기 자산 먼저' }];
      break;
    case 'awareness':
      lead = '메타 광고';
      plan = [P(1, '수요 만들기', '1개월차', ['메타 광고', '인스타 체험단·인플루언서', 'AI 영상·숏폼', '광고 소재 제작']), P(2, '검색 받기', '검색량 움직이면', ['자동완성·연관검색어', '쇼핑 상위노출', '맘카페 보장형']), P(3, '자산화', '3개월차~', ['스레드', '유튜브', '카페 배포'])];
      skip = [{ weapon: '쇼핑검색광고(CPC)', why: '검색 자체가 적어 광고비 대비 효율이 안 나옴' }, { weapon: '쿠팡 유입 세팅', why: '네이버 수요부터' }];
      break;
    case 'title':
      lead = '상품명·상세페이지 개선';
      plan = [P(1, '적합도 맞추기', '1주', ['상품명·상세페이지 개선', '상세페이지 카피']), P(2, '노출', '상품명 반영 뒤', ['쇼핑 상위노출', '자동완성·연관검색어', '쇼핑검색광고(CPC)']), P(3, '신뢰·자산', '2개월차~', ['맘카페 보장형', '블로그 체험단·기자단', '인스타 체험단·인플루언서'])];
      skip = [{ weapon: '쇼핑 상위노출 (지금)', why: '키워드와 상품명이 덜 맞는 상태에서 유입만 늘리면 순위 반영이 더딤 — 적합도부터' }, { weapon: '메타 광고', why: '검색 안에서 잡을 수 있는 수요가 먼저' }];
      break;
    case 'defend':
      lead = '자동완성·연관검색어';
      plan = [P(1, '지키기·넓히기', '1~10일', ['쇼핑 상위노출', '자동완성·연관검색어', '쇼핑검색광고(CPC)']), P(2, '브랜드 검색 자산', '2개월차', ['맘카페 보장형', '블로그 체험단·기자단', '인스타 체험단·인플루언서']), P(3, '재구매·확장', '3개월차~', ['스레드', '당근', '쿠팡 유입 세팅', 'AI 영상·숏폼'])];
      skip = [{ weapon: '메타 광고', why: '이미 검색 상단 — 브랜드 검색을 키우는 쪽이 먼저' }, { weapon: '지식인', why: '상위권 상품엔 효과 대비 비용이 큼' }];
      break;
    default: // conversion
      lead = '상세페이지 카피';
      plan = [P(1, '전환 고치기', '1~2주', ['상세페이지 카피', '광고 소재 제작', '블로그 체험단·기자단']), P(2, '노출', '전환 올라온 뒤', ['쇼핑 상위노출', '자동완성·연관검색어', '맘카페 보장형']), P(3, '프리미엄 포지션 자산', '3개월차~', ['인스타 체험단·인플루언서', '유튜브', 'AI 영상·숏폼'])];
      skip = [{ weapon: '쇼핑검색광고(CPC)', why: '가격 비교에서 지는 자리에 광고비를 먼저 쓰면 새어 나감' }, { weapon: '당근', why: '가격 민감 채널 — 프리미엄 상품과 안 맞음' }];
  }

  // 매출 공식 — 리딩별
  const base = k.volume.group * CONV * k.revenue.aov;
  const cur = rank ? ctr(rank) : 0;
  let revenue: StoreData['revenue']; const basis = `월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 · 전환 ${(CONV * 100).toFixed(1)}% · 객단가 ${k.revenue.aov.toLocaleString('ko-KR')}원(상위 10 평균) · 추정`;
  if (leak === 'awareness') {
    const reach = 150000, ctrAd = 0.012; const gain = reach * ctrAd * CONV * 0.6 * k.revenue.aov;   // 월 도달 15만 가정 · 광고 전환 0.6배
    revenue = { gain, gainMax: gain * 2, keep: 0, formula: '광고 도달 × 클릭률 × 전환율 × 객단가', basis: '월 도달 15만 · 클릭률 1.2% · 검색 대비 전환 0.6배 가정 · 추정' };
  } else if (leak === 'defend') {
    const keep = base * cur; const relVol = k.volume.related.reduce((a, v) => a + v.total, 0); const expand = relVol * ctr(3) * CONV * k.revenue.aov * 0.6;   // 연관 키워드 3위권 60% 가정
    revenue = { gain: expand, gainMax: relVol * ctr(1) * CONV * k.revenue.aov, keep, formula: '지키는 매출 = 검색량 × 현재 순위 클릭 점유 × 전환율 × 객단가 · 확장 = 연관 키워드 검색량 × 3위 클릭 점유 × 60%', basis: `${basis} · 연관 ${k.volume.related.length}개 월 ${relVol.toLocaleString('ko-KR')}회` };
  } else if (leak === 'trust' || leak === 'conversion' || leak === 'title') {
    const gain = base * (ctr(target) - cur) * 0.7;
    revenue = { gain, gainMax: base * (ctr(1) - cur), keep: 0, formula: '검색량 × 순위별 클릭 점유 × 전환율 × 객단가 (선행 단계 반영 전 70%)', basis };
  } else {
    revenue = { gain: base * (ctr(target) - cur), gainMax: base * (ctr(1) - cur), keep: 0, formula: '검색량 × 순위별 클릭 점유 × 전환율 × 객단가', basis };
  }
  return { store: t.store, rank, reviews, price, click, link: t.link ?? (pr?.link ?? ''), title: pr?.productTitle ?? '', image: pr?.imageUrl ?? null, ad: pr ? isAdP(pr) : false, axes, weakAxis, strongAxis, keepCnt: pr?.keepCnt ?? null, openDays: pr?.openDate ? Math.round(days(pr.openDate)) : null, band, leak, stage: LEAK_STAGE[leak], why, lead, plan, skip, target, revenue, gapReview, gapPrice };
}

// ── 워커 결과 타입 + 폴백 ──
export type KwAi = {
  buyer: { who: string; truth: string; moment: string };
  reframe: { weak: string; flip: string };
  narrative: { diagnosis: string; insight: string; strategy: string };
  stages: string[];                                  // 3단계 설명 (명사 종결)
  contents: { fmt: string; idea: string }[];         // 5개
  skipWhy?: string[];
};
export type StoreAi = { headline: string; thesis: string; have: string[]; leak: string[] };

export function fallbackKwAi(k: KwData, s?: StoreData): KwAi {
  const kw = k.keyword;
  return {
    buyer: { who: `「${kw}」를 검색하는 실구매 의향 고객`, truth: '실패하지 않을 상품을 1페이지 안에서 고르려는 마음', moment: '상위 노출 상품의 후기에서 자기 상황을 본 순간' },
    reframe: s?.leak === 'defend' ? { weak: '상위권일수록 같은 자리를 노리는 경쟁사가 느는 시장', flip: '이미 가진 순위를 연관 키워드와 브랜드 검색으로 넓히면 방어 비용이 낮아지는 구조' }
      : s?.leak === 'trust' ? { weak: '후기 없는 상품은 1페이지에 올라도 비교에서 밀리는 시장', flip: '후기 한 줄이 쌓이면 같은 노출에서 전환이 올라가는 구조' }
      : s?.leak === 'awareness' ? { weak: '검색량이 작아 검색만 기다리면 매출이 안 나오는 시장', flip: '검색 밖에서 수요를 만들면 검색 경쟁 없이 먼저 자리 잡는 구조' }
      : s?.leak === 'conversion' ? { weak: '가격 비교에서 비싼 쪽이 먼저 탈락하는 시장', flip: '값의 이유가 보이면 비싼 쪽이 오히려 기억에 남는 구조' }
      : s?.leak === 'title' ? { weak: '상품명이 키워드와 어긋나면 유입을 넣어도 순위 반영이 더딘 시장', flip: '상품명 한 줄만 맞춰도 같은 유입이 두 배로 일하는 구조' }
      : { weak: '상품이 좋아도 1페이지 밖이면 비교 대상에 못 드는 시장', flip: '막는 순서만 맞추면 가진 자산이 그대로 매출로 바뀌는 구조' },
    narrative: { diagnosis: '수요는 있는데 받지 못하는 상태', insight: '구매자는 1페이지 안에서만 비교', strategy: '새는 구간부터 막는 3단계' },
    stages: (s?.plan ?? []).map(p => `${p.title} — ${p.weapons.join(' · ')}`),
    contents: [{ fmt: '카페 체험기', idea: '실사용 상황 기반 후기' }, { fmt: '블로그 비교글', idea: '같은 가격대 상품 비교' }, { fmt: '숏폼', idea: '구매 전 고민 한 가지에 답하는 15초' }, { fmt: '당근 동네생활', idea: '지역 실구매 후기' }, { fmt: '상세페이지 카피', idea: '첫 화면 한 줄 — 가장 강한 증거' }],
  };
}
export function fallbackStoreAi(k: KwData, s: StoreData): StoreAi {
  const r = s.rank ? `${s.rank}위` : '1페이지 밖'; const kw = k.keyword;
  const H: Record<Leak, string> = {
    defend: `「${kw}」 ${r}를 지키는 ${s.store}, 비어 있는 건 연관 키워드 ${k.volume.related.length}개의 자리`,
    exposure: s.reviews && s.reviews >= k.stats.medianReview10 ? `리뷰 ${s.reviews.toLocaleString('ko-KR')}개를 쌓고도 「${kw}」 ${r}에 묻힌 ${s.store}` : `「${kw}」 ${r}, 노출 한 칸이 비어 있는 ${s.store}`,
    trust: `「${kw}」 ${r}의 ${s.store}, 순위보다 먼저 채울 건 후기 한 줄`,
    awareness: `월 ${k.volume.group.toLocaleString('ko-KR')}회의 작은 검색 시장, ${s.store}가 수요를 직접 만들 차례`,
    conversion: `「${kw}」 상위 10개보다 ${s.gapPrice > 0 ? s.gapPrice.toLocaleString('ko-KR') + '원 높은' : '높은'} 가격, ${s.store}에 필요한 건 그 값의 이유`,
    title: `「${kw}」와 ${s.store} 상품명 사이의 간격, 적합도 ${s.axes?.quality ?? ''}`,
  };
  const T: Record<Leak, string> = { defend: '지금 자리를 지키며 연관 키워드와 브랜드 검색을 자산으로', exposure: '상품은 준비된 상태, 부족한 건 노출 한 칸', trust: '후기를 먼저 채우고 그 다음 노출', awareness: '검색을 기다리지 않고 수요를 만드는 설계', conversion: '가격의 이유를 보여주는 상세와 신뢰 콘텐츠', title: '상품명부터 키워드에 맞추는 순서' };
  return {
    headline: H[s.leak],
    thesis: T[s.leak],
    have: (() => { const h = s.why.filter(w => /이상|낮은|보유|충분/.test(w)).slice(0, 3); return h.length ? h : [`월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 시장 안에 있는 상품`]; })(),
    leak: s.leak === 'defend'
      ? [`연관 키워드 ${k.volume.related.length}개(월 ${k.volume.related.reduce((a, v) => a + v.total, 0).toLocaleString('ko-KR')}회)에는 아직 자리 없음`, s.weakAxis && s.axes ? `${AXIS_LABEL[s.weakAxis]} ${s.axes[s.weakAxis]} — 상위 10 평균 ${k.axes10[s.weakAxis]}보다 낮은 유일한 축` : '상위권 경쟁사와 같은 축에서 경쟁 중', '브랜드명 검색·재구매 자산은 아직 쌓이기 전'].filter(Boolean) as string[]
      : s.why.filter(w => !/이상|낮은|보유|충분|갖춘/.test(w)).slice(0, 3),
  };
}

/** 워커 결과 텍스트에서 JSON 관대 파싱 (goat-app parseLoose 이식) */
export function parseLoose(text: string | null | undefined): any | null {
  if (!text) return null;
  let s = String(text).trim().replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('{'); if (a < 0) return null; const b = s.lastIndexOf('}');
  if (b > a) { const body = s.slice(a, b + 1); try { return JSON.parse(body); } catch {} const r = body.replace(/,\s*([}\]])/g, '$1').replace(/}\s*{/g, '},{').replace(/[\u0000-\u001F]+/g, ' '); try { return JSON.parse(r); } catch {} }
  try {
    let t = s.slice(a).replace(/[\u0000-\u001F]+/g, ' '); let inStr = false, esc = false, open = 0, sq = 0;
    for (const c of t) { if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; } if (c === '"') { inStr = !inStr; continue; } if (inStr) continue; if (c === '{') open++; else if (c === '}') open--; else if (c === '[') sq++; else if (c === ']') sq--; }
    if (inStr) t += '"'; t = t.replace(/,\s*$/, '').replace(/:\s*$/, ':""'); while (sq-- > 0) t += ']'; while (open-- > 0) t += '}';
    return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
  } catch { return null; }
}
/** 명사 종결 검사 — 동사·형용사 종결 어미로 끝나면 false */
export const nounEnd = (s: string) => !/(다|요|니다|죠|함|됨|이다|습니다|입니다)[.!]?\s*$/.test((s || '').trim());
