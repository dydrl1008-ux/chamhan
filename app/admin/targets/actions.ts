'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
export async function saveTargets(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  await requireRole(['admin']);
  const month = String(fd.get('month')) + '-01';
  const users = fd.getAll('user_id').map(String), umargins = fd.getAll('user_margin').map(x => Number(String(x).replace(/,/g, '')) || 0);
  const teams = fd.getAll('team_id').map(Number), tmargins = fd.getAll('team_margin').map(x => Number(String(x).replace(/,/g, '')) || 0);
  const sb = supabaseServer();
  const rowsU = users.map((u, i) => ({ month, user_id: u, team_id: null, margin: umargins[i] }));
  const rowsT = teams.map((t, i) => ({ month, user_id: null, team_id: t, margin: tmargins[i] }));
  const { error: e1 } = rowsU.length ? await sb.from('monthly_targets').upsert(rowsU, { onConflict: 'month,user_id' }) : { error: null };
  const { error: e2 } = rowsT.length ? await sb.from('monthly_targets').upsert(rowsT, { onConflict: 'month,team_id' }) : { error: null };
  if (e1 || e2) return { ok: false, msg: (e1 ?? e2)!.message };
  revalidatePath('/admin/targets'); revalidatePath('/margin'); revalidatePath('/weekly');
  return { ok: true, msg: '저장됨' };
}
