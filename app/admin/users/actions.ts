'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

function tempPassword() { return 'Wh!' + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 90 + 10); }

/** 사용자 초대: auth 계정 생성(service role) → 프로필 upsert(admin_upsert_profile, 호출자 admin 검증) */
export async function inviteUser(fd: FormData): Promise<{ ok: boolean; msg: string; temp?: string }> {
  await requireRole(['admin']);
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const name = String(fd.get('name') || '').trim();
  const role = String(fd.get('role') || 'staff');
  const team = fd.get('team_id') ? Number(fd.get('team_id')) : null;
  const position = String(fd.get('position') || '') || null;
  const hired = String(fd.get('hired_at') || '') || null;
  const annual = Number(fd.get('annual') || 0);
  const isMgmt = fd.get('is_mgmt') === 'on';
  if (!email || !name) return { ok: false, msg: '이름과 이메일은 필수입니다.' };

  const admin = supabaseAdmin();
  const temp = tempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: temp, email_confirm: true, user_metadata: { name } });
  if (error) return { ok: false, msg: `계정 생성 실패: ${error.message}` };

  // 프로필은 admin_upsert_profile로 — 호출자가 admin인지 DB가 다시 검증
  const { error: e2 } = await supabaseServer().rpc('admin_upsert_profile', {
    p_id: created.user.id, p_name: name, p_email: email, p_role: role, p_team: team,
    p_is_mgmt: isMgmt, p_position: position, p_hired: hired, p_annual: annual,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(created.user.id);   // 프로필 실패 시 auth 계정 롤백 (고아 계정 방지)
    return { ok: false, msg: `프로필 생성 실패: ${e2.message}` };
  }
  revalidatePath('/admin/users');
  return { ok: true, msg: `${name} 초대 완료`, temp };
}

export async function updateUser(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  await requireRole(['admin']);
  const id = String(fd.get('id'));
  const patch = {
    role: String(fd.get('role')), team_id: fd.get('team_id') ? Number(fd.get('team_id')) : null,
    position: String(fd.get('position') || '') || null, is_active: fd.get('is_active') === 'on',
    is_mgmt: fd.get('is_mgmt') === 'on', annual_leave_granted: Number(fd.get('annual') || 0),
  };
  const { error } = await supabaseServer().from('profiles').update(patch).eq('id', id);   // RLS: admin만 통과
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/admin/users');
  return { ok: true, msg: '저장됨' };
}

export async function resetPassword(id: string): Promise<{ ok: boolean; msg: string; temp?: string }> {
  await requireRole(['admin']);
  const temp = tempPassword();
  const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password: temp });
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '임시 비밀번호 발급', temp };
}
