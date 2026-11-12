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

export type Leak = 'exposure' | 'trust' | 'awareness' | 'defend' | 'conversion';
export const LEAK_LABEL: Record<Leak, string> = { exposure: '노출', trust: '신뢰', awareness: '인지', defend: '방어·확장', conversion: '전환' };
export const FUNNEL = ['인지', '탐색', '비교', '구매', '재구매'] as const;
const LEAK_STAGE: Record<Leak, number> = { awareness: 0, exposure: 1, trust: 2, conversion: 3, defend: 4 };

// 순위별 클릭 점유 (1페이지 40개)
const CTR: Record<number, number> = { 1: .12, 2: .07, 3: .07, 4: .04, 5: .04, 6: .025, 7: .025, 8: .025, 9: .025, 10: .025 };
export const ctr = (r: number) => CTR[r] ?? (r > 0 && r <= 40 ? .006 : 0);
export const TOP10_SHARE = Object.values(CTR).reduce((a, b) => a + b, 0);
export const PAGE1_SHARE = TOP10_SHARE + 30 * .006;
export const CONV = 0.035;

export type Top = { rank: number; title: string; mall: string; reviews: number; price: number; click: number; ad: boolean };
export type KwData = {
  keyword: string; date: string;
  volume: { main: number; group: number; related: { keyword: string; total: number }[]; comp: string };
  top10: Top[]; n: number;
  stats: { avgPrice10: number; medianReview10: number; avgReview10: number; avgClick10: number; avgClickMid: number; adCount10: number; newRate: number };
  contentMarket: { blog: number | null; cafe: number | null; youtube: number | null };
  revenue: { aov: number; loss: number; market: number; conv: number };     // 상위10이 가져가는 월 추정 · 1페이지 전체
  kwLeak: Leak;                       // 업체 정보 없을 때 키워드 기본 판정 (검색량 작으면 인지)
};
export type StoreData = {
  store: string; rank: number | null; reviews: number | null; price: number | null; click: number | null; link: string;
  leak: Leak; stage: number; why: string[];                 // 퍼널 판정 + 근거
  lead: string; plan: { phase: 1 | 2 | 3; title: string; when: string; weapons: string[] }[]; skip: { weapon: string; why: string }[];
  target: number;                                            // 목표 순위
  revenue: { gain: number; gainMax: number; formula: string; basis: string };
  gapReview: number; gapPrice: number;                       // 상위10 중앙값 리뷰 대비 / 평균가 대비 (원)
};

const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const isAd = (p: Product) => /광고|ad/i.test(String(p.상품유형 ?? ''));
const days = (d?: string) => d ? (Date.now() - new Date(d).getTime()) / 864e5 : NaN;
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
  const aov = stats.avgPrice10 || Math.round(avg(ps.map(p => p.lowPrice).filter(p => p > 0))) || 30000;
  const rev = (share: number) => group * share * CONV * aov;
  return {
    keyword: kw, date: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.'),
    volume: { main, group, related, comp: mainV?.comp ?? '' },
    top10: top.map(p => ({ rank: p.rank, title: p.productTitle, mall: p.mallName, reviews: p.reviewCount, price: p.lowPrice, click: Math.round(p.hitStarScore * 10) / 10, ad: isAd(p) })), n: ps.length,
    stats, contentMarket: { blog: content?.blog ?? null, cafe: content?.cafe ?? null, youtube: content?.youtube ?? null },
    revenue: { aov, loss: rev(TOP10_SHARE), market: rev(PAGE1_SHARE), conv: CONV },
    kwLeak: group > 0 && group < 5000 ? 'awareness' : 'exposure',
  };
}

