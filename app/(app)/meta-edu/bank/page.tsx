// 시험 문제은행 — 메타팀 팀장 · 총괄만. 문제를 고치려면 lib/metaEduQuiz.ts
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getProfile } from '@/lib/auth/session';
import { metaAccess } from '@/lib/meta';
import { PageHeader } from '@/components/ui';
import { BANK, SUBJECT, PICK, MUST, type Quiz } from '@/lib/metaEduQuiz';
export default async function BankPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const a = await metaAccess(me); if (!a.lead) redirect(a.ok ? '/meta-edu' : '/');
  return <>
    <PageHeader title="시험 문제은행" desc={`전체 ${BANK.length}문제 · 한 번에 20문제(문제당 5점) 무작위 출제 · ★ 는 「하면 안 되는 말」 문제로 과목마다 반드시 포함`} actions={<Link href="/meta-edu" className="btn ghost">← 교육 관리</Link>} />
    {(Object.keys(SUBJECT) as Quiz['s'][]).map(s => { const list = BANK.filter(q => q.s === s); return <div key={s} style={{ marginBottom: 18, maxWidth: 900 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{SUBJECT[s]} <span style={{ fontSize: 13, color: '#667085', fontWeight: 400 }}>{list.length}문제 중 {PICK[s]}문제 출제{MUST[s] ? ` (★ ${MUST[s]}문제 포함)` : ''}</span></h2>
      {list.map(q => <div key={q.id} className="card" style={{ marginBottom: 8, fontSize: 13.5, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700 }}>{q.must && <span style={{ color: '#B42318' }}>★ </span>}{q.q}</div>
        {q.o.map((o, i) => <div key={i} style={{ color: i === 0 ? '#067647' : '#475467', fontWeight: i === 0 ? 700 : 400 }}>{i === 0 ? '○ ' : '· '}{o}</div>)}
        <div style={{ color: '#667085', marginTop: 4 }}>해설: {q.why}</div></div>)}
    </div>; })}
  </>;
}
