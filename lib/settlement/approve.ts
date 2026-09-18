import { createClient } from '@supabase/supabase-js';
import { settleLogin, fetchApprovals, type SettleRow } from './client';
import { todayKST, addDays } from '@/lib/date/kst';
const BASE = () => (process.env.SETTLE_BASE_URL || 'http://lchkgy.com').replace(/\/$/, '');
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const n = (v: unknown) => { const x = Number(String(v ?? '0').replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : 0; };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

/** 정산 사이트에서 해당 정산번호 행 조회. 원요청일(hint) ±3일 + 상태 필터로 좁혀 즉시 응답. 못 찾으면 넓게 재조회 */
export async function findRow(cookie: string, settlementSeq: string, statuses: string[] = ['01', '02', '03'], hint?: string | null): Promise<SettleRow | null> {
  const to = todayKST(); const y = Number(to.slice(0, 4)); const fy = to >= `${y}-12-21` ? `${y}-12-21` : `${y - 1}-12-21`;
  const h = hint || (settlementSeq.match(/^S(\d{4})(\d{2})(\d{2})/) ? `${settlementSeq.slice(1, 5)}-${settlementSeq.slice(5, 7)}-${settlementSeq.slice(7, 9)}` : null);   // 정산번호에 요청일이 들어 있음 (S20260918-0063)
  const windows: [string, string][] = h ? [[addDays(h, -3), addDays(h, 3)], [addDays(fy, -90), addDays(to, 1)]] : [[addDays(fy, -90), addDays(to, 1)]];
  for (const [a, b] of windows) for (const st of statuses) {
    const rows = await fetchApprovals(cookie, a, b, st);
    const hit = rows.find(r => String(r.settlementSeq) === settlementSeq); if (hit) return hit;
  }
  return null;
}
/** 정산 사이트 승인 팝업과 동일한 계산 */
export function computeDefaults(r: SettleRow, confirmAmtInput?: number) {
  const prodTotalAmt = n(r.prodTotalAmt), saleTotalAmt = n(r.saleTotalAmt), useMileage = n(r.useMileage), expectRateAmt = n(r.expectRateAmt);
  const incentiveRate = r.incentiveRate == null || r.incentiveRate === '' ? 0.3 : Number(r.incentiveRate); const gubun = String(r.gubun ?? ''); const refund = String(r.refundInd ?? '') === 'Y';
  const expectedAmt = Math.max(0, saleTotalAmt - useMileage);
  const fixedAmt = ['05', '06'].includes(gubun);
  let confirmAmt = confirmAmtInput ?? (fixedAmt ? saleTotalAmt : (n(r.confirmAmt) || expectedAmt));   // 기본값 = 입금예정 (0원 승인 방지)
  if (fixedAmt) confirmAmt = saleTotalAmt;
  let confirmMileage = 0, confirmMaxAmt = confirmAmt, costAmt = confirmAmt + useMileage - prodTotalAmt;
  if (expectedAmt < confirmAmt) { confirmMileage = confirmAmt - expectedAmt; confirmMaxAmt = expectedAmt; costAmt = expectedAmt + useMileage - prodTotalAmt; }
  let confirmRateAmt = String(r.prodIncentiveInd ?? '') === 'Y' ? expectRateAmt : Math.round(costAmt * incentiveRate / 1.1);
  if (fixedAmt) confirmRateAmt = -saleTotalAmt;
  return { refund, fixedAmt, prodTotalAmt, saleTotalAmt, useMileage, expectRateAmt, incentiveRate, expectedAmt, confirmAmt, confirmMileage, confirmMaxAmt, costAmt, confirmRateAmt, gubun, gubunName: String(r.gubunName ?? ''), prodIncentiveInd: String(r.prodIncentiveInd ?? 'N'),
    refundWorkDay: String(r.refundWorkDay ?? ''), refundProdTotalAmt: String(r.refundProdTotalAmt ?? ''), refundExpectRateAmt: String(r.refundExpectRateAmt ?? ''), statusName: String(r.statusName ?? ''), applyStatus: String(r.applyStatus ?? '') };
}
function buildPayload(r: SettleRow, d: ReturnType<typeof computeDefaults>, remark: string) {
  return { settlementSeq: String(r.settlementSeq), incentiveRate: String(d.incentiveRate), saveMileage: '', refundInd: String(r.refundInd ?? ''), confirmAmt: String(d.confirmAmt), confirmMaxAmt: String(d.confirmMaxAmt), confirmMileage: String(d.confirmMileage), confirmRateAmt: String(d.confirmRateAmt), costAmt: String(d.costAmt), expectRateAmt: String(d.expectRateAmt), expectedAmt: String(d.expectedAmt), gubunName: d.refund ? d.gubunName : '', prodIncentiveInd: d.prodIncentiveInd, prodTotalAmt: String(d.prodTotalAmt), refundExpectRateAmt: d.refund ? d.refundExpectRateAmt : '', refundProdTotalAmt: d.refund ? d.refundProdTotalAmt : '', refundWorkDay: d.refund ? d.refundWorkDay : '', saleTotalAmt: String(d.saleTotalAmt), useMileage: String(d.useMileage), remark };
}
async function post(cookie: string, path: string, body: unknown) {
  const res = await fetch(`${BASE()}/api/pages/applypaymentapprmng${path}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA, Referer: `${BASE()}/` }, body: JSON.stringify(body), cache: 'no-store', redirect: 'manual' });
  const text = await res.text(); return { status: res.status, text };
}
/** 승인: 사이트 재조회로 실제 승인(02) 확인까지. actor 는 기록용 */
export async function approve(settlementSeq: string, confirmAmtInput: number | undefined, remark: string, actorId: string, hintDate?: string | null) {
  const sb = admin(); const cookie = await settleLogin();
  const r = await findRow(cookie, settlementSeq, ['01'], hintDate); if (!r) { const other = await findRow(cookie, settlementSeq, ['02', '03'], hintDate); throw new Error(other ? `승인요청 상태가 아닙니다 (현재 ${other.statusName})` : '정산 사이트에서 승인요청 상태의 해당 정산번호를 찾지 못했습니다'); }
  if (String(r.applyStatus) !== '01') throw new Error(`승인요청 상태가 아닙니다 (현재 ${r.statusName})`);
  const d = computeDefaults(r, confirmAmtInput); const payload = buildPayload(r, d, remark);
  const res = await post(cookie, '', payload);
  const okNum = Number(res.text) > 0;
  let verified = false; try { const after = await findRow(cookie, settlementSeq, ['02'], String(r.reqDate ?? '').slice(0, 10)); verified = String(after?.applyStatus) === '02'; } catch {}
  await sb.from('settlement_actions').insert({ settlement_seq: settlementSeq, action: 'approve', payload, result: `${res.status} ${res.text.slice(0, 200)}${verified ? ' · 재조회 승인완료 확인' : ' · 재조회 미확인(전송은 성공)'}`, ok: okNum, actor_id: actorId });
  if (!okNum) throw new Error(`정산 사이트 응답: ${res.status} ${res.text.slice(0, 200)}`);
  const now = new Date().toISOString();
  await sb.from('settlement_pending').update({ resolved_at: now, resolved_status: verified ? '승인완료 (워크허브에서 승인)' : '승인 전송됨 (확인 중)', resolved_by: actorId }).eq('settle_no', settlementSeq).is('resolved_at', null);
  return { payload, d, verified };
}
/** 승인취소 (급여 처리된 건은 사이트가 거부) */
export async function cancelApproval(settlementSeq: string, actorId: string, hintDate?: string | null) {
  const sb = admin(); const cookie = await settleLogin();
  const r = await findRow(cookie, settlementSeq, ['02', '01'], hintDate); if (!r) throw new Error('정산 사이트에서 해당 정산번호를 찾지 못했습니다');
  const payload = { settlementSeq, refundInd: String(r.refundInd ?? '') };
  const res = await post(cookie, '/cancel', payload); const okNum = Number(res.text) > 0;
  let verified = false; try { const after = await findRow(cookie, settlementSeq, ['03'], String(r.reqDate ?? '').slice(0, 10)); verified = String(after?.applyStatus) === '03'; } catch {}
  await sb.from('settlement_actions').insert({ settlement_seq: settlementSeq, action: 'cancel', payload, result: `${res.status} ${res.text.slice(0, 200)}${verified ? ' · 재조회 승인취소 확인' : ''}`, ok: okNum && verified, actor_id: actorId });
  if (!okNum) throw new Error(`정산 사이트 응답: ${res.status} ${res.text.slice(0, 200)}`);
  return { verified };
}
