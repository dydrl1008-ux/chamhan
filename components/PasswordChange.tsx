'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { notify } from '@/components/Toast';
export default function PasswordChange() {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return notify('비밀번호는 8자 이상이어야 합니다', 'bad');
    if (pw !== pw2) return notify('두 비밀번호가 다릅니다', 'bad');
    setBusy(true); const { error } = await supabaseBrowser().auth.updateUser({ password: pw }); setBusy(false);
    if (error) return notify('변경 실패: ' + error.message, 'bad');
    setPw(''); setPw2(''); notify('비밀번호가 변경되었습니다');
  }
  return (
    <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>비밀번호 변경</h3>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
        <input type="password" placeholder="새 비밀번호 (8자 이상)" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" required />
        <input type="password" placeholder="새 비밀번호 확인" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" required />
        <button className="btn" disabled={busy}>{busy ? '변경 중…' : '변경'}</button>
      </form>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>초대받은 임시 비밀번호는 첫 로그인 후 여기서 바꾸세요. 잊어버리면 어드민에게 재발급 요청.</div>
    </div>
  );
}
