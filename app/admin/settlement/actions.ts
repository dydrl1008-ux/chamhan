'use server';
import { revalidatePath } from 'next/cache';
import { requireRole, getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { settleLogin, fetchApprovals, guessMap } from '@/lib/settlement/client';
import { runSync } from '@/lib/settlement/sync';
import { todayKST, addDays } from '@/lib/date/kst';
export async function testConnection(): Promise<{ ok: boolean; msg: string; keys?: string[]; sample?: Record<string, unknown>; guess?: Record<string, string>; count?: number }> {
  await requireRole(['admin']);
  try { const cookie = await settleLogin(); const to = todayKST(), from = addDays(to, -7); const rows = await fetchApprovals(cookie, from, to);
    if (!rows.length) return { ok: true, msg: `로그인 성공 · 최근 7일 정산 0건 (필드 확인 불가, 기간에 데이터가 있어야 함)`, keys: [], count: 0 };
    return { ok: true, msg: `로그인 성공 · 최근 7일 ${rows.length}건`, keys: Object.keys(rows[0]), sample: rows[0], guess: guessMap(rows[0]), count: rows.length };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function saveFieldMap(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  await requireRole(['admin']);
  const m = Object.fromEntries(['settle_no', 'empl_id', 'req_date', 'profit', 'status', 'status_ok'].map(k => [k, String(fd.get(k) || '').trim()]));
  if (!m.settle_no || !m.empl_id || !m.req_date || !m.profit || !m.status) return { ok: false, msg: '필드 5개를 모두 지정하세요.' };
  const sb = supabaseServer();
  const { error } = await sb.from('app_settings').upsert({ key: 'settle_field_map', value: JSON.stringify(m), updated_at: new Date().toISOString() });
  const { error: e2 } = await sb.from('app_settings').upsert({ key: 'settle_vat_divisor', value: String(Number(fd.get('vat')) || 1.1), updated_at: new Date().toISOString() });
  if (error || e2) return { ok: false, msg: (error ?? e2)!.message };
  revalidatePath('/settlement'); return { ok: true, msg: '매핑 저장' };
}
export async function syncNow(from: string, to: string): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) return { ok: false, msg: '권한 없음' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return { ok: false, msg: '기간 오류' };
  const r = await runSync(from, to, me.name);
  revalidatePath('/settlement'); revalidatePath('/margin'); revalidatePath('/kpi'); revalidatePath('/weekly'); revalidatePath('/');
  return { ok: r.ok, msg: r.msg };
}
export async function saveEmplMap(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) return { ok: false, msg: '권한 없음' }; const sb = supabaseServer();
  const ids = fd.getAll('empl_id').map(String), users = fd.getAll('user_id').map(String);
  const rows = ids.map((empl_id, i) => ({ empl_id, user_id: users[i] || null })).filter(r => r.empl_id);
  for (const r of rows) { const { error } = await sb.from('settlement_empl_map').upsert(r); if (error) return { ok: false, msg: error.message }; }
  revalidatePath('/settlement'); return { ok: true, msg: '담당자 매핑 저장 · 다음 동기화부터 반영' };
}
