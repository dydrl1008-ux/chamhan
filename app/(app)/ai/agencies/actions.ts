'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';

type R = { ok: boolean; msg: string };
const lead = async () => { const me = await getProfile(); return me && ['admin', 'head'].includes(me.role) ? me : null; };
const STATUSES = ['new', 'drafted', 'approved', 'sent', 'replied', 'joined', 'rejected', 'excluded'];

/** 홍보방 내보내기 업로드 → 실행기 작업 등록 (파일은 브라우저에서 홍보글만 추려서 보냄) */
export async function uploadExport(fileName: string, room: string, text: string): Promise<R> {
  const me = await lead(); if (!me) return { ok: false, msg: '권한 없음' };
  if (!text.trim()) return { ok: false, msg: '홍보글을 찾지 못했습니다. 카카오톡 「대화 내보내기」 파일인지 확인하세요.' };
  if (text.length > 3_000_000) return { ok: false, msg: '파일이 너무 큽니다. 기간을 나눠 내보내 주세요.' };
  const sb = supabaseServer();
  const { data: imp, error } = await sb.from('agency_imports').insert({ file_name: fileName.slice(0, 200), source_room: room.slice(0, 100), raw_text: text, uploaded_by: me.id }).select('id').single();
  if (error) return { ok: false, msg: error.message };
  const { error: e2 } = await sb.from('ai_tasks').insert({ kind: 'work', agent: 'agency', title: `대행사 추출: ${room || fileName}`.slice(0, 200), instruction: JSON.stringify({ import_id: imp.id }), source: 'workhub', requested_by: me.name, status: 'queued' });
  if (e2) return { ok: false, msg: e2.message };
  revalidatePath('/ai/agencies');
  return { ok: true, msg: `업로드 #${imp.id} 접수 — 실행기가 추출·초안 작성 후 텔레그램으로 알립니다.` };
}

export async function setAgencyStatus(ids: number[], status: string): Promise<R> {
  const me = await lead(); if (!me) return { ok: false, msg: '권한 없음' };
  if (!STATUSES.includes(status) || !ids.length) return { ok: false, msg: '잘못된 요청' };
  const patch: Record<string, unknown> = { status };
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  const { error } = await supabaseServer().from('agencies').update(patch).in('id', ids.slice(0, 500));
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/ai/agencies');
  return { ok: true, msg: `${ids.length}곳 상태 변경` };
}

export async function saveAgency(id: number, draft: string, note: string): Promise<R> {
  const me = await lead(); if (!me) return { ok: false, msg: '권한 없음' };
  const { error } = await supabaseServer().from('agencies').update({ draft: draft.slice(0, 3000), note: note.slice(0, 1000) }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/ai/agencies');
  return { ok: true, msg: '저장됨' };
}

export async function redraft(ids: number[]): Promise<R> {
  const me = await lead(); if (!me) return { ok: false, msg: '권한 없음' };
  if (!ids.length) return { ok: false, msg: '선택된 곳이 없습니다' };
  const { error } = await supabaseServer().from('ai_tasks').insert({ kind: 'work', agent: 'agency', title: `초안 다시 쓰기 ${ids.length}곳`, instruction: JSON.stringify({ redraft_ids: ids.slice(0, 200) }), source: 'workhub', requested_by: me.name, status: 'queued' });
  if (error) return { ok: false, msg: error.message };
  return { ok: true, msg: `초안 다시 쓰기 ${ids.length}곳 접수 — 잠시 후 새로고침` };
}
