'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
export async function addIssue(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me || !['admin', 'head'].includes(me.role)) return { ok: false, msg: '총책임자·어드민만 등록할 수 있습니다.' };
  const title = String(fd.get('title') || '').trim(); if (!title) return { ok: false, msg: '제목을 입력하세요.' };
  const { error } = await supabaseServer().from('issues').insert({ issue_date: String(fd.get('issue_date')), title, body: String(fd.get('body') || ''), customer_notice: String(fd.get('customer_notice') || ''), author_id: me.id });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/issues'); revalidatePath('/');
  return { ok: true, msg: '이슈 등록됨 · 전 직원에게 노출' };
}
export async function markRead(issueId: number) {
  const me = await getProfile(); if (!me) return;
  await supabaseServer().from('issue_reads').upsert({ issue_id: issueId, user_id: me.id }, { onConflict: 'issue_id,user_id', ignoreDuplicates: true });   // 중복 클릭 시 무시 (update 정책 불필요)
  revalidatePath('/issues'); revalidatePath('/');
}
