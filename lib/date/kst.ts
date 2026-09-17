export const KST = 'Asia/Seoul';
export function todayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function nowTimeKST(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: KST, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}
export function monthOf(d: string) { return d.slice(0, 7); }
export function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
export const fmtMD = (d: string) => d.slice(5).replace('-', '/');
/** 해당 날짜가 속한 주의 월요일 */
export function weekStartOf(d: string) { const x = new Date(d + 'T00:00:00Z'); const dow = (x.getUTCDay() + 6) % 7; return addDays(d, -dow); }
export const won = (n: number | null | undefined) => '₩' + Math.round(Number(n ?? 0)).toLocaleString('ko-KR');
export const man = (n: number | null | undefined) => (Math.round(Number(n ?? 0) / 10000)).toLocaleString('ko-KR') + '만';
/** ISO(UTC) → 'MM/DD HH:mm' KST */
export function fmtKST(iso: string | null | undefined, withYear = false) {
  if (!iso) return '-';
  const d = new Date(iso); if (isNaN(d.getTime())) return String(iso);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return `${withYear ? g('year') + '-' : ''}${g('month')}/${g('day')} ${g('hour')}:${g('minute')}`;
}
