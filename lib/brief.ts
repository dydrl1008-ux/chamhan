// 영업 브리핑 — 셀팜 진행 현황을 '구간'으로만 보여 준다 (슬롯 10개 → "5~10개", 3위 → "5위 이내"). 상품·MID·파트너는 저장도 표시도 하지 않는다.
export const BRIEF_VIEWERS = ['dydrl1008@naver.com'];   // 일단 이 계정만 공개
export const BRIEF_ADMINS = ['dydrl1008@naver.com'];    // 진행 현황 넣기·구간 설정은 이 계정만 (나중에 다른 직원에게 화면을 열어도 원본은 못 넣고 못 봄)
export const canBriefEdit = (me: { email?: string | null } | null) => !!me?.email && BRIEF_ADMINS.includes(me.email.toLowerCase());
export const canBrief = (me: { email?: string | null } | null) => !!me?.email && BRIEF_VIEWERS.includes(me.email.toLowerCase());

export type BriefRow = { k: string; v: number | null; s: number | null; r: number | null; b: number | null; d: number | null; p?: number | null };   // d 등록 대비 · p 전일 대비 (+상승)
export type Buckets = { slots: number[]; ranks: number[]; good?: number };   // good: 이 순위 안에 있는 건만 브리핑에 낸다 (좋은 데이터만)
export const DEFAULT_BUCKETS: Buckets = { slots: [5, 10, 20, 30, 50], ranks: [5, 10, 20, 40, 100], good: 40 };
export type BriefCase = { slot: string; rank: string; best: string; trend: '상승' | '유지' | '하락' | '' };
export type BriefKw = { k: string; key: string; vol: string; v: number | null; ro: number; sb: string; cases: BriefCase[]; more: number; line: string };   // v 검색량(공개 수치) · ro 순위 구간 순서(정렬용)

export const normKw = (t: string) => t.toLowerCase().replace(/\s+/g, '');
const clean = (a: number[]) => [...new Set(a.filter(n => Number.isFinite(n) && n > 0).map(n => Math.round(n)))].sort((x, y) => x - y);
export const fixBuckets = (b?: Partial<Buckets> | null): Buckets => { const s = clean(b?.slots ?? []), r = clean(b?.ranks ?? []); const g = Math.round(Number(b?.good)); return { slots: s.length ? s : DEFAULT_BUCKETS.slots, ranks: r.length ? r : DEFAULT_BUCKETS.ranks, good: g > 0 ? g : DEFAULT_BUCKETS.good }; };
/** 슬롯 10개 · 경계 [5,10,20] → "5~10개" (위 경계 포함) */
export function slotLabel(n: number | null, b: number[]) { if (!n || n <= 0) return ''; let lo = 1; for (const hi of b) { if (n <= hi) return `${lo}~${hi}개`; lo = hi; } return `${b[b.length - 1]}개 이상`; }
/** 3위 · 경계 [5,10,20] → "5위 이내" */
export function rankLabel(n: number | null, b: number[]) { if (!n || n <= 0) return '순위 밖'; for (const hi of b) if (n <= hi) return `${hi}위 이내`; return `${b[b.length - 1]}위 밖`; }
const volLabel = (v: number | null) => v == null ? '' : v >= 10000 ? `월 ${Math.round(v / 1000) / 10}만 회` : `월 ${v.toLocaleString('ko-KR')}회`;

/** 원본 행 → 화면용(구간만). 같은 키워드의 여러 건은 순위 좋은 순으로 묶는다 */
export function toBrief(rows: BriefRow[], bk: Buckets, maxCases = 8): BriefKw[] {
  const g = new Map<string, BriefRow[]>();
  for (const r of rows) { const key = normKw(r.k); if (!key) continue; (g.get(key) ?? g.set(key, []).get(key)!).push(r); }
  const out: BriefKw[] = [];
  const good = bk.good ?? 40;
  for (const [key, all] of g) {
    // 좋은 데이터만: 표시 기준 순위 안에 있는 건만 쓴다. 그런 건이 하나도 없는 키워드는 브리핑에 나오지 않는다 (없는 키워드와 같게 취급)
    const rs = all.filter(r => !!r.r && r.r > 0 && r.r <= good); if (!rs.length) continue;
    rs.sort((a, b) => (a.r ?? 9999) - (b.r ?? 9999));
    const cases: BriefCase[] = rs.map(r => ({ slot: slotLabel(r.s, bk.slots), rank: rankLabel(r.r, bk.ranks), best: rankLabel(r.b, bk.ranks), trend: r.d == null || r.d < 0 ? '' : r.d > 0 ? '상승' : '유지' }));   // 하락은 표기하지 않는다
    // 같은 구간 조합은 한 줄로
    const seen = new Set<string>(); const uniq = cases.filter(c => { const s = `${c.slot}|${c.rank}|${c.trend}`; if (seen.has(s)) return false; seen.add(s); return true; });
    const top = uniq[0]; const vol = volLabel(rs.find(r => r.v != null)?.v ?? null);
    const line = top ? `「${rs[0].k}」 진행 사례 있음 — ${top.slot ? `${top.slot} 구간으로 ` : ''}현재 ${top.rank}${top.trend === '상승' ? ' (등록 대비 상승)' : ''}` : '';
    const r0 = rs[0].r; const ro = !r0 || r0 <= 0 ? 999 : (bk.ranks.findIndex(h => r0 <= h) + 1 || 998);
    out.push({ k: rs[0].k, key, vol, v: rs.find(r => r.v != null)?.v ?? null, ro, sb: slotLabel(rs[0].s, bk.slots), cases: uniq.slice(0, maxCases), more: Math.max(0, uniq.length - maxCases), line });
  }
  return out.sort((a, b) => a.k.localeCompare(b.k, 'ko'));
}

