'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
type R = { ok: boolean; msg: string };
const n = (v: FormDataEntryValue | null, d = 0) => { const x = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : d; };
const done = (paths: string[]) => paths.forEach(p => revalidatePath(p));
export async function saveCriteria(fd: FormData): Promise<R> {
  await requireRole(['admin']);
  const id = fd.get('id') ? Number(fd.get('id')) : null;
  const row = { from_position: String(fd.get('from_position') || '').trim(), to_position: String(fd.get('to_position') || '').trim(), monthly_margin_min: n(fd.get('monthly_margin_min')), yearly_margin_min: fd.get('yearly_margin_min') ? n(fd.get('yearly_margin_min')) : null, consecutive_months: n(fd.get('consecutive_months'), 1), max_late: n(fd.get('max_late')), max_absent: n(fd.get('max_absent')), max_sick: n(fd.get('max_sick')), min_tenure_months: n(fd.get('min_tenure_months')), note: String(fd.get('note') || ''), sort_order: n(fd.get('sort_order')) };
  if (!row.from_position || !row.to_position) return { ok: false, msg: '직급을 입력하세요.' };
  const sb = supabaseServer();
  const { error } = id ? await sb.from('promotion_criteria').update(row).eq('id', id) : await sb.from('promotion_criteria').insert(row);
  if (error) return { ok: false, msg: error.message.includes('promotion_criteria_from') ? `'${row.from_position}' 기준이 이미 있습니다.` : error.message };
  done(['/admin/criteria', '/criteria', '/me', '/admin/promotion']); return { ok: true, msg: '진급 기준 저장' };
}
export async function deactivateCriteria(id: number): Promise<R> {
  await requireRole(['admin']); const { error } = await supabaseServer().from('promotion_criteria').update({ is_active: false }).eq('id', id);
  done(['/admin/criteria', '/criteria', '/me', '/admin/promotion']); return { ok: !error, msg: error?.message ?? '삭제됨' };
}
export async function saveTiers(fd: FormData): Promise<R> {
  await requireRole(['admin']);
  const scope = String(fd.get('scope') || '').trim(); if (!scope) return { ok: false, msg: '그룹명 필요' };
  const ids = fd.getAll('tier_id').map(String); const labels = fd.getAll('label').map(String); const mins = fd.getAll('min_margin'); const maxs = fd.getAll('max_margin'); const rates = fd.getAll('rate'); const bonuses = fd.getAll('bonus');
  const rows = ids.map((id, i) => ({ id: id ? Number(id) : undefined, scope, label: labels[i].trim() || `${i + 1}구간`, min_margin: n(mins[i]), max_margin: String(maxs[i] ?? '').trim() === '' ? null : n(maxs[i]), rate: n(rates[i]) / 100, bonus: n(bonuses[i]), sort_order: i + 1, is_active: true }));
  for (let i = 1; i < rows.length; i++) if (rows[i].min_margin !== (rows[i - 1].max_margin ?? -1)) return { ok: false, msg: `${i + 1}번째 구간 하한이 이전 구간 상한과 달라 빈틈/겹침이 생깁니다.` };
  const sb = supabaseServer();
  const { error: e0 } = await sb.from('incentive_tiers').update({ is_active: false }).eq('scope', scope);
  if (e0) return { ok: false, msg: e0.message };
  const ins = rows.filter(r => !r.id).map(({ id, ...r }) => r); const upd = rows.filter(r => r.id);
  for (const r of upd) { const { error } = await sb.from('incentive_tiers').update(r).eq('id', r.id!); if (error) return { ok: false, msg: error.message }; }
  if (ins.length) { const { error } = await sb.from('incentive_tiers').insert(ins); if (error) return { ok: false, msg: error.message }; }
  done(['/admin/criteria', '/criteria', '/me', '/admin/promotion']); return { ok: true, msg: `'${scope}' 구간 ${rows.length}개 저장` };
}
export async function saveSettings(fd: FormData): Promise<R> {
  await requireRole(['admin']); const sb = supabaseServer();
  const rows = [['incentive_team_scopes', String(fd.get('incentive_team_scopes') || '')], ['new_margin_bonus_rate', String(n(fd.get('new_margin_bonus_rate')) / 100)], ['promotion_doc', String(fd.get('promotion_doc') || '')], ['incentive_doc', String(fd.get('incentive_doc') || '')], ['late_after', String(fd.get('late_after') || '09:30')]];
  for (const [key, value] of rows) { const { error } = await sb.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }); if (error) return { ok: false, msg: error.message }; }
  done(['/admin/criteria', '/criteria', '/me', '/admin/promotion', '/attendance']); return { ok: true, msg: '설정 저장' };
}

export async function deleteTierGroup(scope: string): Promise<R> {
  await requireRole(['admin']); if (['기본(팀원)', '기본(팀장)'].includes(scope)) return { ok: false, msg: '기본 그룹은 삭제 불가' };
  const { error } = await supabaseServer().from('incentive_tiers').update({ is_active: false }).eq('scope', scope);
  done(['/admin/criteria', '/criteria', '/me', '/admin/promotion']); return { ok: !error, msg: error?.message ?? `'${scope}' 그룹 삭제` };
}
