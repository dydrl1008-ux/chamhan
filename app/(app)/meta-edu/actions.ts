'use server';
// 메타팀 교육 — 팀장(메타팀 팀장 · 총괄 · 어드민): 1차 완료 체크 · 재시험 허락 · 스크립트 승인(투입) / 사원: 시험 · 스크립트 제출
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { metaAccess, metaTeamId } from '@/lib/meta';
import { eduLoad, eduPatch, stageOf, PASS_SCORE, SCRIPT_PARTS } from '@/lib/metaEdu';
import { drawExam, quizOf, SUBJECT } from '@/lib/metaEduQuiz';
type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
const needSql = (m: string) => /meta_edu/.test(m) ? '0101 SQL(메타팀 교육 표)을 먼저 실행해 주세요' : m;
async function who() { const me = await getProfile(); if (!me || !me.is_active) return null; const a = await metaAccess(me); return a.ok ? { me, ...a } : null; }
async function target(userId: string) { const tid = await metaTeamId(); const { data } = await supabaseAdmin().from('profiles').select('id,name,team_id,role').eq('id', userId).maybeSingle(); return data && tid != null && data.team_id === tid && data.role === 'staff' ? data : null; }
const note = (user_id: string, title: string, body = '') => supabaseAdmin().from('notifications').insert({ user_id, kind: 'info', title, body, link: '/meta-edu' });
async function leads(): Promise<string[]> { const tid = await metaTeamId(); if (tid == null) return []; const { data } = await supabaseAdmin().from('profiles').select('id').eq('team_id', tid).eq('role', 'manager').eq('is_active', true); return (data ?? []).map(x => x.id); }

