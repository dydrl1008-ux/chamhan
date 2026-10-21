'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';

type R = { ok: boolean; msg: string };
const lead = async () => { const me = await getProfile(); return me && ['admin', 'head'].includes(me.role) ? me : null; };

/** CSV에서 읽은 행 (브라우저에서 열 이름 맞춰 변환) → leads_upsert. 500행씩 나눠 호출 */
export async function importLeads(rows: Record<string, unknown>[], fileName: string): Promise<R> {
  if (!(await lead())) return { ok: false, msg: '권한 없음' };
  if (!rows.length) return { ok: false, msg: '읽은 행이 없습니다' };
  const { data, error } = await supabaseServer().rpc('leads_upsert', { p_rows: rows.slice(0, 2000), p_file: fileName.slice(0, 200) });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/ai/leads');
  const d = data as { added: number; updated: number; skipped: number };
  return { ok: true, msg: `새 업체 ${d.added} · 갱신 ${d.updated} · 건너뜀 ${d.skipped}` };
}

export async function saveLeadSettings(fd: FormData): Promise<R> {
  const me = await getProfile(); if (!me || me.role !== 'admin') return { ok: false, msg: '어드민만 바꿀 수 있습니다' };
  const n = (k: string) => Math.max(0, Math.min(1000, Number(fd.get(k)) || 0));
  const weights = { ad_running: n('ad_running'), rank_drop: n('rank_drop'), review_vs_rank: n('review_vs_rank'), new_store: n('new_store'), has_phone: n('has_phone') };
  const sb = supabaseServer();
  const rows = [
    { key: 'lead_score_weights', value: JSON.stringify(weights) },
    { key: 'lead_daily_per_person', value: String(Math.max(1, Math.min(300, Number(fd.get('per')) || 30))) },
    { key: 'lead_recontact_days', value: String(Math.max(1, Math.min(365, Number(fd.get('recontact')) || 30))) },
  ];
  const { error } = await sb.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) return { ok: false, msg: error.message };
  await sb.rpc('leads_rescore');
  revalidatePath('/ai/leads');
  return { ok: true, msg: '저장하고 점수 다시 계산함' };
}

export async function assignNow(): Promise<R> {
  if (!(await lead())) return { ok: false, msg: '권한 없음' };
  const { data, error } = await supabaseServer().rpc('leads_assign_today');
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/ai/leads');
  return { ok: true, msg: `오늘 배분된 콜 리스트 ${data}건` };
}
