// 네이버 데이터랩(통합검색어 트렌드) — 키워드의 월별 검색 흐름으로 「검색이 늘어나는 달」을 찾는다.
// 네이버 개발자센터 오픈 API 가 NAVER API HUB(네이버 클라우드)로 옮겨져, 그쪽 주소·헤더로 호출한다.
// 환경변수: NAVER_DATALAB_CLIENT_ID / NAVER_DATALAB_CLIENT_SECRET (네이버 클라우드 콘솔 > NAVER API HUB > Application > 인증 정보 · 사용 API 「검색어 트렌드」)
export type Season = { months: number[]; peak: number[]; flat: boolean };   // months: 1~12월 상대값(가장 높은 달 = 100), peak: 평균보다 뚜렷이 높은 달(1~12)
export function datalabConfigured() { return !!(process.env.NAVER_DATALAB_CLIENT_ID && process.env.NAVER_DATALAB_CLIENT_SECRET); }
const p2 = (n: number) => String(n).padStart(2, '0');

/** 지난 24개월(지난달까지)의 월별 검색 비율 → 달력 월별 평균. 자료가 모자라면 null */
export async function monthTrend(keyword: string): Promise<Season | null> {
  if (!datalabConfigured()) return null;
  const k = new Date(Date.now() + 9 * 3600e3); const y = k.getUTCFullYear(), m = k.getUTCMonth();   // m: 이번 달(0~11)
  const end = new Date(Date.UTC(y, m, 0)); const start = new Date(Date.UTC(y, m - 24, 1));
  const d = (x: Date) => `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}`;
  const res = await fetch('https://naverapihub.apigw.ntruss.com/search-trend/v1/search', { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { 'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_DATALAB_CLIENT_ID!, 'X-NCP-APIGW-API-KEY': process.env.NAVER_DATALAB_CLIENT_SECRET!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: d(start), endDate: d(end), timeUnit: 'month', keywordGroups: [{ groupName: keyword, keywords: [keyword] }] }) });
  const text = await res.text(); if (!res.ok) throw new Error(`데이터랩 ${res.status}: ${text.slice(0, 120)}`);
  const pts: { period: string; ratio: number }[] = JSON.parse(text)?.results?.[0]?.data ?? [];
  const sum = Array(12).fill(0), cnt = Array(12).fill(0);
  for (const p of pts) { const mo = Number(String(p.period).slice(5, 7)) - 1; if (mo < 0 || mo > 11 || !Number.isFinite(Number(p.ratio))) continue; sum[mo] += Number(p.ratio); cnt[mo]++; }
  if (cnt.filter(c => c > 0).length < 12) return null;   // 빈 달이 있으면(검색이 거의 없는 키워드) 판단하지 않는다
  const avg = sum.map((s, i) => s / cnt[i]); const max = Math.max(...avg); if (!(max > 0)) return null;
  const mean = avg.reduce((a, b) => a + b, 0) / 12; const months = avg.map(v => Math.round(v / max * 100));
  const flat = max / mean < 1.25;
  const peak = flat ? [] : avg.map((v, i) => ({ v, i })).filter(x => x.v >= mean * 1.2).sort((a, b) => b.v - a.v).slice(0, 4).map(x => x.i + 1).sort((a, b) => a - b);
  return { months, peak, flat };
}
