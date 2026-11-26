// 메타팀 교육 — 1차 대면 교육 → 2차 자료 학습 → 3차 시험(80점) → 영업 스크립트 → 팀장 승인(투입). 사원: 내 진행 상황 / 팀장 · 총괄: 사람별 진행 관리
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { metaAccess, metaTeamId } from '@/lib/meta';
import { eduLoad, stageOf, EDU_DOCS } from '@/lib/metaEdu';
import { quizOf, SUBJECT } from '@/lib/metaEduQuiz';
import { PageHeader } from '@/components/ui';
import { EduMine, EduBoard, type BoardRow } from './EduClient';
export const dynamic = 'force-dynamic';
export default async function MetaEduPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const a = await metaAccess(me); if (!a.ok) redirect('/');
  if (!a.lead) {
    const s = await eduLoad([me.id]); const row = s.rows.get(me.id)!; const exams = s.exams.get(me.id)!; const last = [...exams].reverse().find(e => e.submitted_at);
    const wrong = (last?.wrong ?? []).map(w => { const q = quizOf(w.id); return q ? { subject: SUBJECT[q.s], q: q.q, mine: q.o[w.pick] ?? '', answer: q.o[0], why: q.why } : null; }).filter(Boolean) as any[];
    return <>
      <PageHeader title="교육" desc="1차 교육 → 교육자료 → 시험(80점 이상) → 영업 스크립트 → 팀장 승인 순서로 진행하고, 승인되면 인바운드 DB 가 배정됩니다" />
      {s.missing ? <div className="card" style={{ color: '#B42318' }}>0101 SQL(메타팀 교육 표)을 먼저 실행해 주세요</div>
        : <EduMine stage={stageOf(row, exams)} row={row} exams={exams.filter(e => e.submitted_at).map(e => ({ at: e.submitted_at!, score: e.score ?? 0, passed: !!e.passed }))} wrong={wrong} lastPassed={!!last?.passed} />}
    </>;
  }
  const tid = await metaTeamId(); const { data: ppl } = tid == null ? { data: [] as any[] } : await supabaseAdmin().from('profiles').select('id,name').eq('team_id', tid).eq('role', 'staff').eq('is_active', true).order('name');
  const ids = (ppl ?? []).map((p: any) => p.id); const s = await eduLoad(ids);
  const rows: BoardRow[] = (ppl ?? []).map((p: any) => { const row = s.rows.get(p.id)!; const ex = (s.exams.get(p.id) ?? []).filter(e => e.submitted_at);
    return { id: p.id, name: p.name, stage: stageOf(row, s.exams.get(p.id) ?? []), step1: !!row.step1_at, docs: EDU_DOCS.filter(d => row.docs?.[d.slug]).length, tries: ex.length, best: ex.length ? Math.max(...ex.map(e => e.score ?? 0)) : null, lastScore: ex.length ? ex[ex.length - 1].score : null, script: row.script, scriptAt: row.script_at, scriptBack: row.script_back, deployedAt: row.deployed_at }; });
  // 자주 틀리는 문제 (전체 응시 기준)
  const miss = new Map<string, number>(); for (const list of s.exams.values()) for (const e of list) for (const w of e.wrong ?? []) miss.set(w.id, (miss.get(w.id) ?? 0) + 1);
  const hard = [...miss].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([id, n]) => { const q = quizOf(id); return q ? { subject: SUBJECT[q.s], q: q.q, n } : null; }).filter(Boolean) as any[];
  return <>
    <PageHeader title="교육 관리" desc="메타팀 사원의 교육 진행 — 1차 완료 체크, 재시험 허락, 스크립트 확인 후 투입 승인. 투입 승인 전에는 인바운드 DB 가 배정되지 않습니다" />
    {s.missing && <div className="card" style={{ color: '#B42318', marginBottom: 12 }}>0101 SQL(메타팀 교육 표)을 먼저 실행해 주세요</div>}
    <EduBoard rows={rows} hard={hard} docs={EDU_DOCS.map(d => ({ slug: d.slug, title: d.title }))} />
  </>;
}
