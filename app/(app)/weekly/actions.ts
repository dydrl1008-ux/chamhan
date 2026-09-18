'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { bizMonthOf } from '@/lib/date/period';
import { addDays } from '@/lib/date/kst';
type R = { ok: boolean; msg: string };
const canEdit = (me: { role: string; team_id: number | null }, team: number) => me.role === 'admin' || (me.role === 'manager' && me.team_id === team);

export async function ensureReport(team: number, weekStart: string): Promise<{ id: number } | null> {
  const me = await getProfile(); if (!me || !canEdit(me, team)) return null;
  const sb = supabaseServer();
  const { data } = await sb.from('weekly_reports').select('id').eq('team_id', team).eq('week_start', weekStart).maybeSingle();
  if (data) return { id: data.id };
  const { data: c, error } = await sb.from('weekly_reports').insert({ team_id: team, week_start: weekStart, created_by: me.id }).select('id').single();
  if (error) return null; return { id: c.id };
}
export async function saveReport(fd: FormData): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const team = Number(fd.get('team_id')); const weekStart = String(fd.get('week_start'));
  if (!canEdit(me, team)) return { ok: false, msg: '해당 팀 팀장만 작성할 수 있습니다.' };
  const rep = await ensureReport(team, weekStart); if (!rep) return { ok: false, msg: '보고서 생성 실패' };
  const checkpoints = fd.getAll('checkpoint').map(x => String(x).trim()).filter(Boolean);
  const submit = fd.get('submit') === '1';
  const patch: Record<string, unknown> = { goal_margin: Number(String(fd.get('goal_margin') || '0').replace(/,/g, '')) || 0, issues: String(fd.get('issues') || ''), checkpoints, common_directive: String(fd.get('common_directive') || '') };
  if (submit) { patch.status = 'submitted'; patch.submitted_at = new Date().toISOString(); }
  const sb = supabaseServer();
  const { error } = await sb.from('weekly_reports').update(patch).eq('id', rep.id);
  if (error) return { ok: false, msg: `저장 실패: ${error.message}` };
  // 인원별 지시·피드백
  const ids = fd.getAll('member_id').map(String);
  const notes = ids.map((uid, i) => ({ report_id: rep.id, user_id: uid, directive: String(fd.getAll('directive')[i] ?? ''), feedback: String(fd.getAll('feedback')[i] ?? '') }));
  if (notes.length) { const { error: e2 } = await sb.from('weekly_member_notes').upsert(notes, { onConflict: 'report_id,user_id' }); if (e2) return { ok: false, msg: `인원별 저장 실패: ${e2.message}` }; }
  // 팀원 이달 개인 목표 (팀장 권한, RLS: 본인 팀만)
  const month = bizMonthOf(addDays(weekStart, 6)) + '-01';   // 주 종료일이 속한 회사월
  const tRows = ids.map((uid, i) => ({ month, user_id: uid, team_id: null, margin: Number(String(fd.getAll('member_target')[i] ?? '0').replace(/,/g, '')) || 0 })).filter(x => x.margin > 0);
  if (tRows.length) { const { error: e3 } = await sb.from('monthly_targets').upsert(tRows, { onConflict: 'month,user_id' }); if (e3) return { ok: false, msg: `개인 목표 저장 실패: ${e3.message}` }; }
  revalidatePath('/weekly'); revalidatePath('/margin'); revalidatePath('/');
  return { ok: true, msg: submit ? '주간보고 제출 완료 · 총괄·대표 열람 가능' : '임시저장됨' };
}
export async function addPipeline(fd: FormData): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const team = Number(fd.get('team_id')); if (!canEdit(me, team)) return { ok: false, msg: '해당 팀 팀장만 등록할 수 있습니다.' };
  const client = String(fd.get('client') || '').trim(); if (!client) return { ok: false, msg: '업체명을 입력하세요.' };
  const { error } = await supabaseServer().from('pipeline').insert({ team_id: team, owner_id: String(fd.get('owner_id')), client, stage: String(fd.get('stage') || '콜'), expected_margin: String(fd.get('expected_margin') || ''), next_action: String(fd.get('next_action') || ''), risk: String(fd.get('risk') || ''), support: String(fd.get('support') || ''), memo: String(fd.get('memo') || ''), created_by: me.id });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/weekly'); return { ok: true, msg: '가망건 추가' };
}
export async function updatePipeline(id: number, patch: { stage?: string; is_active?: boolean }): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseServer().from('pipeline').update(patch).eq('id', id).select('id');
  if (error) return { ok: false, msg: error.message }; if (!data?.length) return { ok: false, msg: '권한 없음' };
  revalidatePath('/weekly'); return { ok: true, msg: patch.is_active === false ? '종료 처리' : '단계 변경' };
}
