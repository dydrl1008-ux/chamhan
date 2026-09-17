'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
export async function savePnl(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  await requireRole(['admin']); const sb = supabaseServer();
  const month = String(fd.get('month')) + '-01'; const n = (v: FormDataEntryValue | null) => Number(String(v ?? '0').replace(/,/g, '')) || 0;
  const { error: e1 } = await sb.from('pnl_months').upsert({ month, operating_profit: n(fd.get('operating_profit')), note: String(fd.get('note') || '') });
  if (e1) return { ok: false, msg: e1.message };
  const ids = fd.getAll('category_id').map(Number); const amounts = fd.getAll('amount'); const notes = fd.getAll('item_note');
  const rows = ids.map((category_id, i) => ({ month, category_id, amount: n(amounts[i]), note: String(notes[i] ?? '') }));
  const { error: e2 } = await sb.from('pnl_items').upsert(rows, { onConflict: 'month,category_id' });
  if (e2) return { ok: false, msg: e2.message };
  revalidatePath('/admin/pnl'); return { ok: true, msg: `${month.slice(0, 7)} 저장` };
}
export async function addCategory(name: string): Promise<{ ok: boolean; msg: string }> {
  await requireRole(['admin']); if (!name.trim()) return { ok: false, msg: '항목명' };
  const { error } = await supabaseServer().from('pnl_categories').insert({ name: name.trim(), sort_order: 99 });
  revalidatePath('/admin/pnl'); return { ok: !error, msg: error?.message ?? '항목 추가' };
}
