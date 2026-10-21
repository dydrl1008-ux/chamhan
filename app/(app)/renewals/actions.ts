'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { assign } from '@/lib/settlement/customers';

type R = { ok: boolean; msg: string };
const lead = async () => { const me = await getProfile(); return me && ['admin', 'head'].includes(me.role) ? me : null; };

export async function giveUp(id: number, reason: string): Promise<R> {
  if (!(await getProfile())) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseServer().rpc('renewal_give_up', { p_id: id, p_reason: reason.slice(0, 300) });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/renewals');
  return { ok: true, msg: data === 'closed' ? '포기 처리 (종료)' : '포기 → 분배 대기로 넘어갔습니다' };
}

export async function undoGiveUp(id: number): Promise<R> {
  if (!(await getProfile())) return { ok: false, msg: '로그인 필요' };
  const { error } = await supabaseServer().rpc('renewal_undo_give_up', { p_id: id });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/renewals');
  return { ok: true, msg: '포기 취소 — 다시 내 미결제로' };
}

/** 분배 — to 를 비우면 영업사원에게 번갈아 자동. 사업자번호가 있으면 정산 사이트 고객 배정도 같이 (실패해도 분배는 유지) */
export async function reassign(ids: number[], to: string | null, alsoSettle: boolean): Promise<R> {
  const me = await lead(); if (!me) return { ok: false, msg: '어드민·총괄만 분배할 수 있습니다' };
  if (!ids.length) return { ok: false, msg: '분배할 업체를 고르세요' };
  const { data, error } = await supabaseServer().rpc('renewal_reassign', { p_ids: ids, p_to: to || null });
  if (error) return { ok: false, msg: error.message };
  const rows = (data ?? []) as { id: number; assignee: string; biz_no: string; empl_id: string }[];
  let settled = 0; const fail: string[] = [];
  if (alsoSettle) for (const r of rows) {
    if (!r.biz_no || !r.empl_id) continue;
    try { await assign(me.id, r.biz_no, [r.empl_id]); settled++; } catch (e: any) { fail.push(`${r.assignee}: ${String(e.message).slice(0, 60)}`); }
  }
  revalidatePath('/renewals');
  const who = [...new Set(rows.map(r => r.assignee))].join(', ');
  const noBiz = rows.filter(r => !r.biz_no).length;
  return {
    ok: true,
    msg: `${rows.length}곳 분배 (${who})` + (alsoSettle ? ` · 정산 사이트 배정 ${settled}곳` + (noBiz ? ` · 사업자번호 없어 ${noBiz}곳은 「고객 등록·배정」에서 직접` : '') + (fail.length ? ` · 실패 ${fail.join(' / ')}` : '') : ''),
  };
}

export async function syncNow(): Promise<R> {
  if (!(await lead())) return { ok: false, msg: '권한 없음' };
  const { data, error } = await supabaseServer().rpc('renewal_churn_sync', {});
  if (error) return { ok: false, msg: error.message };
  const d = data as { new: number; renewed: number; week1: number; week2: number };
  revalidatePath('/renewals');
  return { ok: true, msg: `새 이탈 ${d.new} · 연장됨 ${d.renewed} · 알림 1주 ${d.week1} · 2주 ${d.week2}` };
}