/** 업체 단위 — 퍼널 어디가 새는지 판정 → 리딩 무기 → 3단계. 규칙은 코드가, 글은 워커가 */
export function computeStore(k: KwData, t: { store: string; rank: number | null; reviews: number | null; price: number | null; click?: number | null; link?: string }): StoreData {
  const { medianReview10, avgPrice10, avgClick10 } = k.stats;
  const rank = t.rank && t.rank > 0 ? t.rank : null; const reviews = t.reviews ?? null; const price = t.price ?? null;
  const gapReview = reviews != null ? reviews - medianReview10 : 0; const gapPrice = price != null && avgPrice10 ? price - avgPrice10 : 0;
  const why: string[] = [];
  let leak: Leak;
  if (rank != null && rank <= 10) { leak = 'defend'; why.push(`이미 ${rank}위 — 1페이지 상단 자리 보유`); }
  else if (k.volume.group > 0 && k.volume.group < 5000) { leak = 'awareness'; why.push(`「${k.keyword}」 키워드군 월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 — 검색 수요 자체가 작은 시장`); }
  else if (reviews != null && medianReview10 > 0 && reviews < medianReview10 * 0.3) { leak = 'trust'; why.push(`리뷰 ${reviews.toLocaleString('ko-KR')}개 — 상위 10개 중앙값 ${medianReview10.toLocaleString('ko-KR')}개의 ${Math.round(100 * reviews / medianReview10)}%`); }
  else if (price != null && avgPrice10 && price > avgPrice10 * 1.2) { leak = 'conversion'; why.push(`판매가 ${price.toLocaleString('ko-KR')}원 — 상위 10개 평균 ${avgPrice10.toLocaleString('ko-KR')}원보다 ${Math.round(100 * (price / avgPrice10 - 1))}% 높은 포지션`); }
  else { leak = 'exposure'; why.push(rank ? `${rank}위 — ${rank > 40 ? '1페이지 밖' : '1페이지 하단'}, 클릭 점유 ${rank > 40 ? '0' : '0.6'}%대` : '1페이지 미진입 — 노출권 밖'); }
  if (leak !== 'trust' && reviews != null && medianReview10 > 0 && reviews >= medianReview10) why.push(`리뷰 ${reviews.toLocaleString('ko-KR')}개 — 상위 10개 중앙값 이상, 신뢰 자산 충분`);
  if (leak !== 'conversion' && price != null && avgPrice10 && price <= avgPrice10) why.push(`판매가 ${price.toLocaleString('ko-KR')}원 — 상위 10개 평균보다 ${(avgPrice10 - price).toLocaleString('ko-KR')}원 낮은 위치`);
  if (t.click != null && avgClick10) why.push(`클릭지수 ${t.click} vs 상위 10 평균 ${avgClick10}`);

  const target = leak === 'defend' ? Math.max(1, (rank ?? 5) - 2) : 3;
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
  let revenue: StoreData['revenue'];
  if (leak === 'awareness') {
    const reach = 150000, ctrAd = 0.012; const gain = reach * ctrAd * CONV * 0.6 * k.revenue.aov;   // 월 도달 15만 가정 · 광고 전환 0.6배
    revenue = { gain, gainMax: gain * 2, formula: '광고 도달 × 클릭률 × 전환율 × 객단가', basis: '월 도달 15만 · 클릭률 1.2% · 검색 대비 전환 0.6배 가정 · 추정' };
  } else if (leak === 'trust' || leak === 'conversion') {
    const gain = base * (ctr(target) - cur) * 0.7;
    revenue = { gain, gainMax: base * (ctr(1) - cur), formula: '검색량 × 순위별 클릭 점유 × 전환율 × 객단가 (전환 개선 전 70%)', basis: `월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 · 전환 ${(CONV * 100).toFixed(1)}% · 객단가 ${k.revenue.aov.toLocaleString('ko-KR')}원 · 추정` };
  } else {
    revenue = { gain: base * (ctr(target) - cur), gainMax: base * (ctr(1) - cur), formula: '검색량 × 순위별 클릭 점유 × 전환율 × 객단가', basis: `월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 · 전환 ${(CONV * 100).toFixed(1)}% · 객단가 ${k.revenue.aov.toLocaleString('ko-KR')}원(상위 10 평균) · 추정` };
  }
  return { store: t.store, rank, reviews, price, click: t.click ?? null, link: t.link ?? '', leak, stage: LEAK_STAGE[leak], why, lead, plan, skip, target, revenue, gapReview, gapPrice };
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
    reframe: { weak: s ? `${LEAK_LABEL[s.leak]} 구간에서 새는 구조` : '노출 구간에서 새는 구조', flip: '막는 순서만 맞추면 가진 자산이 그대로 매출로 바뀌는 구조' },
    narrative: { diagnosis: '수요는 있는데 받지 못하는 상태', insight: '구매자는 1페이지 안에서만 비교', strategy: '새는 구간부터 막는 3단계' },
    stages: (s?.plan ?? []).map(p => `${p.title} — ${p.weapons.join(' · ')}`),
    contents: [{ fmt: '카페 체험기', idea: '실사용 상황 기반 후기' }, { fmt: '블로그 비교글', idea: '같은 가격대 상품 비교' }, { fmt: '숏폼', idea: '구매 전 고민 한 가지에 답하는 15초' }, { fmt: '당근 동네생활', idea: '지역 실구매 후기' }, { fmt: '상세페이지 카피', idea: '첫 화면 한 줄 — 가장 강한 증거' }],
  };
}
export function fallbackStoreAi(k: KwData, s: StoreData): StoreAi {
  const r = s.rank ? `${s.rank}위` : '1페이지 밖';
  return {
    headline: `「${k.keyword}」 ${r}, ${LEAK_LABEL[s.leak]} 구간에서 새는 ${s.store}`,
    thesis: s.leak === 'defend' ? '지금 자리를 지키며 브랜드 검색을 자산으로' : `${LEAK_LABEL[s.leak]}부터 막는 순서`,
    have: (() => { const h = s.why.filter(w => /이상|낮은|보유|충분/.test(w)).slice(0, 3); return h.length ? h : [`월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 시장 안에 있는 상품`]; })(),
    leak: s.why.filter(w => !/이상|낮은|보유|충분/.test(w)).slice(0, 3),
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
