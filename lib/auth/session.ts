import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
export type Role = 'admin' | 'head' | 'manager' | 'staff';
export type Profile = { id: string; name: string; email: string; role: Role; team_id: number | null; is_mgmt: boolean; position: string | null; is_active: boolean };

export const getProfile = cache(async function getProfile(): Promise<Profile | null> {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('id,name,email,role,team_id,is_mgmt,position,is_active').eq('id', user.id).maybeSingle();
  return (data as Profile) ?? null;
});
/** 서버 컴포넌트/액션에서 권한 강제. 화면은 표시만, 실제 차단은 여기 + RLS. */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect('/login');
  if (!p.is_active || !roles.includes(p.role)) redirect('/');
  return p;
}
