// 환불요청 — 정산 사이트 refund.html / RefundRestController 동작 그대로 (본인 정산 계정 세션)
import { createClient } from '@supabase/supabase-js';
import { userSession } from './request';
import type { SettleRow } from './client';
import { todayKST, addDays } from '@/lib/date/kst';
import { refundCalc } from './refundCalc';
export { refundCalc, type RefundCalcIn } from './refundCalc';
const BASE = () => (process.env.SETTLE_BASE_URL || 'http://lchkgy.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const H = (cookie: string, json = false) => ({ Cookie: cookie, Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA, Referer: `${BASE()}/`, ...(json ? { 'Content-Type': 'application/json' } : {}) });
const n = (v: unknown) => { const x = Number(String(v ?? '0').replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : 0; };
async function getJ(cookie: string, path: string) { const res = await fetch(`${BASE()}${path}`, { headers: H(cookie), cache: 'no-store', redirect: 'manual' }); const t = await res.text(); if (res.status >= 300) throw new Error(`세션 만료 또는 권한 없음 (${res.status})`); try { return JSON.parse(t); } catch { throw new Error(`JSON 아님 ${path}: ${t.slice(0, 80)}`); } }
async function send(cookie: string, path: string, method: string, body: unknown) { const res = await fetch(`${BASE()}${path}`, { method, headers: H(cookie, true), body: JSON.stringify(body), cache: 'no-store', redirect: 'manual' }); return { status: res.status, text: await res.text() }; }

/** 환불 가능한 원 정산 (승인완료·미환불·본인). 작업기간이 검색기간과 겹치는 건 */
export const refundablePayments = (cookie: string, from: string, to: string): Promise<SettleRow[]> => getJ(cookie, `/api/pages/refund/payment/list?searchStartDate=${from}&searchEndDate=${to}&custName=&prodName=`).then(j => Array.isArray(j) ? j : []);
export const refundItemDefs = (cookie: string): Promise<{ refundItemId: string; refundItemName: string }[]> => getJ(cookie, '/api/pages/refund/refund-items').then(j => (Array.isArray(j) ? j : []).map((x: any) => ({ refundItemId: String(x.refundItemId), refundItemName: String(x.refundItemName) })));
export const origProdItems = (cookie: string, settlementSeq: string, prodId: string) => getJ(cookie, `/api/pages/refund/prodItem/list/${encodeURIComponent(settlementSeq)}/${encodeURIComponent(prodId)}`).then(j => (Array.isArray(j) ? j : []) as { seq: number; name: string; inputValue: string }[]);
export const myRefunds = (cookie: string, from: string, to: string): Promise<SettleRow[]> => getJ(cookie, `/api/pages/refund?searchStartDate=${from}&searchEndDate=${to}&custName=&prodName=`).then(j => Array.isArray(j) ? j : (j?.data ?? []));

export async function createRefund(userId: string, orig: SettleRow, inp: { refundDate: string; refundInflowCnt: number; gubun: string; memo?: string; items: { refundItemId: string; refundItemName: string; inputValue: string }[] }) {
  const { cookie } = await userSession(userId);
  const gubun = ['05', '06'].includes(String(orig.gubun)) ? '07' : inp.gubun;   // 선입금 원건은 환불구분 07 고정 (사이트와 동일)
  if (!gubun) throw new Error('환불구분을 선택하세요');
  if (!Number.isFinite(inp.refundInflowCnt) || inp.refundInflowCnt < 0) throw new Error('유입수는 0 이상');
  const c = refundCalc({ prodAmt: n(orig.prodAmt), saleAmt: n(orig.saleAmt), refundInflowCnt: inp.refundInflowCnt, dateWorkFrom: String(orig.dateWorkFrom), dateWorkTo: String(orig.dateWorkTo), refundDate: inp.refundDate, workDay: n(orig.workDay), incentiveRate: n(orig.incentiveRate), prodIncentiveInd: String(orig.prodIncentiveInd ?? 'N'), prodIncentive: n(orig.prodIncentive), gubun });
  if (c.err) throw new Error(c.err);
  // refund.html saveRefund(): 모달의 모든 input/select(원 정산 바인딩 + 환불 입력) → 서버가 refundInd Y / reqGubun RQ / refundSettlementSeq=settlementSeq 세팅
  const payload = {
    settlementSeq: String(orig.settlementSeq), inflowCnt: String(n(orig.inflowCnt)), prodAmt: String(n(orig.prodAmt)), saleAmt: String(n(orig.saleAmt)), saleTotalAmt: String(n(orig.saleTotalAmt)), memo: (inp.memo ?? String(orig.memo ?? '')).slice(0, 500), reqDate: String(orig.reqDate ?? '').slice(0, 10), incentiveRate: String(n(orig.incentiveRate)), custId: String(orig.custId), prodId: String(orig.prodId), userId: String(orig.userId), prodTotalAmt: String(n(orig.prodTotalAmt)), expectAmt: String(n(orig.expectAmt)), expectRateAmt: String(n(orig.expectRateAmt)), mileageUseInd: String(orig.mileageUseInd ?? 'N'), useMileage: String(n(orig.useMileage)), reqGubun: String(orig.reqGubun ?? ''), existMileage: String(n(orig.existMileage)), prodIncentiveInd: String(orig.prodIncentiveInd ?? 'N'), prodIncentive: String(n(orig.prodIncentive)),
    refundDate: inp.refundDate, refundInflowCnt: String(inp.refundInflowCnt), refundWorkDay: String(c.refundWorkDay), refundProdTotalAmt: String(c.refundProdTotalAmt), refundExpectRateAmt: String(c.refundExpectRateAmt), gubun, refundSaleTotalAmt: String(c.refundSaleTotalAmt),
    tbSettlementRefundItemDtoList: inp.items.map(x => ({ refundItemId: x.refundItemId, refundItemName: x.refundItemName, inputValue: x.inputValue ?? '' })),
  };
  const before = await myRefunds(cookie, inp.refundDate, inp.refundDate).catch(() => [] as SettleRow[]);
  const res = await send(cookie, '/api/pages/refund', 'POST', payload); const okNum = Number(res.text) > 0;
  let seq: string | null = null;
  if (okNum) { const after = await myRefunds(cookie, inp.refundDate, inp.refundDate).catch(() => [] as SettleRow[]); const bs = new Set(before.map(x => String(x.refundSettlementSeq))); const fresh = after.filter(x => !bs.has(String(x.refundSettlementSeq)) && String(x.settlementSeq) === String(orig.settlementSeq)); seq = fresh.at(-1)?.refundSettlementSeq ? String(fresh.at(-1)!.refundSettlementSeq) : null; }
  await admin().from('settlement_requests').insert({ user_id: userId, settlement_seq: seq, action: 'create', payload: { _type: 'refund', ...payload }, result: `${res.status} ${res.text.slice(0, 200)}`, ok: okNum });
  if (!okNum) throw new Error(`정산 사이트 응답: ${res.text.slice(0, 200) || res.status}`);
  return { seq, calc: c };
}
/** 환불요청 삭제(취소) — 승인요청 상태만 */
export async function deleteRefund(userId: string, refundSettlementSeq: string) {
  const { cookie } = await userSession(userId);
  const list = await myRefunds(cookie, addDays(todayKST(), -180), addDays(todayKST(), 60)); const row = list.find(r => String(r.refundSettlementSeq) === refundSettlementSeq);
  if (!row) throw new Error('내 환불요청에서 찾지 못했습니다'); if (String(row.applyStatus) !== '01') throw new Error(`승인요청 상태만 삭제 가능 (현재 ${row.applyStatusName ?? row.applyStatus})`);
  const payload = { settlementSeq: refundSettlementSeq, prodId: row.prodId, userId: row.userId, custId: row.custId };
  const res = await send(cookie, '/api/pages/refund', 'DELETE', payload); const okNum = Number(res.text) > 0;
  await admin().from('settlement_requests').insert({ user_id: userId, settlement_seq: refundSettlementSeq, action: 'cancel', payload: { _type: 'refund', ...payload }, result: `${res.status} ${res.text.slice(0, 200)}`, ok: okNum });
  if (!okNum) throw new Error(`정산 사이트 응답: ${res.text.slice(0, 200) || res.status}`);
}
