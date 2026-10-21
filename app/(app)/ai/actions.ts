'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';

const PAGES = ['/ai/orders', '/ai/checks', '/ai/agents'];
const back = (fd: FormData | null, msg: string, bad = false): never => {
  const to = String(fd?.get('back') || '/ai/orders'); const path = PAGES.includes(to) ? to : '/ai/orders';
  redirect(path + '?' + new URLSearchParams(bad ? { err: msg } : { msg }).toString());
};
const lead = async () => { const me = await getProfile(); return me && ['admin', 'head'].includes(me.role) ? me : null; };
const leadOrMgr = async () => { const me = await getProfile(); return me && ['admin', 'head', 'manager'].includes(me.role) ? me : null; };

/** 워크허브에서 비서실장에게 지시 (결과는 텔레그램 기본 보고 대상 + AI팀 화면) */
export async function sendOrder(fd: FormData): Promise<void> {
  const me = await leadOrMgr(); if (!me) back(fd, '권한 없음', true);
  const text = String(fd.get('instruction') || '').trim(); if (!text) back(fd, '지시 내용을 입력하세요.', true);
  const { data, error } = await supabaseServer().from('ai_tasks')
    .insert({ kind: 'order', agent: 'chief', title: text.slice(0, 80), instruction: text, source: 'workhub', requested_by: me!.name, requested_by_id: me!.id, status: 'queued' })
    .select('id').single();
  if (error) back(fd, error.message, true);
  revalidatePath('/ai/orders'); back(fd, `지시 접수 #${data!.id} — 결과는 텔레그램과 이 화면에 표시됩니다.`);
}

/** 결과에 대해 고쳐 달라고 하기 — 텔레그램 답장과 같음. 회사 사실은 공통 자료로, 형식·순서 같은 취향은 내 기준으로 학습 */
export async function reviseOrder(fd: FormData): Promise<void> {
  const me = await leadOrMgr(); if (!me) back(fd, '권한 없음', true);
  const id = Number(fd.get('task')); const text = String(fd.get('feedback') || '').trim();
  if (!id || !text) back(fd, '고칠 내용을 입력하세요.', true);
  const sb = supabaseServer();
  const { data: base } = await sb.from('ai_tasks').select('id,title,status,kind').eq('id', id).maybeSingle();
  if (!base || !['order', 'briefing'].includes(base.kind) || !['done', 'rejected'].includes(base.status)) back(fd, '끝난 지시에만 고쳐 달라고 할 수 있습니다.', true);
  const { data, error } = await sb.from('ai_tasks')
    .insert({ kind: 'order', agent: 'chief', title: `수정 #${id}: ${String(base!.title).slice(0, 60)}`, instruction: JSON.stringify({ revise_of: id, feedback: text }),
              source: 'workhub', requested_by: me!.name, requested_by_id: me!.id, status: 'queued' })
    .select('id').single();
  if (error) back(fd, error.message, true);
  revalidatePath('/ai/orders');
  redirect(`/ai/orders?task=${data!.id}&msg=${encodeURIComponent(`수정 접수 #${data!.id} — 끝나면 알림이 옵니다.`)}`);
}

export async function runCheckNow(fd: FormData): Promise<void> {
  const me = await lead(); if (!me) back(fd, '권한 없음', true);
  const { data, error } = await supabaseServer().from('ai_tasks')
    .insert({ kind: 'check', title: '수동 점검 (워크허브)', instruction: '활성 검사기 전체 실행', source: 'workhub', requested_by: me!.name, requested_by_id: me!.id, status: 'queued' })
    .select('id').single();
  if (error) back(fd, error.message, true);
  revalidatePath('/ai/checks'); back(fd, `점검 접수 #${data!.id} — 실행기가 처리하면 결과가 갱신됩니다.`);
}

/** 일정표 수정 후 pg_cron 다시 맞추기 (어드민) */
export async function syncSchedules(fd: FormData): Promise<void> {
  const me = await getProfile(); if (!me || me.role !== 'admin') back(fd, '어드민만 실행할 수 있습니다.', true);
  const { data, error } = await supabaseServer().rpc('ai_sync_schedules');
  if (error) back(fd, error.message, true);
  revalidatePath('/ai/agents'); back(fd, `자동 일정 ${data}개 등록됨`);
}
