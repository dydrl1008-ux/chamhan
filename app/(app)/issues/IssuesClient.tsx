'use client';
import { notify } from '@/components/Toast';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addIssue, markRead } from './actions';
import type { Profile } from '@/lib/auth/session';
type I = { id: number; issue_date: string; title: string; body: string | null; customer_notice: string | null; author_id: string | null };
export default function IssuesClient({ me, today, issues, reads, people, total }: { me: Profile; today: string; issues: I[]; reads: { issue_id: number; user_id: string }[]; people: { id: string; name: string }[]; total: number }) {
  const r = useRouter(); const [msg, setMsg] = useState('');
  const canWrite = me.role === 'admin' || me.role === 'head';
  const canSeeAll = canWrite;
  const nm = (id: string | null) => people.find(p => p.id === id)?.name ?? '-';
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>금일 이슈 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>매일 고객 안내용 · 총책임자 등록</span></h1>
      {canWrite && <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>이슈 등록</h3>
        <form action={async fd => { const x = await addIssue(fd); { notify(x.msg); setMsg(x.msg); }; if (x.ok) { (document.getElementById('issueForm') as HTMLFormElement)?.reset(); r.refresh(); } }} id="issueForm" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}><input type="date" name="issue_date" defaultValue={today} /><input name="title" placeholder="제목 (예: 네이버 순위 반영 지연)" required /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><textarea name="body" rows={4} placeholder="내용 (내부 공유)" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, font: 'inherit' }} /><textarea name="customer_notice" rows={4} placeholder="고객 안내 문구 (그대로 복사해 발송)" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, font: 'inherit' }} /></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button className="btn">등록</button>{msg && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{msg}</span>}</div>
        </form></div>}
      {issues.map(i => { const rd = reads.filter(x => x.issue_id === i.id); const mine = rd.some(x => x.user_id === me.id); return (
        <div key={i.id} className="card" style={{ borderLeft: i.issue_date === today ? '4px solid var(--accent)' : undefined }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15, display: 'flex', justifyContent: 'space-between' }}><span>{i.title}</span><span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{i.issue_date} · {nm(i.author_id)}{canSeeAll && ` · 읽음 ${rd.length}/${total}`}</span></h3>
          {i.body && <p style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{i.body}</p>}
          {i.customer_notice && <div style={{ background: 'var(--accent-soft)', borderLeft: '3px solid var(--accent)', padding: '10px 14px', borderRadius: '0 10px 10px 0' }}><b style={{ display: 'block', marginBottom: 4 }}>고객 안내 문구</b><div style={{ whiteSpace: 'pre-wrap' }}>{i.customer_notice}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}><button className="btn ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(i.customer_notice!); notify('안내 문구 복사됨'); }}>문구 복사</button>{!mine ? <button className="btn" style={{ padding: '5px 10px', fontSize: 12 }} onClick={async () => { await markRead(i.id); r.refresh(); }}>읽음 처리</button> : <span className="pill" style={{ background: '#E7F7EC', color: 'var(--ok)' }}>읽음</span>}</div></div>}
          {!i.customer_notice && (!mine ? <button className="btn" style={{ padding: '5px 10px', fontSize: 12 }} onClick={async () => { await markRead(i.id); r.refresh(); }}>읽음 처리</button> : <span className="pill" style={{ background: '#E7F7EC', color: 'var(--ok)' }}>읽음</span>)}
        </div>); })}
      {issues.length === 0 && <div className="card" style={{ color: 'var(--muted)' }}>등록된 이슈가 없습니다.</div>}
    </div>
  );
}
