// 주간보고 기간 — 팀장이 지정한 저장값(week_start~week_end)이 우선, 없으면 기본 제안(월~일, 20일 마감이 끼면 20일에서 끊음)
import { addDays, weekStartOf } from '@/lib/date/kst';
import { reportPeriodOf, prevReportPeriod } from '@/lib/date/period';
export type RepPeriod = { start: string; end: string };
export type RepRow = { team_id: number | null; week_start: string; week_end: string | null; status?: string | null; id?: number };
export const endOf = (r: RepRow) => r.week_end ?? addDays(r.week_start, 6);
/** 기본 제안 기간 (저장된 보고서가 없을 때) */
export const suggestPeriod = (d: string): RepPeriod => reportPeriodOf(d);
/** 한 팀의 보고서 목록에서 오늘을 포함하는 '현재' 보고서와, 그 직전 보고서 */
export function teamReportStatus(reports: RepRow[], teamId: number | null, today: string) {
  const mine = reports.filter(r => r.team_id === teamId).sort((a, b) => b.week_start.localeCompare(a.week_start));
  const cur = mine.find(r => r.week_start <= today && endOf(r) >= today) ?? null;
  const curStart = cur ? cur.week_start : suggestPeriod(today).start;
  const last = mine.find(r => endOf(r) < curStart) ?? null;
  return { cur, last, curPeriod: cur ? { start: cur.week_start, end: endOf(cur) } : suggestPeriod(today) };
}
/** 보고서 화면에서 쓸 기간: URL 지정 > 저장된 보고서 > 기본 제안. 직전 기간은 저장된 직전 보고서 > 같은 길이로 앞당긴 기간 */
export function resolvePeriod(reports: RepRow[], teamId: number, today: string, w?: string, e?: string): { cur: RepPeriod; prev: RepPeriod; saved: RepRow | null } {
  const mine = reports.filter(r => r.team_id === teamId).sort((a, b) => b.week_start.localeCompare(a.week_start));
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  let cur: RepPeriod; let saved: RepRow | null = null;
  if (ok(w)) { saved = mine.find(r => r.week_start === w) ?? null; cur = { start: w!, end: ok(e) && e! >= w! ? e! : saved ? endOf(saved) : suggestPeriod(w!).end }; if (ok(e) && saved && endOf(saved) !== e) saved = { ...saved, week_end: e! }; }
  else { const st = teamReportStatus(mine, teamId, today); saved = st.cur; cur = st.curPeriod; }
  const before = mine.find(r => endOf(r) < cur.start);
  const len = Math.round((new Date(cur.end + 'T00:00:00Z').getTime() - new Date(cur.start + 'T00:00:00Z').getTime()) / 864e5) + 1;
  const prev: RepPeriod = before ? { start: before.week_start, end: endOf(before) } : (() => { const p = prevReportPeriod(cur); return p.end < cur.start ? p : { start: addDays(cur.start, -len), end: addDays(cur.start, -1) }; })();
  return { cur, prev, saved };
}
export const plainWeek = (d: string): RepPeriod => ({ start: weekStartOf(d), end: addDays(weekStartOf(d), 6) });
