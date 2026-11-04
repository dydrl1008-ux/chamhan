'use client';
// 내 정보 — 네이버 메일 계정 연결. 로그인 확인은 본인 PC 의 SNS_Manager(localhost:5555)가 하고, 확인된 뒤에만 서버에 암호화 저장
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { agentHealth, agentPost } from '@/lib/snsAgent';
import { saveMailAccount } from '@/app/(app)/mail/actions';
export default function MailLink({ linked, email, fromName, verifiedAt }: { linked: boolean; email: string; fromName: string; verifiedAt: string | null }) {
  const r = useRouter(); const [busy, setBusy] = useState(false);
  return (
    <div className="card"><h3 style={{ margin: '0 0 8px', fontSize: 15 }}>네이버 메일 연결 (메일 발송용) {linked && <span className="pill" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>연결됨 · {email}</span>}</h3>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>「메일 발송」 메뉴에서 본인 네이버 계정으로 제안서 메일을 보냅니다. 네이버 2단계 인증 → <b>앱 비밀번호</b>를 발급해 넣으세요 (네이버 메일 환경설정에서 IMAP/SMTP 사용함 체크). 로그인 확인은 본인 PC 의 SNS_Manager 가 하고, 확인된 뒤 암호화 저장됩니다.</div>
      <form action={async fd => {
        const em = String(fd.get('email') || '').trim().toLowerCase(), pw = String(fd.get('app_pw') || '').replace(/\s+/g, ''), fn = String(fd.get('from_name') || '').trim();
        setBusy(true);
        try {
          const h = await agentHealth();
          if (!h.up) { notify('SNS_Manager 가 꺼져 있습니다 — 켜고 다시 시도', 'bad'); return; }
          if (!h.mailWh) { notify('SNS_Manager 구버전 — 메일 기능 있는 새 exe 로 교체 필요', 'bad'); return; }
          const v = await agentPost('/mail/wh-verify', { email: em, password: pw }, 40_000);
          if (!v?.ok) { notify(v?.error || '로그인 실패', 'bad'); return; }
          const x = await saveMailAccount(em, pw, fn); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh();
        } catch { notify('SNS_Manager 에 연결할 수 없음', 'bad'); } finally { setBusy(false); }
      }} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: 8 }}>
        <input name="email" placeholder="아이디@naver.com" defaultValue={email} required /><input name="app_pw" type="password" placeholder="앱 비밀번호" autoComplete="off" required /><input name="from_name" placeholder="보내는 이름 (예: 참한기획 홍길동)" defaultValue={fromName} /><button className="btn" disabled={busy}>{busy ? '확인 중…' : linked ? '다시 연결' : '연결'}</button>
      </form>
      {verifiedAt && <div className="cell-sub" style={{ marginTop: 6 }}>확인 {verifiedAt.slice(0, 16).replace('T', ' ')}</div>}</div>
  );
}
