// 메타 인바운드 자동 접수 — 접수 시트의 한 줄(칸 배열)을 인바운드 DB 한 건으로 바꾼다. 칸 순서가 바뀌면 여기만 고친다
// 상담신청: ID · 제출시각 · 성함 · 전화번호 · 카카오톡 · (배분 표시) · 트래픽 경험 · 매체 · 예산 · 주요고민 · 유입 · 상태 · 메모   ← 제목 줄은 예전 양식이라 실제 내용 기준
// 바이럴 접수: ID · 제출시각 · 회사·브랜드명 · 담당자명 · 연락처 · 업종 · 관심 채널 · 링크 · 유입 · 상태 · 담당자 · 메모
export type IntakeRow = { ext_id: string; received_on: string; received_at: string | null; source: string; name: string; phone: string; phone_key: string; product: string; inquiry: string; url: string; inflow: string };
const t = (v: unknown, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** 시트 전화번호(앞 0 이 빠진 숫자)를 010-0000-0000 꼴로 */
export function fixPhone(v: unknown): { phone: string; key: string } {
  let d = String(v ?? '').replace(/\D/g, ''); if (d.startsWith('82') && d.length >= 11) d = d.slice(2); if (d && !d.startsWith('0') && d.length <= 10) d = '0' + d;
  const phone = d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d; return { phone, key: d.slice(0, 15) };
}
/** 제출시각 → KST 날짜 · 시각. '2026-11-25 3:21:22' 또는 '2026. 9. 23 오후 12:24:19' */
export function parseWhen(v: unknown): { day: string; at: string | null } | null {
  const s = String(v ?? '').trim(); const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})(?:\D+?(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/); if (!m) return null;
  const p = (x: string | number) => String(x).padStart(2, '0'); const day = `${m[1]}-${p(m[2])}-${p(m[3])}`; if (m[5] == null) return { day, at: null };
  let h = Number(m[5]); if (m[4] === '오후' && h < 12) h += 12; if (m[4] === '오전' && h === 12) h = 0; return { day, at: `${day}T${p(h)}:${m[6]}:${p(m[7] ?? 0)}+09:00` };
}
const PRODUCT: Record<string, string> = { 네이버쇼핑: '쇼핑', 네이버플레이스: '플레이스', 쿠팡: '쿠팡' };
const isTest = (...v: string[]) => v.some(x => /^(테스트|test)$/i.test(x.trim()));
export function mapIntake(tab: string, c: unknown[]): IntakeRow | null {
  const id = t(c[0], 80); const when = parseWhen(c[1]); if (!/^(sub|vir)_/.test(id) || !when) return null;
  if (tab.includes('바이럴')) {
    const co = t(c[2], 80), person = t(c[3], 40); const ph = fixPhone(c[4]); if (isTest(co, person) || (!co && !person && !ph.key)) return null;
    return { ext_id: id, received_on: when.day, received_at: when.at, source: '바이럴 접수', name: [co, person].filter(Boolean).join(' · ').slice(0, 100), ...{ phone: ph.phone, phone_key: ph.key }, product: t(c[6], 80), inquiry: [t(c[5]) && `업종: ${t(c[5])}`].filter(Boolean).join(' · '), url: t(c[7], 400), inflow: t(c[8], 200).replace(/^유입:\s*/, '') };
  }
  const name = t(c[2], 100).replace(/^[\s,.]+/, ''); const ph = fixPhone(c[3]); if (isTest(name) || (!name && !ph.key)) return null;
  const f = t(c[5], 400); const url = /^https?:\/\//.test(f) ? f : ''; const media = t(c[7], 80); const flow = t(c[10], 300);
  const bits = [t(c[6]), t(c[8]) && `예산 ${t(c[8])}`, t(c[4]) && `카톡 ${t(c[4])}`, t(c[9])].filter(Boolean); const isFlow = /^유입:/.test(flow); if (flow && !isFlow) bits.push(flow);
  return { ext_id: id, received_on: when.day, received_at: when.at, source: '상담신청', name, phone: ph.phone, phone_key: ph.key, product: PRODUCT[media] ?? media, inquiry: bits.join(' · ').slice(0, 2000), url, inflow: isFlow ? flow.replace(/^유입:\s*/, '').slice(0, 200) : '' };
}
