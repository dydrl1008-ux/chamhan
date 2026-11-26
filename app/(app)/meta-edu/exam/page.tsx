// 메타팀 3차 시험 — 사원만 응시. 20문제 · 80점 이상 합격
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { metaAccess } from '@/lib/meta';
import { PageHeader } from '@/components/ui';
import { examStart } from '../actions';
import ExamClient from './ExamClient';
export const dynamic = 'force-dynamic';
export default async function ExamPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const a = await metaAccess(me); if (!a.ok) redirect('/'); if (a.lead) redirect('/meta-edu/bank');
  const r = await examStart(); if (!r.ok) return <><PageHeader title="3차 시험" /><div className="card">{r.msg} — <a href="/meta-edu" style={{ color: '#175CD3' }}>교육으로 돌아가기</a></div></>;
  return <><PageHeader title="3차 시험" desc="객관식 20문제 · 문제당 5점 · 80점 이상 합격. 모두 고른 뒤 맨 아래 「제출」을 누릅니다" /><ExamClient examId={r.examId} qs={r.qs} /></>;
}
