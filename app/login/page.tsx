'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
export default function Login() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) return setErr('이메일 또는 비밀번호가 올바르지 않습니다.');
    router.replace('/'); router.refresh();
  }
  return (
    <main style={{ maxWidth: 380, margin: '90px auto' }}>
      <div className="card">
        <h1 style={{ fontSize: 20, margin: '0 0 16px' }}>워크허브 로그인</h1>
        <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          <input type="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="비밀번호" value={pw} onChange={e => setPw(e.target.value)} required />
          {err && <div className="err">{err}</div>}
          <button className="btn" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>계정은 관리자가 초대합니다. 비밀번호를 잊으면 관리자에게 재발급을 요청하세요.</p>
      </div>
    </main>
  );
}
