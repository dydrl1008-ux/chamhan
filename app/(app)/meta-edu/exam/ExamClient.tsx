'use client';
import { useState } from 'react';
import Link from 'next/link';
import { notify } from '@/components/Toast';
import { examSubmit, type ExamQ, type ExamWrong } from '../actions';
export default function ExamClient({ examId, qs }: { examId: number; qs: ExamQ[] }) {
  const [picks, setPicks] = useState<number[]>(() => qs.map(() => -1)); const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ score: number; passed: boolean; wrong: ExamWrong[] } | null>(null);
  const left = picks.filter(p => p < 0).length;
  const submit = async () => { if (left) { notify(`아직 ${left}문제를 고르지 않았습니다`, 'bad'); return; } setBusy(true); const r = await examSubmit(examId, picks); setBusy(false); if (!r.ok) { notify(r.msg, 'bad'); return; } setRes({ score: r.score, passed: r.passed, wrong: r.wrong }); window.scrollTo({ top: 0 }); };
  if (res) return <div style={{ maxWidth: 820 }}>
    <div className="card" style={{ marginBottom: 12, background: res.passed ? '#ECFDF3' : '#FEF3F2' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: res.passed ? '#067647' : '#B42318' }}>{res.score}점 — {res.passed ? '합격' : '불합격'}</div>
      <div style={{ fontSize: 13.5, marginTop: 4 }}>{res.passed ? '다음 단계: 영업 스크립트를 작성해 팀장에게 제출합니다.' : '틀린 문제를 교육자료에서 다시 확인하고, 팀장에게 재시험 허락을 받아 주세요.'}</div>
      <div style={{ marginTop: 10 }}><Link href="/meta-edu" className="btn">교육으로 돌아가기</Link></div>
    </div>
    {res.wrong.map((w, i) => <div key={i} className="card" style={{ marginBottom: 8, fontSize: 13.5, lineHeight: 1.6 }}><div><b>[{w.subject}]</b> {w.q}</div><div style={{ color: '#B42318' }}>내 답: {w.mine}</div><div style={{ color: '#067647' }}>정답: {w.answer}</div><div style={{ color: '#475467' }}>{w.why}</div></div>)}
  </div>;
  return <div style={{ maxWidth: 820 }}>
    {qs.map((q, i) => <div key={q.id} className="card" style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, color: '#667085' }}>{i + 1} / {qs.length} · {q.subject}</div>
      <div style={{ fontWeight: 700, fontSize: 15, margin: '4px 0 10px', lineHeight: 1.5 }}>{q.q}</div>
      {q.o.map((o, j) => <label key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 6, border: '1px solid ' + (picks[i] === j ? '#175CD3' : '#EAECF0'), background: picks[i] === j ? '#F5F8FF' : '#fff', marginBottom: 6, cursor: 'pointer', fontSize: 14, lineHeight: 1.5 }}>
        <input type="radio" name={q.id} checked={picks[i] === j} onChange={() => setPicks(p => p.map((v, k) => k === i ? j : v))} style={{ marginTop: 4 }} /><span>{o}</span></label>)}
    </div>)}
    <div className="card" style={{ position: 'sticky', bottom: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 13.5 }}>{left ? `남은 문제 ${left}개` : '모두 골랐습니다'}</span><span style={{ flex: 1 }} /><button className="btn" disabled={busy} onClick={submit}>{busy ? '채점 중…' : '제출'}</button>
    </div>
  </div>;
}
