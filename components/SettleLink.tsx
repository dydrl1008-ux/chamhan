'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { linkAccount } from '@/app/(app)/settle-request/actions';
export default function SettleLink({ linked, settleId, verifiedAt, lastError }: { linked: boolean; settleId: string; verifiedAt: string | null; lastError: string | null }) {
  const r = useRouter(); const [busy, setBusy] = useState(false);
  return (
    <div className="card"><h3 style={{ margin: '0 0 8px', fontSize: 15 }}>정산 사이트 계정 연결 {linked && <span className="pill" style={lastError ? { background: 'var(--bad-soft)', color: 'var(--bad)' } : { background: 'var(--ok-soft)', color: 'var(--ok)' }}>{lastError ? '로그인 실패' : `연결됨 · ${settleId}`}</span>}</h3>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>연결하면 워크허브 '정산요청' 메뉴에서 본인 계정으로 정산 사이트에 요청을 넣을 수 있습니다. 비밀번호는 암호화 저장되며 로그인 확인 후에만 저장됩니다.{lastError && <div style={{ color: 'var(--bad)', marginTop: 4 }}>{lastError}</div>}</div>
      <form action={async fd => { setBusy(true); const x = await linkAccount(fd); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
        <input name="settle_user_id" placeholder="정산 사이트 아이디" defaultValue={settleId} required /><input name="settle_pw" type="password" placeholder="정산 사이트 비밀번호" autoComplete="off" required /><button className="btn" disabled={busy}>{busy ? '확인 중…' : linked ? '다시 연결' : '연결'}</button>
      </form></div>
  );
}
