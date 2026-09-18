'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { pollPending } from '@/lib/settlement/pending';
import { notifyPending } from '@/lib/settlement/notify';
export async function checkNow(): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) return { ok: false, msg: '권한 없음' };
  try { const r = await pollPending(3); if (r.fresh.length) await notifyPending(r.fresh); revalidatePath('/pending'); revalidatePath('/'); return { ok: true, msg: `applyStatus=${r.code} · 조회 ${r.total}건 → 상태 ${Object.entries(r.dist).map(([k, v]) => `${k}:${v}`).join(', ') || '없음'} · 대기 ${r.open}건 (신규 ${r.fresh.length}, 해소 ${r.resolved})${r.healthy ? '' : ' · ⚠ 해소 판정 보류(코드 확인 필요 또는 사이트 응답 없음)'}` }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}

export async function dismissPending(keys: string[], dismiss: boolean): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) return { ok: false, msg: '권한 없음' };
  if (!keys.length) return { ok: false, msg: '선택된 건 없음' };
  const { supabaseServer } = await import('@/lib/supabase/server');
  const { error } = await supabaseServer().from('settlement_pending').update(dismiss ? { dismissed_at: new Date().toISOString(), dismissed_by: me.id } : { dismissed_at: null, dismissed_by: null }).in('item_key', keys);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/pending'); revalidatePath('/');
  return { ok: true, msg: dismiss ? `${keys.length}건 알림 해제` : `${keys.length}건 복원` };
}

import { settleLogin } from '@/lib/settlement/client';
import { findRow, computeDefaults, approve, cancelApproval } from '@/lib/settlement/approve';
const can = async () => { const me = await getProfile(); return me && (me.role === 'admin' || me.role === 'head' || me.is_mgmt) ? me : null; };
/** 승인 팝업용: 사이트 현재 행 + 기본 계산값 */
export async function loadApprove(settlementSeq: string): Promise<{ ok: boolean; msg: string; d?: any; row?: any }> {
  const me = await can(); if (!me) return { ok: false, msg: '권한 없음' };
  try { const cookie = await settleLogin(); const r = await findRow(cookie, settlementSeq); if (!r) return { ok: false, msg: '정산 사이트에서 찾지 못함' };
    const d = computeDefaults(r); return { ok: true, msg: '', d, row: { settlementSeq: r.settlementSeq, empName: r.empName, custName: r.custName, prodName: r.prodName, reqGubunName: r.reqGubunName, gubunName: r.gubunName, dispReqDate: r.dispReqDate, incomAmt: r.incomAmt, statusName: r.statusName } }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function previewApprove(settlementSeq: string, confirmAmt: number): Promise<{ ok: boolean; d?: any; msg?: string }> {
  const me = await can(); if (!me) return { ok: false, msg: '권한 없음' };
  try { const cookie = await settleLogin(); const r = await findRow(cookie, settlementSeq); if (!r) return { ok: false, msg: '못 찾음' }; return { ok: true, d: computeDefaults(r, confirmAmt) }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function doApprove(settlementSeq: string, confirmAmt: number | null, remark: string): Promise<{ ok: boolean; msg: string }> {
  const me = await can(); if (!me) return { ok: false, msg: '권한 없음' };
  try { const r = await approve(settlementSeq, confirmAmt ?? undefined, remark, me.id); revalidatePath('/pending'); revalidatePath('/'); return { ok: true, msg: `${settlementSeq} 승인완료 · 입금 ${Number(r.d.confirmAmt).toLocaleString('ko-KR')} · 확정수수료 ${Number(r.d.confirmRateAmt).toLocaleString('ko-KR')}` }; }
  catch (e: any) { revalidatePath('/pending'); return { ok: false, msg: e.message }; }
}
export async function doCancel(settlementSeq: string): Promise<{ ok: boolean; msg: string }> {
  const me = await can(); if (!me) return { ok: false, msg: '권한 없음' };
  try { const r = await cancelApproval(settlementSeq, me.id); revalidatePath('/pending'); return { ok: true, msg: `${settlementSeq} 승인취소${r.verified ? ' 확인' : ' 전송 (사이트에서 확인)'}` }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
