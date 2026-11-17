'use server';
import { supabaseAdmin } from '@/lib/supabase/admin';
/** 공개 수신거부 신청 — 이메일만 받아 email_optouts 에 넣는다 (자동 발송·수동 뽑기가 이 표로 거름). 이미 있으면 그대로 */
export async function submitUnsub(raw: string): Promise<{ ok: boolean; msg: string }> {
  const email = String(raw ?? '').trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(email)) return { ok: false, msg: '이메일 주소를 다시 확인해 주세요.' };
  const { error } = await supabaseAdmin().from('email_optouts').upsert({ email, code: 'page' }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) return { ok: false, msg: '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.' };
  return { ok: true, msg: '' };
}
