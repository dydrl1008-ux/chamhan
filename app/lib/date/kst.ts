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
