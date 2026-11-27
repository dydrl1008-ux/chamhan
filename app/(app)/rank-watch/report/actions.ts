'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { loadExtras, type Extras } from '@/lib/reportExtras';
type R = { ok: boolean; msg: string };

/** 리포트 추가 내용(검색수 · 경쟁 상품 · 지수 · 추가 키워드) — 화면이 뜬 뒤 따로 불러온다. 직원은 본인 업체만 */
export async function reportExtras(p: { uid: string; group: string; start: string; end: string }): Promise<{ ok: boolean; msg: string; data?: Extras }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const uid = me.role === 'staff' ? me.id : p.uid; if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end)) return { ok: false, msg: '기간을 확인하세요' };
  try { return { ok: true, msg: '', data: await loadExtras(uid, p.group || '(미분류)', p.start, p.end) }; } catch (e: any) { return { ok: false, msg: String(e?.message ?? e).slice(0, 200) }; }
}

/** 업체별 계약 기간·메모 저장 (본인 것만, 어드민은 아무나) */
export async function saveReportSetting(p: { uid: string; group: string; start: string; end: string; note: string }): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (p.uid !== me.id && me.role !== 'admin') return { ok: false, msg: '본인 업체만 저장할 수 있습니다' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end) || p.start > p.end) return { ok: false, msg: '계약 기간을 확인하세요' };
  const { error } = await supabaseServer().from('reward_watch_reports').upsert({ user_id: p.uid, group_key: p.group || '(미분류)', start_on: p.start, end_on: p.end, note: p.note.trim().slice(0, 600), updated_at: new Date().toISOString() }, { onConflict: 'user_id,group_key' });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/rank-watch/report'); return { ok: true, msg: '계약 기간 저장 — 다음 리포트부터 이 기간이 기본값' };
}
/** 리포트에 찍히는 내 연락처 */
export async function savePhone(phone: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { error } = await supabaseServer().from('reward_watch_links').update({ phone: phone.trim().slice(0, 30) }).eq('user_id', me.id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/rank-watch/report'); return { ok: true, msg: '연락처 저장' };
}
