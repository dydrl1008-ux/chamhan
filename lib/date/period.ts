// 회사 월 주기: 매월 21일 시작 ~ 다음달 20일 마감. 7/21~8/20 = "2026-08" (마감 달 기준)
import { addDays } from './kst';
export const MONTH_START_DAY = 21;
/** 날짜 → 회사 월 키 (YYYY-MM, 마감 달) */
export function bizMonthOf(d: string): string {
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  if (day >= MONTH_START_DAY) { const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y; return `${ny}-${String(nm).padStart(2, '0')}`; }
  return d.slice(0, 7);
}
/** 회사 월 키 → [시작일, 종료일] */
export function bizMonthRange(key: string): [string, string] {
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7));
  const end = `${y}-${String(m).padStart(2, '0')}-${MONTH_START_DAY - 1}`;
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const start = `${py}-${String(pm).padStart(2, '0')}-${MONTH_START_DAY}`;
  return [start, end];
}
export function prevBizMonth(key: string) { const [s] = bizMonthRange(key); return bizMonthOf(addDays(s, -1)); }
export function nextBizMonth(key: string) { const [, e] = bizMonthRange(key); return bizMonthOf(addDays(e, 1)); }
export const bizLabel = (key: string) => { const [s, e] = bizMonthRange(key); return `${Number(key.slice(5))}월 (${s.slice(5).replace('-', '/')}~${e.slice(5).replace('-', '/')})`; };

// ---------- 주간보고 기간: 월~일 주 단위이되, 회사 월 마감(20일/21일)에서 끊는다 ----------
// 예) 10/19(월)~10/25(일) 주에 20일이 끼면 → 10/19~10/20 과 10/21~10/25 두 기간
export type ReportPeriod = { start: string; end: string };
function weekStart(d: string) { const x = new Date(d + 'T00:00:00Z'); const dow = (x.getUTCDay() + 6) % 7; return addDays(d, -dow); }
/** 날짜가 속한 보고 기간 */
export function reportPeriodOf(d: string): ReportPeriod {
  const ws = weekStart(d), we = addDays(ws, 6);
  const cut = `${d.slice(0, 7)}-${String(MONTH_START_DAY - 1).padStart(2, '0')}`;                 // 그 달 20일
  const cutIn = (c: string) => c >= ws && c < we;                                                     // 20일이 주 안에 있고 일요일이 아니면 분할
  // 주가 달을 넘길 수 있으므로 ws 달의 20일과 we 달의 20일 둘 다 확인
  const cuts = [...new Set([cut, `${ws.slice(0, 7)}-${String(MONTH_START_DAY - 1).padStart(2, '0')}`, `${we.slice(0, 7)}-${String(MONTH_START_DAY - 1).padStart(2, '0')}`])].filter(cutIn);
  for (const c of cuts) { if (d <= c) return { start: ws, end: c }; return { start: addDays(c, 1), end: we }; }
  return { start: ws, end: we };
}
export function prevReportPeriod(p: ReportPeriod): ReportPeriod { return reportPeriodOf(addDays(p.start, -1)); }
export function nextReportPeriod(p: ReportPeriod): ReportPeriod { return reportPeriodOf(addDays(p.end, 1)); }
/** 오늘 기준 최근 n개 보고 기간 (최신 먼저) */
export function recentReportPeriods(today: string, n = 8): ReportPeriod[] { const out: ReportPeriod[] = []; let p = reportPeriodOf(today); for (let i = 0; i < n; i++) { out.push(p); p = prevReportPeriod(p); } return out; }
