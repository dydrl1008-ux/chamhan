export type Tier = { id: number; scope: string; label: string; min_margin: number; max_margin: number | null; rate: number; bonus: number; sort_order: number };
export type Criteria = { id: number; from_position: string; to_position: string; monthly_margin_min: number; yearly_margin_min: number | null; consecutive_months: number; max_late: number; max_absent: number; max_sick: number; min_tenure_months: number; note: string | null; sort_order?: number };
/** 사람의 직급/역할에 맞는 그룹명: 직급명과 같은 그룹이 있으면 그것, 없으면 기본(팀장/팀원) */
export function scopeFor(tiers: Tier[], position: string | null, role: string): string { const scopes = new Set(tiers.map(t => t.scope)); if (position && scopes.has(position)) return position; return role === 'manager' ? (scopes.has('기본(팀장)') ? '기본(팀장)' : 'manager') : (scopes.has('기본(팀원)') ? '기본(팀원)' : 'staff'); }
export const isTeamScope = (scope: string, teamScopes: string[]) => teamScopes.includes(scope) || scope === 'manager';
export const tierOf = (tiers: Tier[], scope: string, m: number) => { const ts = tiers.filter(t => t.scope === scope).sort((a, b) => a.sort_order - b.sort_order); return ts.find(t => m >= Number(t.min_margin) && (t.max_margin === null || m < Number(t.max_margin))) ?? ts[0] ?? null; };
export const nextTier = (tiers: Tier[], scope: string, cur: Tier | null) => { const ts = tiers.filter(t => t.scope === scope).sort((a, b) => a.sort_order - b.sort_order); const i = cur ? ts.findIndex(t => t.id === cur.id) : -1; return ts[i + 1] ?? null; };
export function incentiveOf(tiers: Tier[], scope: string, margin: number, newMargin: number, newRate: number, teamBase = false) {
  const t = tierOf(tiers, scope, margin); const base = Math.max(0, margin);
  const items = [{ name: t ? `${teamBase ? '팀' : '월'} 마진 ${t.label} ${(Number(t.rate) * 100).toFixed(0)}%` : '구간 없음 (' + scope + ')', amt: t ? base * Number(t.rate) : 0 }];
  if (!teamBase && newRate > 0) items.push({ name: `신규 마진 ${(newRate * 100).toFixed(0)}%`, amt: Math.max(0, newMargin) * newRate });
  if (t && Number(t.bonus) > 0) items.push({ name: '구간 보너스', amt: Number(t.bonus) });
  return { tier: t, next: nextTier(tiers, scope, t), items, total: items.reduce((a, x) => a + x.amt, 0), scope };
}
export function monthsBetween(from: string | null, to: string) { if (!from) return 0; const a = new Date(from), b = new Date(to); return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0)); }
export function evalPromotion(c: Criteria | null, x: { monthMargin: number; yearMargin: number; consecutiveOk: boolean; late: number; absent: number; sick: number; tenure: number }) {
  if (!c) return null;
  const salesOk = x.monthMargin >= Number(c.monthly_margin_min) && x.consecutiveOk && (c.yearly_margin_min === null || x.yearMargin >= Number(c.yearly_margin_min));
  const attOk = x.late <= c.max_late && x.absent <= c.max_absent && x.sick <= c.max_sick;
  const tenOk = x.tenure >= c.min_tenure_months;
  return { c, salesOk, attOk, tenOk, ok: salesOk && attOk && tenOk, fails: [!salesOk && '마진', !attOk && '근태', !tenOk && '재직기간'].filter(Boolean) as string[] };
}
