'use client';
import { useState } from 'react';
import { submitUnsub } from './actions';
export default function UnsubForm() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState('');
  if (done) return <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 19, fontWeight: 800, color: '#0F172A' }}>수신거부 처리되었습니다</div>
    <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, margin: '10px 0 0' }}><b style={{ color: '#0F172A' }}>{done}</b><br />앞으로 이 주소로 안내 메일을 보내지 않습니다.</p>
    <button type="button" onClick={() => { setDone(''); setEmail(''); }} style={{ marginTop: 18, background: 'none', border: 0, color: '#64748B', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>다른 주소도 신청하기</button>
  </div>;
  return <form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setErr(''); const r = await submitUnsub(email); setBusy(false); if (r.ok) setDone(email.trim().toLowerCase()); else setErr(r.msg); }} style={{ display: 'grid', gap: 12 }}>
    <div style={{ fontSize: 19, fontWeight: 800, color: '#0F172A' }}>메일 수신거부</div>
    <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.7, margin: 0 }}>메일을 받으신 주소를 적어 주시면, 그 주소로는 더 이상 안내 메일을 보내지 않습니다.</p>
    <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com"
      style={{ padding: '13px 14px', fontSize: 16, border: '1px solid #CBD5E1', borderRadius: 10, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
    {err && <div style={{ color: '#B42318', fontSize: 13 }}>{err}</div>}
    <button disabled={busy} style={{ padding: '13px 14px', fontSize: 15, fontWeight: 700, color: '#fff', background: busy ? '#94A3B8' : '#0F2A4A', border: 0, borderRadius: 10, cursor: busy ? 'default' : 'pointer' }}>{busy ? '처리 중…' : '수신거부 신청'}</button>
  </form>;
}
