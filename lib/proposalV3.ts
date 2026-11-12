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
export const AXIS_LABEL: Record<keyof Axes, string> = { hit: '클릭지수', sale: '판매지수', quality: '적합도', review: '리뷰지수', fresh: '최신성' };
export type Top = { rank: number; title: string; mall: string; reviews: number; price: number; click: number; ad: boolean };
export type KwData = {
  dv?: number;
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
  dv?: number;
  store: string; rank: number | null; reviews: number | null; price: number | null; click: number | null; link: string;
  title: string; image: string | null; ad: boolean; axes: Axes | null; weakAxis: keyof Axes | null; strongAxis: keyof Axes | null; keepCnt: number | null; openDays: number | null; band: '상단' | '1페이지 하단' | '2페이지 이후' | '노출권 밖';   // 상위 100 안이면 지수 데이터 보강
  leak: Leak; stage: number; why: string[];                 // 퍼널 판정 + 근거 (why = 막힌 이유 순)
  good: string[]; bad: string[];                             // 이미 가진 것 / 비어 있는 것 (각 최대 3)
  funnel: number[];                                          // 다섯 단계 상태 — 2 준비됨 · 1 약함 · 0 아직/확인 전 (stage 가 먼저 풀 곳)
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
/** 받침에 맞는 조사 (조사만 반환) — josa('단감', '은/는') → '은' · josa('토퍼', '을/를') → '를' */
export function josa(word: string, pair: '은/는' | '이/가' | '을/를' | '과/와' | '으로/로' | '이라/라'): string {
  const [a, b] = pair.split('/'); const w = (word || '').replace(/[\s」』"')\]]+$/g, ''); const ch = w.charCodeAt(w.length - 1);
  let fin = false, rieul = false;
  if (ch >= 0xAC00 && ch <= 0xD7A3) { const j = (ch - 0xAC00) % 28; fin = j !== 0; rieul = j === 8; }
  else if (/\d$/.test(w)) { const d = w[w.length - 1]; fin = '013678'.includes(d); rieul = '178'.includes(d); }
  else if (/[a-z]$/i.test(w)) { const c = w[w.length - 1].toLowerCase(); fin = 'lmnbcdgkpt'.includes(c); rieul = c === 'l'; }
  return pair === '으로/로' ? (fin && !rieul ? a : b) : fin ? a : b;
}
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
    dv: PV3_DATA_VER, keyword: kw, date: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.'),
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
  const diffs = axes ? (['hit', 'sale', 'quality', 'review'] as (keyof Axes)[]).map(a => ({ a, d: axes[a] - k.axes10[a] })) : [];   // 최신성은 비교에서 제외 (셀러가 바꿀 수 없는 값)
  const weakAxis = diffs.length ? diffs.sort((x, y) => x.d - y.d)[0].a : null; const strongAxis = diffs.length ? [...diffs].sort((x, y) => y.d - x.d)[0].a : null;
  const band: StoreData['band'] = rank == null || rank > 100 ? '노출권 밖' : rank <= 10 ? '상단' : rank <= 40 ? '1페이지 하단' : '2페이지 이후';
  const gapReview = reviews != null ? reviews - medianReview10 : 0; const gapPrice = price != null && avgPrice10 ? price - avgPrice10 : 0;
  const kw = k.keyword; const won = (n: number) => Math.round(n).toLocaleString('ko-KR'); const g = k.volume.group;
  // ── 판정: 어디가 막혔나 (위에서부터 먼저 해당되는 것) ──
  let leak: Leak;
  if (rank != null && rank <= 10) leak = 'defend';
  else if (axes && k.axes10.quality > 0 && axes.quality <= k.axes10.quality - 1.0) leak = 'title';
  else if (g > 0 && g < 5000) leak = 'awareness';
  else if (reviews != null && reviews < 100 && medianReview10 > 0 && reviews < medianReview10 * 0.3) leak = 'trust';
  else if (price != null && avgPrice10 && price > avgPrice10 * 1.4) leak = 'conversion';
  else leak = 'exposure';
  // ── 사실: 가진 것 / 비어 있는 것 (key 는 정렬용) ──
  const good: [string, string][] = [], bad: [string, string][] = [];
  if (rank != null && rank <= 10) good.push(['rank', `「${kw}」 ${rank}위 — 1페이지 상단 자리`]);
  else if (rank != null && rank <= 40) bad.push(['rank', `${rank}위 — 1페이지 하단, 클릭이 거의 닿지 않는 자리`]);
  else if (rank != null && rank <= 100) bad.push(['rank', `${rank}위 — 2페이지 이후, 검색한 사람에게 거의 보이지 않는 자리`]);
  else bad.push(['rank', rank ? `${rank}위 — 검색 결과에서 사실상 보이지 않는 자리` : `「${kw}」 상위 ${k.n}개 안에 없음 — 검색한 사람에게 보이지 않는 자리`]);
  if (reviews != null && medianReview10 > 0) {
    if (reviews >= medianReview10) good.push(['review', `리뷰 ${won(reviews)}개 — 상위 10개 중앙값(${won(medianReview10)}개) 이상`]);
    else if (reviews >= 100) good.push(['review', `리뷰 ${won(reviews)}개 — 비교 대상에 오를 만큼은 쌓인 상태`]);
    else bad.push(['review', `리뷰 ${won(reviews)}개 — 상위 10개 중앙값 ${won(medianReview10)}개와 큰 차이`]);
  }
  if (price != null && avgPrice10) {
    if (price <= avgPrice10 * 0.97) good.push(['price', `판매가 ${won(price)}원 — 상위 10개 평균보다 ${won(avgPrice10 - price)}원 낮은 가격`]);
    else if (price <= avgPrice10 * 1.1) good.push(['price', `판매가 ${won(price)}원 — 상위 10개 평균(${won(avgPrice10)}원)과 비슷한 가격대`]);
    else if (price > avgPrice10 * 1.4) bad.push(['price', `판매가 ${won(price)}원 — 상위 10개 평균보다 ${Math.round(100 * (price / avgPrice10 - 1))}% 높은 가격`]);
  }
  if (axes) for (const a of ['hit', 'sale', 'quality'] as (keyof Axes)[]) {
    const d = axes[a] - k.axes10[a]; if (!k.axes10[a]) continue;
    if (d >= 0) good.push([a, `${AXIS_LABEL[a]} ${axes[a]} — 상위 10개 평균(${k.axes10[a]}) 이상`]);
    else if (d <= -0.5) bad.push([a, `${AXIS_LABEL[a]} ${axes[a]} — 상위 10개 평균 ${k.axes10[a]}보다 낮음`]);
  }
  if (pr && isAdP(pr)) bad.push(['ad', '지금 순위는 광고 자리 — 광고를 줄이면 내려갈 수 있는 순위']);
  if (leak === 'awareness') bad.unshift(['vol', `월 검색 ${won(g)}회 — 검색만으로는 수요가 크지 않은 키워드`]);
  if (leak === 'defend') {
    const relVol = k.volume.related.reduce((x, v) => x + v.total, 0);
    if (k.volume.related.length) bad.unshift(['rel', `연관 키워드 ${k.volume.related.length}개(월 ${won(relVol)}회)에는 아직 자리 없음`]);
    bad.push(['brand', '브랜드 이름 검색과 재구매 고객은 아직 쌓이기 전']);
  }
  // 시장 사실로 채우기 (업체 정보가 적을 때)
  if (good.length < 3 && g >= 5000) good.push(['vol', `월 ${won(g)}회 검색${k.volume.related.length ? '(연관 키워드 포함)' : ''} — 수요가 꾸준한 키워드`]);
  if (good.length < 3 && k.stats.newRate >= 10) good.push(['new', `최근 90일 신규 상품 ${k.stats.newRate}% — 새 상품도 올라오는 키워드`]);
  if (good.length < 3 && k.stats.adCount10 <= 3) good.push(['adfree', `상위 10개 중 광고 ${k.stats.adCount10}개 — 자연 순위 자리가 넓은 편`]);
  if (bad.length < 3 && leak !== 'defend' && leak !== 'awareness' && k.revenue.loss > 0) bad.push(['loss', `상위 10개가 가져가는 월 ${eok(k.revenue.loss)}(추정) 매출에서 빠져 있는 상태`]);
  const LEAD_KEY: Record<Leak, string> = { exposure: 'rank', trust: 'review', title: 'quality', conversion: 'price', awareness: 'vol', defend: 'rel' };
  bad.sort((x, y) => (y[0] === LEAD_KEY[leak] ? 1 : 0) - (x[0] === LEAD_KEY[leak] ? 1 : 0));
  const goodL = good.slice(0, 3).map(x => x[1]), badL = bad.slice(0, 3).map(x => x[1]); const why = [...badL];
  // ── 다섯 단계 상태 ──
  const fz = (n: number) => n;
  const funnel = leak === 'defend' ? [2, 2, 2, 2, 0] : [
    fz(leak === 'awareness' ? 1 : 2),
    fz(rank != null && rank <= 10 ? 2 : 1),
    fz(reviews == null ? 0 : (reviews >= 100 || (medianReview10 > 0 && reviews >= medianReview10 * 0.3)) ? 2 : 1),
    fz(price == null || !avgPrice10 ? 0 : price <= avgPrice10 * 1.1 ? 2 : 1),
    0];

  const target = leak === 'defend' ? Math.max(1, (rank ?? 5) - 2) : rank != null && rank <= 20 ? 3 : rank != null && rank <= 40 ? 5 : 10;   // 구간별 1차 목표 (21~40 → 5위, 밖 → 10위 진입 먼저)
  const P = (phase: 1 | 2 | 3, title: string, when: string, weapons: string[]) => ({ phase, title, when, weapons });
  let lead: string, plan: StoreData['plan'], skip: StoreData['skip'];
  switch (leak) {
    case 'exposure':
      lead = '쇼핑 상위노출';
      plan = [P(1, '노출', '1~10일', ['쇼핑 상위노출', '자동완성·연관검색어', '쇼핑검색광고(CPC)']), P(2, '검색 밖 수요', '2개월차', ['맘카페 보장형', '카페 배포', '블로그 체험단·기자단', '쿠팡 유입 세팅']), P(3, '자산 쌓기', '3개월차~', ['스레드', '당근', '인스타 체험단·인플루언서', 'AI 영상·숏폼'])];
      skip = [{ weapon: '메타 광고', why: '검색 수요가 이미 큰 키워드라, 검색하는 사람부터 받는 것이 먼저입니다.' }, { weapon: '파워링크(CPC)', why: '쇼핑 탭에서 주로 팔리는 상품이라, 쇼핑검색광고 쪽이 더 잘 맞습니다.' }];
      break;
    case 'trust':
      lead = '맘카페 보장형';
      plan = [P(1, '신뢰 쌓기', '1~3주', ['맘카페 보장형', '카페 배포', '블로그 체험단·기자단', '상세페이지 카피']), P(2, '노출', '후기가 올라오는 2~3주차부터', ['쇼핑 상위노출', '자동완성·연관검색어', '쇼핑검색광고(CPC)']), P(3, '자산 쌓기', '3개월차~', ['인스타 체험단·인플루언서', '스레드', 'AI 영상·숏폼'])];
      skip = [{ weapon: '쇼핑 상위노출 (지금)', why: '후기가 적은 상태에서 순위부터 올리면 클릭은 늘어도 구매로 이어지기 어려워, 2단계로 미뤘습니다.' }, { weapon: '메타 광고', why: '검색 수요가 있는 키워드라, 후기를 채우는 일이 먼저입니다.' }];
      break;
    case 'awareness':
      lead = '메타 광고';
      plan = [P(1, '수요 만들기', '1개월차', ['메타 광고', '인스타 체험단·인플루언서', 'AI 영상·숏폼', '광고 소재 제작']), P(2, '검색 받기', '검색량이 늘기 시작하면', ['자동완성·연관검색어', '쇼핑 상위노출', '맘카페 보장형']), P(3, '자산 쌓기', '3개월차~', ['스레드', '유튜브', '카페 배포'])];
      skip = [{ weapon: '쇼핑검색광고(CPC)', why: '검색량 자체가 적어, 광고비를 써도 클릭이 충분히 나오기 어렵습니다.' }, { weapon: '쿠팡 유입 세팅', why: '네이버에서 수요를 먼저 만든 뒤에 검토하는 것이 순서입니다.' }];
      break;
    case 'title':
      lead = '상품명·상세페이지 개선';
      plan = [P(1, '상품명 맞추기', '1주', ['상품명·상세페이지 개선', '상세페이지 카피']), P(2, '노출', '상품명을 고친 뒤', ['쇼핑 상위노출', '자동완성·연관검색어', '쇼핑검색광고(CPC)']), P(3, '신뢰·자산 쌓기', '2개월차~', ['맘카페 보장형', '블로그 체험단·기자단', '인스타 체험단·인플루언서'])];
      skip = [{ weapon: '쇼핑 상위노출 (지금)', why: '상품명이 키워드와 덜 맞는 상태에서 유입만 늘리면 순위에 반영되는 속도가 느려, 상품명을 고친 뒤로 미뤘습니다.' }, { weapon: '메타 광고', why: '검색으로 들어오는 수요를 먼저 받는 것이 순서입니다.' }];
      break;
    case 'defend':
      lead = '자동완성·연관검색어';
      plan = [P(1, '지키기·넓히기', '1~10일', ['쇼핑 상위노출', '자동완성·연관검색어', '쇼핑검색광고(CPC)']), P(2, '브랜드 검색 쌓기', '2개월차', ['맘카페 보장형', '블로그 체험단·기자단', '인스타 체험단·인플루언서']), P(3, '재구매·확장', '3개월차~', ['스레드', '당근', '쿠팡 유입 세팅', 'AI 영상·숏폼'])];
      skip = [{ weapon: '메타 광고', why: '이미 검색 상단에 있어, 브랜드 이름 검색을 키우는 쪽이 먼저입니다.' }, { weapon: '지식인', why: '상위권 상품에는 들이는 비용에 비해 효과가 작습니다.' }];
      break;
    default: // conversion
      lead = '상세페이지 카피';
      plan = [P(1, '전환 높이기', '1~2주', ['상세페이지 카피', '광고 소재 제작', '블로그 체험단·기자단']), P(2, '노출', '구매 전환이 오른 뒤', ['쇼핑 상위노출', '자동완성·연관검색어', '맘카페 보장형']), P(3, '브랜드 이미지 쌓기', '3개월차~', ['인스타 체험단·인플루언서', '유튜브', 'AI 영상·숏폼'])];
      skip = [{ weapon: '쇼핑검색광고(CPC)', why: '가격 비교에서 밀리는 상태에서 광고비부터 쓰면, 구매로 이어지지 못하고 새어 나가기 쉽습니다.' }, { weapon: '당근', why: '가격에 민감한 채널이라, 지금 가격대와는 잘 맞지 않습니다.' }];
  }

  // 매출 공식 — 리딩별
  const base = k.volume.group * CONV * k.revenue.aov;
  const cur = rank ? ctr(rank) : 0;
  let revenue: StoreData['revenue']; const basis = `월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 · 전환 ${(CONV * 100).toFixed(1)}% · 객단가 ${k.revenue.aov.toLocaleString('ko-KR')}원(상위 10개 평균) · 추정`;
  if (leak === 'awareness') {
    const reach = 150000, ctrAd = 0.012; const gain = reach * ctrAd * CONV * 0.6 * k.revenue.aov;   // 월 도달 15만 가정 · 광고 전환 0.6배
    revenue = { gain, gainMax: gain * 2, keep: 0, formula: '광고 도달 × 클릭률 × 전환율 × 객단가', basis: '월 도달 15만 · 클릭률 1.2% · 검색 대비 전환 0.6배 가정 · 추정' };
  } else if (leak === 'defend') {
    const keep = base * cur; const relVol = k.volume.related.reduce((a, v) => a + v.total, 0); const expand = relVol * ctr(3) * CONV * k.revenue.aov * 0.6;   // 연관 키워드 3위권 60% 가정
    revenue = { gain: expand, gainMax: relVol * ctr(1) * CONV * k.revenue.aov, keep, formula: '지키는 매출 = 검색량 × 현재 순위 클릭 점유 × 전환율 × 객단가 · 확장 = 연관 키워드 검색량 × 3위 클릭 점유 × 60%', basis: `${basis} · 연관 ${k.volume.related.length}개 월 ${relVol.toLocaleString('ko-KR')}회` };
  } else if (leak === 'trust' || leak === 'conversion' || leak === 'title') {
    const gain = base * (ctr(target) - cur) * 0.7;
    revenue = { gain, gainMax: base * (ctr(1) - cur), keep: 0, formula: '검색량 × 순위별 클릭 점유 × 전환율 × 객단가 (앞 단계 효과를 감안해 70%만 반영)', basis };
  } else {
    revenue = { gain: base * (ctr(target) - cur), gainMax: base * (ctr(1) - cur), keep: 0, formula: '검색량 × 순위별 클릭 점유 × 전환율 × 객단가', basis };
  }
  return { dv: PV3_DATA_VER, store: t.store, rank, reviews, price, click, link: t.link ?? (pr?.link ?? ''), title: pr?.productTitle ?? '', image: pr?.imageUrl ?? null, ad: pr ? isAdP(pr) : false, axes, weakAxis, strongAxis, keepCnt: pr?.keepCnt ?? null, openDays: pr?.openDate ? Math.round(days(pr.openDate)) : null, band, leak, stage: LEAK_STAGE[leak], why, good: goodL, bad: badL, funnel, lead, plan, skip, target, revenue, gapReview, gapPrice };
}

// ── 장 구성 (가로 720 · 세로 가변 이미지 10장) ──
export const PV3_PAGES = 10;
export const PV3_STORE_PAGES = [1, 2, 5, 6, 7, 8, 9];   // 업체별: 표지·진단·광고 설계·1단계 상세·2·3단계·일정과 역할·시뮬레이션
export const PV3_COMMON_PAGES = [3, 4, 10];              // 키워드 공통: 시장·사는 사람·콘텐츠/FAQ/문의
export const PV3_DESIGN = 5;                             // 디자인 버전 — 올리면 예전 이미지는 '없음'으로 보고 다시 렌더
export const PV3_DATA_VER = 3;                           // 계산 데이터 구조 버전 — 예전 구조(dv 없음)는 다시 계산해야 렌더
export const PV3_AI_VER = 3;                             // 워커 글 구조 버전 — 올리면 다음 준비 때 다시 요청
export type Pv3Img = { page: number; url: string; v?: number };
/** 현재 디자인 버전으로 필요한 장이 다 있는지 */
export const hasPages = (images: unknown, pages: number[]) => { const a = (Array.isArray(images) ? images : []) as Pv3Img[]; return pages.every(p => a.some(x => x.page === p && x.v === PV3_DESIGN && !!x.url)); };
export const AXIS_DESC: Record<keyof Axes, string> = { hit: '검색한 사람의 클릭·찜', sale: '판매 실적', quality: '키워드와 맞는 정도', review: '리뷰 수·평점', fresh: '등록 시기' };
export const PV3_TITLES = ['표지', '진단', '시장', '사는 사람', '광고 설계', '1단계 상세', '2·3단계', '일정·역할', '예상 매출·조합', '콘텐츠·FAQ·문의'];

// ── 워커 결과 타입 + 폴백 ──
// 제목류(headline·thesis·have·leak·buyer·reframe·narrative·contents.idea)는 명사 맺음, 설명류(summary·stages·first·marketRead)는 존댓말
export type KwAi = {
  buyer: { who: string; truth: string; moment: string };
  reframe: { weak: string; flip: string };
  narrative: { diagnosis: string; insight: string; strategy: string };
  marketRead?: string;                               // 이 키워드 시장 해석 2문장 (존댓말)
  contents: { fmt: string; idea: string; why?: string }[];   // 5개
  stages?: string[]; skipWhy?: string[];             // (구버전 호환)
  _src?: 'worker' | 'fallback' | 'final'; _v?: number;   // worker=워커 글 · fallback=기본 문장(워커 결과 오면 교체) · final=기본 문장 확정(워커 실패)
};
export type StoreAi = { headline: string; thesis: string; have: string[]; leak: string[]; summary?: string; stages?: string[]; first?: string; skipWhy?: string[]; _src?: 'worker' | 'fallback' | 'final'; _v?: number };

const REFRAME: Record<Leak, { weak: string; flip: string }> = {
  defend: { weak: '상위권일수록 같은 자리를 노리는 경쟁 상품이 늘어나는 시장', flip: '이미 가진 순위를 연관 키워드와 브랜드 검색으로 넓히면 지키는 비용이 줄어드는 구조' },
  trust: { weak: '후기가 적으면 1페이지에 올라가도 비교에서 밀리는 시장', flip: '후기가 쌓이면 같은 노출에서도 구매가 늘어나는 구조' },
  awareness: { weak: '검색량이 적어, 검색만 기다려서는 매출이 나오기 어려운 시장', flip: '검색 밖에서 먼저 수요를 만들면 경쟁 없이 자리를 잡을 수 있는 구조' },
  conversion: { weak: '가격 비교에서 비싼 상품이 먼저 걸러지는 시장', flip: '가격의 이유가 보이면 오히려 기억에 남는 상품이 되는 구조' },
  title: { weak: '상품명이 키워드와 어긋나면 유입을 늘려도 순위 반영이 느린 시장', flip: '상품명만 맞춰도 같은 유입이 순위에 더 잘 반영되는 구조' },
  exposure: { weak: '상품이 좋아도 1페이지 밖이면 비교 대상에 들지 못하는 시장', flip: '막힌 곳부터 순서대로 풀면 이미 가진 자산이 매출로 이어지는 구조' },
};
/** 상위 10 과 그 아래의 클릭지수 차이가 뚜렷한지 (0.5 이상) — '클릭이 순위를 가른다'는 말은 이때만 쓴다 */
export const clickGap = (k: KwData) => k.stats.avgClickMid ? Math.round((k.stats.avgClick10 - k.stats.avgClickMid) * 10) / 10 : 0;
export function fallbackKwAi(k: KwData, _s?: StoreData): KwAi {
  const kw = k.keyword; const g = k.volume.group; const small = k.kwLeak === 'awareness'; const won = (n: number) => n.toLocaleString('ko-KR');
  const read2 = clickGap(k) >= 0.5 ? `상위 10개의 클릭지수 평균은 ${k.stats.avgClick10}, 11~40위 평균은 ${k.stats.avgClickMid}입니다. 순위를 가르는 것은 리뷰 수보다 클릭·유입 쪽입니다.` : `상위 10개의 평균 가격은 ${won(k.stats.avgPrice10)}원, 리뷰 중앙값은 ${won(k.stats.medianReview10)}개입니다.`;
  return {
    buyer: { who: `「${kw}」${josa(kw, '을/를')} 검색해 비교하고 있는 구매 직전의 고객`, truth: '실패하지 않을 상품을 1페이지 안에서 고르고 싶은 마음', moment: '상위에 보이는 상품의 후기에서 자기 상황을 발견한 순간' },
    reframe: REFRAME[small ? 'awareness' : 'exposure'],
    narrative: small ? { diagnosis: '검색 수요 자체가 크지 않은 시장', insight: '검색하기 전에 먼저 본 상품을 기억하는 구매자', strategy: '검색 밖에서 먼저 보여주고, 검색으로 받는 순서' } : { diagnosis: '수요는 꾸준하지만 상위 10개가 대부분을 가져가는 시장', insight: '1페이지 안에서만 비교하고 고르는 구매자', strategy: '막힌 곳부터 순서대로 푸는 3단계' },
    marketRead: `${!g ? `「${kw}」 검색 결과 상위 ${k.n}개 상품을 기준으로 시장을 정리했습니다.` : k.volume.related.length && k.volume.main ? `「${kw}」${josa(kw, '은/는')} 매달 ${won(k.volume.main)}회, 연관 키워드까지 합치면 ${won(g)}회 검색됩니다.` : `「${kw}」${josa(kw, '은/는')} 매달 ${won(g)}회 검색되는 키워드입니다.`} ${read2}`,
    contents: [{ fmt: '카페 체험기', idea: '실제로 써 본 상황을 그대로 담은 후기', why: '구매 직전에 후기를 찾는 단계' }, { fmt: '블로그 비교글', idea: '같은 가격대 상품과 나란히 놓은 비교', why: '비교 검색에서 읽히는 글' }, { fmt: '숏폼', idea: '구매 전 고민 한 가지에 답하는 15초 영상', why: '검색 밖에서 처음 알게 되는 단계' }, { fmt: '당근 동네생활', idea: '동네 이웃이 남기는 실구매 후기', why: '지역 실구매층에게 닿는 글' }, { fmt: '상세페이지 카피', idea: '첫 화면 한 줄에 담는 가장 강한 근거', why: '들어온 사람이 구매를 결정하는 단계' }],
  };
}
/** 단계별 '왜 이 순서인지' 기본 문장 (존댓말) */
export function fallbackStages(k: KwData, s: StoreData): string[] {
  const kw = k.keyword; const r = s.rank ? `${s.rank}위` : '1페이지 밖'; const KW = (p: Parameters<typeof josa>[1]) => `「${kw}」${josa(kw, p)}`;
  const M: Record<Leak, string[]> = {
    exposure: [`지금은 ${r}${josa(r, '이라/라')} ${KW('을/를')} 검색한 사람 눈에 상품이 거의 보이지 않습니다. 그래서 먼저 ${s.target}위권 자리를 만들어, 리뷰와 가격이 비교 대상에 오르게 합니다.`, '순위가 자리 잡으면 카페·블로그 후기 콘텐츠를 더해, 검색하기 전부터 상품을 알게 만듭니다. 올라간 자리에서 생긴 클릭이 구매로 이어지게 하는 단계입니다.', '브랜드 이름으로 다시 검색하고 다시 구매하는 고객을 쌓습니다. 이 단계부터는 순위를 유지하는 부담이 줄어드는 구조가 됩니다.'],
    trust: ['후기가 적은 상태에서 순위만 올리면, 클릭은 늘어도 구매로 이어지기 어렵습니다. 그래서 검색했을 때 보이는 후기부터 먼저 채웁니다.', `후기가 쌓인 뒤에 ${s.target}위권 노출을 진행합니다. 같은 노출이라도 구매로 이어지는 비율이 달라집니다.`, '체험 콘텐츠와 영상으로 브랜드를 기억하게 만듭니다. 쌓인 콘텐츠는 상세페이지와 광고 소재로 다시 활용합니다.'],
    awareness: [`${KW('은/는')} 검색량 자체가 크지 않아, 검색만 기다려서는 매출이 나오기 어렵습니다. 그래서 아직 검색하지 않는 사람에게 상품을 먼저 보여주는 것부터 시작합니다.`, '광고와 콘텐츠로 검색이 늘기 시작하면, 그 검색을 놓치지 않도록 검색 결과 안의 자리를 잡습니다.', '후기와 영상이 쌓이면서 브랜드 이름으로 검색하는 고객이 생기는 단계입니다.'],
    defend: [`이미 ${r}로 1페이지 상단에 있습니다. 지금 자리를 지키면서, 아직 자리가 없는 연관 키워드로 노출을 넓힙니다.`, '검색했을 때 후기와 콘텐츠가 함께 보이게 해서, 순위가 흔들려도 브랜드 이름으로 찾아오는 고객을 만듭니다.', '재구매 고객을 쌓고, 쿠팡·당근·SNS 등 다른 채널로 매출 경로를 넓힙니다.'],
    conversion: ['상위 10개보다 가격이 높은 만큼, 들어온 사람이 가격의 이유를 바로 알 수 있어야 합니다. 그래서 상세페이지 첫 화면과 후기부터 손봅니다.', `구매 전환이 오른 뒤에 ${s.target}위권 노출을 진행합니다. 순서가 바뀌면 유입에 쓴 비용이 구매로 이어지지 못하고 새어 나가기 쉽습니다.`, '체험·영상 콘텐츠로 가격에 걸맞은 브랜드 이미지를 쌓습니다.'],
    title: [`상품명과 상세페이지가 ${KW('과/와')} 덜 맞는 상태라, 지금 유입을 늘려도 순위에 반영되는 속도가 느립니다. 그래서 상품명부터 키워드에 맞춥니다.`, `상품명을 고친 뒤에 ${s.target}위권 노출을 진행합니다. 같은 유입이라도 순위에 더 잘 반영됩니다.`, '후기·체험 콘텐츠로 구매 직전 단계의 신뢰를 채웁니다.'],
  };
  return M[s.leak];
}
/** 진단 '지금' 한 줄 (존댓말) */
export function nowLine(k: KwData, s: StoreData): string {
  const kw = k.keyword; const r = s.rank ? `${s.rank}위` : '1페이지 밖'; const won = (n: number) => n.toLocaleString('ko-KR');
  switch (s.leak) {
    case 'defend': return `「${kw}」 ${r}로 1페이지 상단에 있습니다. 이 자리에서 매달 ${man(s.revenue.keep)}(추정)의 매출을 지키고 있습니다.`;
    case 'trust': return `「${kw}」 ${r}에 있고, 리뷰는 ${s.reviews != null ? won(s.reviews) + '개로' : '적은 편으로'} 상위 10개 중앙값 ${won(k.stats.medianReview10)}개와 차이가 큽니다.`;
    case 'awareness': return `「${kw}」${josa(kw, '과/와')} 연관 키워드를 합친 월 검색은 ${won(k.volume.group)}회로, 검색 순위만으로 받을 수 있는 수요가 크지 않습니다.`;
    case 'conversion': return `판매가가 ${s.price != null ? won(s.price) + '원으로' : '높은 편으로'} 상위 10개 평균 ${won(k.stats.avgPrice10)}원보다 높아, 가격 비교에서 먼저 걸러지기 쉽습니다.`;
    case 'title': return `적합도 지수가 상위 10개 평균(${k.axes10.quality})보다 낮은 ${s.axes?.quality ?? '-'}입니다. 상품명과 상세페이지가 「${kw}」${josa(kw, '과/와')} 덜 맞는다는 뜻입니다.`;
    default: return s.rank ? `「${kw}」 ${r}(${s.band === '상단' ? '1페이지 상단' : s.band})에 있습니다. 검색한 사람의 클릭이 거의 닿지 않는 자리입니다.` : `「${kw}」 검색 결과 1페이지에 아직 들어오지 못해, 검색한 사람에게 보이지 않는 상태입니다.`;
  }
}
export function fallbackStoreAi(k: KwData, s: StoreData): StoreAi {
  const r = s.rank ? `${s.rank}위` : '1페이지 밖'; const kw = k.keyword; const won = (n: number) => n.toLocaleString('ko-KR');
  const rel = k.volume.related.length; const strong = s.reviews != null && k.stats.medianReview10 > 0 && s.reviews >= k.stats.medianReview10;
  const H: Record<Leak, string> = {
    defend: rel ? `「${kw}」 ${r}를 지키는 ${s.store}, 비어 있는 건 연관 키워드 ${rel}개의 자리` : `「${kw}」 ${r}를 지키는 ${s.store}, 다음은 브랜드 검색을 쌓을 차례`,
    exposure: strong ? `리뷰 ${won(s.reviews ?? 0)}개를 쌓고도 「${kw}」 ${r}에 묻힌 ${s.store}` : `「${kw}」 ${r}, 보이는 자리 한 칸이 비어 있는 ${s.store}`,
    trust: `「${kw}」 ${r}의 ${s.store}, 순위보다 먼저 채울 건 후기`,
    awareness: `월 ${won(k.volume.group)}회의 작은 검색 시장, ${s.store}${josa(s.store, '이/가')} 직접 수요를 만들 차례`,
    conversion: `「${kw}」 상위 10개 평균보다 ${s.gapPrice > 0 ? won(s.gapPrice) + '원 ' : ''}높은 가격, ${s.store}에 필요한 건 그 가격의 이유`,
    title: s.axes ? `${s.store} 상품명과 「${kw}」 사이의 간격 — 적합도 ${s.axes.quality} (상위 10개 평균 ${k.axes10.quality})` : `${s.store} 상품명과 「${kw}」 사이의 간격부터 좁힐 차례`,
  };
  const T: Record<Leak, string> = { defend: '지금 자리를 지키면서 연관 키워드와 브랜드 검색으로 넓히기', exposure: strong ? '상품은 준비된 상태, 부족한 건 보이는 자리 한 칸' : '먼저 보이는 자리부터, 그 다음이 후기와 콘텐츠', trust: '후기를 먼저 채우고, 그 다음에 노출', awareness: '검색을 기다리지 않고 수요를 먼저 만드는 설계', conversion: '가격의 이유를 먼저 보여주고, 그 다음에 노출', title: '상품명부터 키워드에 맞추고, 그 다음에 노출' };
  const SUM: Record<Leak, string> = {
    defend: `${s.store} 상품은 「${kw}」 ${r}로 이미 1페이지 상단에 있습니다. 지금 필요한 것은 순위를 더 올리는 일보다, 이 자리를 지키면서 아직 자리가 없는 연관 키워드로 넓히는 일입니다.`,
    exposure: `${s.store} 상품은 지금 「${kw}」 ${r}에 있습니다. ${strong ? '리뷰는 이미 상위 10개 수준이라 상품 자체는 준비가 되어 있습니다. 다만 ' : ''}검색한 사람 눈에 잘 보이지 않는 자리라는 점이 가장 큰 문제입니다.`,
    trust: `${s.store} 상품은 「${kw}」 ${r}에 있고, 리뷰가 상위 10개에 비해 많이 적습니다. 이 상태에서 순위만 올리면 클릭은 늘어도 구매로 이어지기 어려워, 후기부터 채우는 순서를 권해 드립니다.`,
    awareness: `「${kw}」${josa(kw, '은/는')} 월 검색이 ${won(k.volume.group)}회 수준이라, 검색 순위만으로는 매출을 키우기 어렵습니다. 그래서 아직 검색하지 않는 사람에게 ${s.store} 상품을 먼저 보여주는 것부터 시작하는 설계입니다.`,
    conversion: `${s.store} 상품은 상위 10개 평균보다 가격이 높은 편입니다. 유입을 늘리기 전에, 들어온 사람이 가격의 이유를 알 수 있도록 상세페이지와 후기부터 손보는 순서를 권해 드립니다.`,
    title: `${s.store} 상품은 적합도 지수가 상위 10개 평균보다 낮습니다. 상품명과 상세페이지가 「${kw}」${josa(kw, '과/와')} 덜 맞는다는 뜻이라, 유입을 늘리기 전에 상품명부터 맞추는 순서를 권해 드립니다.`,
  };
  return {
    headline: H[s.leak], thesis: T[s.leak], summary: SUM[s.leak], stages: fallbackStages(k, s),
    first: `카카오톡으로 상품 URL 하나만 보내 주시면 됩니다. 「${kw}」${josa(kw, '과/와')} 연관 키워드의 현재 순위부터 확인해서 답장드리겠습니다.`,
    have: (s.good ?? []).slice(0, 3), leak: (s.bad ?? s.why ?? []).slice(0, 3),
    skipWhy: s.skip.map(x => x.why),
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
