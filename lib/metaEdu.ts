// 메타팀 교육 — 1차 대면 교육 → 2차 자료 학습 → 3차 시험(80점) → 영업 스크립트 → 팀장 승인(투입). 표는 RLS 로 막고 서버에서만 읽고 쓴다
import { supabaseAdmin } from '@/lib/supabase/admin';
export * from './metaEduShared';
import { emptyEdu as empty, type EduRow, type EduExam } from './metaEduShared';
/** 여러 사람의 교육 상태. 표가 아직 없으면(0101 SQL 전) missing = true */
export async function eduLoad(ids: string[]): Promise<{ rows: Map<string, EduRow>; exams: Map<string, EduExam[]>; missing: boolean }> {
  const rows = new Map<string, EduRow>(ids.map(i => [i, empty(i)])); const exams = new Map<string, EduExam[]>(ids.map(i => [i, []])); if (!ids.length) return { rows, exams, missing: false };
  const sb = supabaseAdmin(); const { data, error } = await sb.from('meta_edu').select('user_id,step1_at,docs,retake_ok,script,script_at,script_back,deployed_at').in('user_id', ids); if (error) return { rows, exams, missing: true };
  for (const r of data ?? []) rows.set(r.user_id, { ...(r as any), docs: (r as any).docs ?? {} });
  const { data: ex } = await sb.from('meta_edu_exams').select('id,user_id,started_at,submitted_at,score,passed,wrong').in('user_id', ids).order('id').limit(5000);
  for (const e of ex ?? []) exams.get(e.user_id)?.push(e as EduExam);
  return { rows, exams, missing: false };
}
/** 투입됐나 — 팀장 · 총괄은 항상. 사원은 팀장이 투입 승인한 뒤부터. (0101 SQL 전에는 막지 않는다) */
export async function metaDeployed(p: { id: string; role: string }): Promise<boolean> {
  if (p.role !== 'staff') return true; const { data, error } = await supabaseAdmin().from('meta_edu').select('deployed_at').eq('user_id', p.id).maybeSingle(); return error ? true : !!data?.deployed_at;
}
export async function eduPatch(userId: string, patch: Record<string, unknown>) {
  return supabaseAdmin().from('meta_edu').upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}