/** 1차 대면 교육 완료 체크 / 취소 (팀장) */
export async function eduStep1(userId: string, on: boolean): Promise<R> {
  const x = await who(); if (!x?.lead) return { ok: false, msg: '팀장만 할 수 있습니다' }; const t = await target(userId); if (!t) return { ok: false, msg: '메타팀 사원이 아닙니다' };
  const { error } = await eduPatch(userId, { step1_at: on ? new Date().toISOString() : null, step1_by: on ? x.me.id : null }); if (error) return { ok: false, msg: needSql(error.message) };
  if (on) await note(userId, '1차 교육 완료 — 교육자료가 열렸습니다', '교육 메뉴에서 자료 5개를 순서대로 읽어 주세요'); revalidatePath('/meta-edu'); return { ok: true, msg: on ? `${t.name} 1차 완료` : '1차 완료 취소' };
}
/** 재시험 허락 (팀장) */
export async function eduRetake(userId: string): Promise<R> {
  const x = await who(); if (!x?.lead) return { ok: false, msg: '팀장만 할 수 있습니다' }; const t = await target(userId); if (!t) return { ok: false, msg: '메타팀 사원이 아닙니다' };
  const { error } = await eduPatch(userId, { retake_ok: true }); if (error) return { ok: false, msg: needSql(error.message) };
  await note(userId, '재시험이 허락되었습니다', '틀린 부분의 교육자료를 다시 읽고 응시해 주세요'); revalidatePath('/meta-edu'); return { ok: true, msg: `${t.name} 재시험 허락` };
}
/** 스크립트 승인 = 투입 (팀장). 시험 합격 + 스크립트 제출이 되어 있어야 한다 */
export async function eduDeploy(userId: string): Promise<R> {
  const x = await who(); if (!x?.lead) return { ok: false, msg: '팀장만 할 수 있습니다' }; const t = await target(userId); if (!t) return { ok: false, msg: '메타팀 사원이 아닙니다' };
  const s = await eduLoad([userId]); if (s.missing) return { ok: false, msg: needSql('meta_edu') }; const st = stageOf(s.rows.get(userId)!, s.exams.get(userId)!);
  if (st === 'done') return { ok: true, msg: '이미 투입 상태입니다' }; if (st !== 'review') return { ok: false, msg: '시험 합격과 스크립트 제출이 끝난 뒤에 승인할 수 있습니다' };
  const { error } = await eduPatch(userId, { deployed_at: new Date().toISOString(), deployed_by: x.me.id, script_back: '' }); if (error) return { ok: false, msg: needSql(error.message) };
  await note(userId, '영업 투입이 승인되었습니다', '이제 인바운드 DB 가 배정됩니다'); revalidatePath('/meta-edu'); return { ok: true, msg: `${t.name} 투입 승인 — 이제 DB 배분 대상입니다` };
}
/** 스크립트 돌려보내기 (팀장) — 사유를 적으면 사원이 고쳐서 다시 낸다 */
export async function eduScriptBack(userId: string, reason: string): Promise<R> {
  const x = await who(); if (!x?.lead) return { ok: false, msg: '팀장만 할 수 있습니다' }; const t = await target(userId); if (!t) return { ok: false, msg: '메타팀 사원이 아닙니다' };
  const why = String(reason ?? '').trim().slice(0, 1000); if (!why) return { ok: false, msg: '고칠 부분을 적어 주세요' };
  const { error } = await eduPatch(userId, { script_at: null, script_back: why }); if (error) return { ok: false, msg: needSql(error.message) };
  await note(userId, '스크립트를 다시 써 주세요', why.slice(0, 300)); revalidatePath('/meta-edu'); return { ok: true, msg: '돌려보냄' };
}
/** 투입 취소 (팀장) — 다시 교육 단계로. 이미 배정된 DB 는 그대로 두므로 필요하면 인바운드 DB 에서 재배정 */
export async function eduUndeploy(userId: string): Promise<R> {
  const x = await who(); if (!x?.lead) return { ok: false, msg: '팀장만 할 수 있습니다' }; const t = await target(userId); if (!t) return { ok: false, msg: '메타팀 사원이 아닙니다' };
  const { error } = await eduPatch(userId, { deployed_at: null, deployed_by: null }); if (error) return { ok: false, msg: needSql(error.message) }; revalidatePath('/meta-edu'); return { ok: true, msg: `${t.name} 투입 취소` };
}
/** 스크립트 제출 (본인) — 시험 합격 후 */
export async function eduScriptSave(script: Record<string, string>, submit: boolean): Promise<R> {
  const x = await who(); if (!x || x.lead) return { ok: false, msg: '메타팀 사원만 제출합니다' };
  const s = await eduLoad([x.me.id]); if (s.missing) return { ok: false, msg: needSql('meta_edu') }; const st = stageOf(s.rows.get(x.me.id)!, s.exams.get(x.me.id)!); if (st !== 'script' && st !== 'review') return { ok: false, msg: '시험에 합격한 뒤에 작성할 수 있습니다' };
  const clean: Record<string, string> = {}; for (const p of SCRIPT_PARTS) clean[p.key] = String(script?.[p.key] ?? '').trim().slice(0, 4000);
  if (submit) { const short = SCRIPT_PARTS.find(p => clean[p.key].length < 50); if (short) return { ok: false, msg: `「${short.label.split(' — ')[0]}」 부분을 조금 더 구체적으로 적어 주세요 (50자 이상)` }; }
  const { error } = await eduPatch(x.me.id, { script: clean, script_at: submit ? new Date().toISOString() : null }); if (error) return { ok: false, msg: needSql(error.message) };
  if (submit) { const ls = await leads(); if (ls.length) await supabaseAdmin().from('notifications').insert(ls.map(user_id => ({ user_id, kind: 'info', title: `${x.me.name} — 영업 스크립트 제출`, body: '확인 후 투입 승인 또는 돌려보내기', link: '/meta-edu' }))); }
  revalidatePath('/meta-edu'); return { ok: true, msg: submit ? '제출했습니다 — 팀장 승인을 기다려 주세요' : '임시 저장됨' };
}
export type ExamQ = { id: string; subject: string; q: string; o: string[] };
/** 시험 시작 (본인) — 풀던 시험이 있으면 그 문제를 그대로 다시 준다 */
export async function examStart(): Promise<R<{ examId: number; qs: ExamQ[] }>> {
  const x = await who(); if (!x || x.lead) return { ok: false, msg: '메타팀 사원만 응시합니다' }; const sb = supabaseAdmin();
  const s = await eduLoad([x.me.id]); if (s.missing) return { ok: false, msg: needSql('meta_edu') }; const row = s.rows.get(x.me.id)!; const st = stageOf(row, s.exams.get(x.me.id)!);
  if (st !== 'exam') return { ok: false, msg: st === 'locked' ? '재시험은 팀장 허락 후에 볼 수 있습니다' : st === 'step1' || st === 'docs' ? '교육자료 5개를 모두 읽은 뒤에 응시할 수 있습니다' : '이미 합격했습니다' };
  let { data: open } = await sb.from('meta_edu_exams').select('id,qs').eq('user_id', x.me.id).is('submitted_at', null).order('id', { ascending: false }).limit(1).maybeSingle();
  if (!open) { const { data, error } = await sb.from('meta_edu_exams').insert({ user_id: x.me.id, qs: drawExam() }).select('id,qs').single(); if (error) return { ok: false, msg: needSql(error.message) }; open = data; if (row.retake_ok) await eduPatch(x.me.id, { retake_ok: false }); }
  const qs = ((open!.qs ?? []) as { id: string; perm: number[] }[]).map(e => { const q = quizOf(e.id)!; return { id: q.id, subject: SUBJECT[q.s], q: q.q, o: e.perm.map(i => q.o[i]) }; });
  return { ok: true, msg: '', examId: open!.id, qs };
}
export type ExamWrong = { subject: string; q: string; mine: string; answer: string; why: string };
/** 시험 제출 — picks[i] = i번째 문제에서 고른 보기 번호 (안 고르면 -1) */
export async function examSubmit(examId: number, picks: number[]): Promise<R<{ score: number; passed: boolean; wrong: ExamWrong[] }>> {
  const x = await who(); if (!x || x.lead) return { ok: false, msg: '메타팀 사원만 응시합니다' }; const sb = supabaseAdmin();
  const { data: ex, error } = await sb.from('meta_edu_exams').select('id,user_id,qs,submitted_at').eq('id', examId).maybeSingle(); if (error) return { ok: false, msg: needSql(error.message) };
  if (!ex || ex.user_id !== x.me.id) return { ok: false, msg: '시험을 찾을 수 없습니다' }; if (ex.submitted_at) return { ok: false, msg: '이미 제출한 시험입니다' };
  const qs = (ex.qs ?? []) as { id: string; perm: number[] }[]; if (qs.some((_, i) => !(Number(picks?.[i]) >= 0))) return { ok: false, msg: '아직 답하지 않은 문제가 있습니다' };
  const wrong: ExamWrong[] = [], wr: { id: string; pick: number }[] = []; let hit = 0;
  qs.forEach((e, i) => { const q = quizOf(e.id); if (!q) { hit++; return; } const orig = e.perm[Number(picks[i])]; if (orig === 0) hit++; else { wr.push({ id: e.id, pick: orig ?? -1 }); wrong.push({ subject: SUBJECT[q.s], q: q.q, mine: q.o[orig] ?? '(선택 안 함)', answer: q.o[0], why: q.why }); } });
  const score = Math.round(hit / qs.length * 100); const passed = score >= PASS_SCORE;
  const { error: e2 } = await sb.from('meta_edu_exams').update({ submitted_at: new Date().toISOString(), score, passed, wrong: wr }).eq('id', examId).is('submitted_at', null); if (e2) return { ok: false, msg: e2.message };
  const ls = await leads(); if (ls.length) await sb.from('notifications').insert(ls.map(user_id => ({ user_id, kind: 'info', title: `${x.me.name} — 3차 시험 ${score}점 (${passed ? '합격' : '불합격'})`, body: passed ? '다음 단계: 영업 스크립트 작성' : '재시험은 팀장 허락이 필요합니다', link: '/meta-edu' })));
  revalidatePath('/meta-edu'); return { ok: true, msg: passed ? `${score}점 — 합격` : `${score}점 — 불합격 (${PASS_SCORE}점 이상 합격)`, score, passed, wrong };
}
