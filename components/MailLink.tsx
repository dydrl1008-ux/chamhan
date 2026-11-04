'use client';
// 내 정보 — 메일 계정 연결(네이버·지메일, 여러 개). 로그인 확인은 본인 PC 의 SNS_Manager(localhost:5555)가 하고, 확인된 뒤에만 서버에 암호화 저장
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { agentHealth, agentPost } from '@/lib/snsAgent';
import { saveMailAccount, deleteMailAccount } from '@/app/(app)/mail/actions';
type A = { id: number; email: string; provider: string; from_name: string; verified_at: string | null };
export default function MailLink({ accounts }: { accounts: A[] }) {
  const r = useRouter(); const [busy, setBusy] = useState(false);
  return (
    <div className="card"><h3 style={{ margin: '0 0 8px', fontSize: 15 }}>메일 계정 연결 (메일 발송용) {accounts.length > 0 && <span className="pill" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>{accounts.length}개 연결됨</span>}</h3>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>「메일 발송」 메뉴에서 본인 계정으로 제안서 메일을 보냅니다. 네이버·지메일 여러 개 등록 가능(계정당 하루 상한, 하나 다 쓰면 다른 계정). 2단계 인증 → <b>앱 비밀번호</b> 발급해 넣으세요 (네이버는 메일 환경설정에서 IMAP/SMTP 사용함 체크). 로그인 확인은 본인 PC 의 SNS_Manager 가 하고, 확인된 뒤 암호화 저장됩니다.</div>
      {accounts.length > 0 && <table style={{ fontSize: 13, marginBottom: 10 }}><tbody>{accounts.map(a => <tr key={a.id}><td>{a.email}</td><td className="cell-sub">{a.provider === 'gmail' ? '지메일' : '네이버'} · {a.from_name}</td><td className="cell-sub">{a.verified_at ? '확인 ' + a.verified_at.slice(0, 16).replace('T', ' ') : '미확인'}</td><td style={{ textAlign: 'right' }}><button type="button" className="btn ghost xs" disabled={busy} onClick={async () => { if (!confirm(`${a.email} 삭제?`)) return; const x = await deleteMailAccount(a.id); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); }}>삭제</button></td></tr>)}</tbody></table>}
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
        <input name="email" placeholder="아이디@naver.com 또는 @gmail.com" required /><input name="app_pw" type="password" placeholder="앱 비밀번호" autoComplete="off" required /><input name="from_name" placeholder="보내는 이름 (예: 참한기획 홍길동)" /><button className="btn" disabled={busy}>{busy ? '확인 중…' : '계정 추가'}</button>
      </form></div>
  );
}
