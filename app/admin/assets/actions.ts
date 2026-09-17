'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto/secret';
type R = { ok: boolean; msg: string };
export async function saveAccount(fd: FormData): Promise<R> {
  const me = await requireRole(['admin']); const sb = supabaseServer();
  const id = fd.get('id') ? Number(fd.get('id')) : null; const pw = String(fd.get('password') || '');
  const row: Record<string, unknown> = { service: String(fd.get('service') || '').trim(), login_id: String(fd.get('login_id') || '').trim(), business_id: fd.get('business_id') ? Number(fd.get('business_id')) : null, owner_id: String(fd.get('owner_id') || '') || null, payment_method: String(fd.get('payment_method') || ''), renew_note: String(fd.get('renew_note') || ''), url: String(fd.get('url') || ''), note: String(fd.get('note') || '') };
  if (!row.service || !row.login_id) return { ok: false, msg: '서비스명·아이디 필수' };
  try { if (pw) row.password_enc = encrypt(pw); } catch (e: any) { return { ok: false, msg: e.message }; }
  const { error, data } = id ? await sb.from('assets_accounts').update(row).eq('id', id).select('id').single() : await sb.from('assets_accounts').insert(row).select('id').single();
  if (error) return { ok: false, msg: error.message };
  await sb.from('asset_access_logs').insert({ user_id: me.id, account_id: data.id, action: id ? 'update' : 'create' });
  revalidatePath('/admin/assets'); return { ok: true, msg: id ? '수정됨' : '계정 추가' };
}
export async function revealPassword(id: number): Promise<{ ok: boolean; msg: string; pw?: string }> {
  const me = await requireRole(['admin']); const sb = supabaseServer();
  const { data } = await sb.from('assets_accounts').select('password_enc').eq('id', id).single();
  if (!data?.password_enc) return { ok: false, msg: '저장된 비밀번호 없음' };
  try { const pw = decrypt(data.password_enc); await sb.from('asset_access_logs').insert({ user_id: me.id, account_id: id, action: 'reveal' }); return { ok: true, msg: '열람 기록됨', pw }; }
  catch (e: any) { return { ok: false, msg: '복호화 실패: ' + e.message }; }
}
export async function deactivateAccount(id: number): Promise<R> {
  const me = await requireRole(['admin']); const sb = supabaseServer();
  const { error } = await sb.from('assets_accounts').update({ is_active: false }).eq('id', id);
  await sb.from('asset_access_logs').insert({ user_id: me.id, account_id: id, action: 'deactivate' });
  revalidatePath('/admin/assets'); return { ok: !error, msg: error?.message ?? '삭제됨' };
}
