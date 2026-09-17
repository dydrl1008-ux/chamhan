'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
export async function addIp(fd: FormData) {
  const me = await requireRole(['admin']);
  const label = String(fd.get('label') || '').trim() || '신규';
  let cidr = String(fd.get('cidr') || '').trim();
  if (!cidr) return { ok: false, msg: 'IP를 입력하세요.' };
  if (!cidr.includes('/')) cidr += '/32';
  const { error } = await supabaseServer().from('allowed_ips').insert({ label, cidr, created_by: me.id });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/admin/ips'); return { ok: true, msg: '추가됨 (최대 60초 후 적용)' };
}
export async function toggleIp(id: number, on: boolean) {
  await requireRole(['admin']);
  const { error } = await supabaseServer().from('allowed_ips').update({ is_active: on }).eq('id', id);
  revalidatePath('/admin/ips'); return { ok: !error, msg: error?.message ?? '변경됨' };
}
