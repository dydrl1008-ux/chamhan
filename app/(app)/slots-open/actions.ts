'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { issueSlots, createSeller, ykrReady } from '@/lib/ykreward';
type R = { ok: boolean; msg: string };
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ALLOWED = ['staff', 'manager', 'head', 'admin'];

export async function openSlots(fd: FormData): Promise<R & { codes?: number[] }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!ALLOWED.includes(me.role)) return { ok: false, msg: '권한 없음' };
  if (!ykrReady()) return { ok: false, msg: 'ykreward 연동 설정(YKREWARD_URL / YKREWARD_SERVICE_KEY)이 없습니다.' };
  const login = String(fd.get('login') || '').trim(); const count = Number(fd.get('count')); const dailyGoal = Number(fd.get('daily_goal')); const start = String(fd.get('start') || ''); const days = Number(fd.get('days'));
  const slotType = String(fd.get('slot_type') || ''); const rewardName = String(fd.get('reward_name') || '').trim(); const targetName = String(fd.get('target_name') || '');
  if (!login) return { ok: false, msg: '셀러를 선택하세요' };
  if (!(count >= 1 && count <= 500)) return { ok: false, msg: '슬롯 수는 1~500' };
  if (!(dailyGoal >= 1)) return { ok: false, msg: '일유입을 입력하세요' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { ok: false, msg: '시작일을 선택하세요' };
  if (!(days >= 1)) return { ok: false, msg: '운영일수를 입력하세요' };
  if (!rewardName) return { ok: false, msg: '리워드 이름을 입력하세요' };
  const r = await issueSlots({ login, count, dailyGoal, start, days, slotType, rewardName, openedBy: me.name });
  if (!r.ok) return r;
  const { error } = await admin().from('reward_slot_opens').insert({ user_id: me.id, team_id: me.team_id, target_login: login, target_name: targetName, cnt: count, daily_goal: dailyGoal, start_date: start, days, slot_type: slotType || null, reward_name: rewardName, slot_codes: r.codes });
  if (error) return { ok: true, msg: `${r.msg} (이력 저장 실패: ${error.message})`, codes: r.codes };
  revalidatePath('/slots-open');
  return { ok: true, msg: `${rewardName} · ${login} 에 ${r.codes.length}개 발급 (#${r.codes[0]}~#${r.codes.at(-1)})`, codes: r.codes };
}

export async function newSeller(fd: FormData): Promise<R & { login?: string }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!ALLOWED.includes(me.role)) return { ok: false, msg: '권한 없음' };
  if (!ykrReady()) return { ok: false, msg: 'ykreward 연동 설정이 없습니다.' };
  const { data: st } = await supabaseServer().from('app_settings').select('value').eq('key', 'ykreward_parent_login').maybeSingle();
  const r = await createSeller({ login: String(fd.get('login') || ''), password: String(fd.get('password') || ''), name: String(fd.get('name') || ''), parentLogin: st?.value || 'lchkgy', manager: me.name });
  if (r.ok) revalidatePath('/slots-open');
  return { ...r, login: r.ok ? String(fd.get('login') || '').trim().toLowerCase() : undefined };
}
