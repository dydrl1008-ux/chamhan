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