// ── 전체 요약 (이미지 표 위쪽) — 전부 %로만. 건수·합계는 내보내지 않아 전체 수량을 짐작할 수 없게 한다 ──
export type Pct = { label: string; pct: number };
export type BriefSummary = { dist: Pct[]; keep: number | null; byVol: Pct[]; bySlot: Pct[]; risers: { vol: string; up: number }[]; wins: { key: string; vol: string; slot: string; rank: string; up: number }[] };   // wins: 검색량 높은 키워드 중 등록 후 많이 오른 건 (키워드 이름 없이)   // 급상승은 키워드 이름 없이 검색량 구간으로만
const pct = (a: number, b: number) => b > 0 ? Math.round(1000 * a / b) / 10 : 0;
export const volBandOf = (v: number | null) => v == null ? '' : v < 10000 ? '1만 미만' : v < 30000 ? '1~3만' : v < 50000 ? '3~5만' : v < 100000 ? '5~10만' : '10만 이상';
export const slotBandOf = (n: number | null) => !n ? '' : n <= 2 ? '1~2개' : n <= 5 ? '3~5개' : n <= 10 ? '6~10개' : n <= 20 ? '11~20개' : '21개 이상';
const MIN_N = 5;   // 표본이 너무 적은 구간은 숨김 (2건 중 2건 = 100% 같은 숫자 방지)
export function summarize(rows: BriefRow[], bk: Buckets): BriefSummary {
  const n = rows.length;
  const band = (r: number | null) => !r || r <= 0 || r > 100 ? 3 : r <= 10 ? 0 : r <= 40 ? 1 : 2;
  const cnt = [0, 0, 0, 0]; rows.forEach(r => cnt[band(r.r)]++);
  const dist = ['1~10위', '11~40위', '41~100위', '100위 밖'].map((label, i) => ({ label, pct: pct(cnt[i], n) }));
  const live = rows.filter(r => r.d != null); const ok = (r: BriefRow) => (r.d ?? 0) >= 0;   // 상승·유지 묶음
  const keep = live.length ? pct(live.filter(ok).length, live.length) : null;
  // 구간별로는 '1페이지(40위 이내)에 있는 비율' — 상승·유지 비율은 구간마다 거의 같아서(87~89%) 차이를 보여 주지 못한다
  const page1 = (r: BriefRow) => !!r.r && r.r > 0 && r.r <= 40;
  const group = (labels: string[], idx: (r: BriefRow) => number) => labels.map((label, i) => { const g = rows.filter(r => idx(r) === i); return { label, pct: pct(g.filter(page1).length, g.length), n: g.length }; }).filter(x => x.n >= MIN_N).map(({ label, pct }) => ({ label, pct }));
  const byVol = group(['1만 미만', '1~3만', '3~5만', '5~10만', '10만 이상'], r => r.v == null ? -1 : r.v < 10000 ? 0 : r.v < 30000 ? 1 : r.v < 50000 ? 2 : r.v < 100000 ? 3 : 4);
  // 진행 규모 구간은 화면의 구간 설정과 같은 이름으로 (타일의 '1~5개'와 아래 칸의 구간 이름이 어긋나지 않게)
  const slotLabels = [...bk.slots.map(h => slotLabel(h, bk.slots)), slotLabel(bk.slots[bk.slots.length - 1] + 1, bk.slots)];
  const bySlot = group(slotLabels, r => !r.s ? -1 : slotLabels.indexOf(slotLabel(r.s, bk.slots)));
  const seen = new Set<string>();
  const risers = rows.filter(r => (r.p ?? 0) > 0).sort((a, b) => (b.p ?? 0) - (a.p ?? 0)).filter(r => { const k = normKw(r.k); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5).map(r => ({ vol: volBandOf(r.v), up: r.p ?? 0 }));
  // 검색량 높은 키워드 중 '등록 후 많이 올라 지금 10위 안'인 건 — 키워드 이름은 내보내지 않고 검색량도 어림값으로만
  const approx = (v: number) => v >= 100000 ? `약 ${Math.round(v / 100000) * 10}만` : v >= 10000 ? `약 ${Math.round(v / 10000)}만` : `약 ${Math.max(1, Math.round(v / 1000))}천`;
  const pick = (minVol: number) => { const sn = new Set<string>(); return rows.filter(r => (r.v ?? 0) >= minVol && !!r.r && r.r <= 10 && (r.d ?? 0) > 0).sort((a, b) => (b.d ?? 0) - (a.d ?? 0)).filter(r => { const k = normKw(r.k); if (sn.has(k)) return false; sn.add(k); return true; }).slice(0, 8); };
  let w = pick(50000); if (w.length < 4) w = pick(30000); if (w.length < 4) w = pick(10000);
  const wins = w.map(r => ({ key: normKw(r.k), vol: approx(r.v ?? 0), slot: slotLabel(r.s, bk.slots), rank: rankLabel(r.r, bk.ranks), up: r.d ?? 0 }));
  return { dist, keep, byVol, bySlot, risers, wins };
}
