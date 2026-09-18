'use server';
import { revalidatePath } from 'next/cache';
import { requireRole, getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { settleLogin, fetchApprovals, guessMap } from '@/lib/settlement/client';
import { runSync } from '@/lib/settlement/sync';
import { todayKST, addDays } from '@/lib/date/kst';
import { createClient } from '@supabase/supabase-js';
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
  await sb.from('app_settings').upsert({ key: 'settle_pending_code', value: String(fd.get('pending_code') || '01').trim(), updated_at: new Date().toISOString() });
  await sb.from('app_settings').upsert({ key: 'settle_pending_since', value: String(fd.get('pending_since') || '').trim(), updated_at: new Date().toISOString() });
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
  // 저장 즉시 저장된 정산 전체 기간에 대해 KPI 자동 마진 재계산 (정산 사이트 조회 없음)
  const adminSb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: rng } = await adminSb.from('settlement_items').select('req_date').order('req_date', { ascending: true }).limit(1).maybeSingle();
  const { data: rng2 } = await adminSb.from('settlement_items').select('req_date').order('req_date', { ascending: false }).limit(1).maybeSingle();
  let applied = 0;
  if (rng?.req_date && rng2?.req_date) { const { data, error } = await adminSb.rpc('apply_settlement_margin', { p_from: rng.req_date, p_to: rng2.req_date }); if (error) return { ok: false, msg: '매핑은 저장됐으나 KPI 재계산 실패: ' + error.message }; applied = Number(data ?? 0); }
  ['/settlement', '/margin', '/kpi', '/weekly', '/', '/me', '/admin/promotion'].forEach(p => revalidatePath(p));
  return { ok: true, msg: `담당자 매핑 저장 · KPI ${applied}건 즉시 재계산` };
}

export async function hideEmpl(emplId: string, hidden: boolean): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) return { ok: false, msg: '권한 없음' };
  const sb = supabaseServer();
  const { error } = await sb.from('settlement_empl_map').upsert({ empl_id: emplId, hidden }, { onConflict: 'empl_id' });
  if (error) return { ok: false, msg: error.message };
  const adminSb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: a } = await adminSb.from('settlement_items').select('req_date').order('req_date').limit(1).maybeSingle();
  const { data: b } = await adminSb.from('settlement_items').select('req_date').order('req_date', { ascending: false }).limit(1).maybeSingle();
  if (a?.req_date && b?.req_date) await adminSb.rpc('apply_settlement_margin', { p_from: a.req_date, p_to: b.req_date });
  ['/settlement', '/margin', '/kpi', '/'].forEach(p => revalidatePath(p));
  return { ok: true, msg: hidden ? `${emplId} 숨김 · KPI 재계산` : `${emplId} 복원` };
}
