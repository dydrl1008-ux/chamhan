'use client';
import { notify } from '@/components/Toast';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkAttendance } from './actions';
import { nowTimeKST } from '@/lib/date/kst';
export default function CheckCard({ today, checkIn, checkOut, isLate }: { today: string; checkIn: string | null; checkOut: string | null; isLate: boolean }) {
  const [tIn, setTIn] = useState(checkIn ?? '');
  useEffect(() => { if (!checkIn) setTIn(nowTimeKST()); }, [checkIn]); const [tOut, setTOut] = useState(checkOut ?? '18:30');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const r = useRouter();
  async function go(kind: 'in' | 'out') { setBusy(true); const res = await checkAttendance(kind, kind === 'in' ? tIn : tOut); setBusy(false); { notify(res.msg); setMsg(res.msg); }; if (res.ok) r.refresh(); }
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>오늘 ({today}) {checkIn && <span className="pill" style={isLate ? { background: 'var(--bad-soft)', color: 'var(--bad)' } : undefined}>{isLate ? '지각' : '정상 출근'}</span>}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={{ fontSize: 12, color: 'var(--muted)' }}>출근 시각</label><input type="time" value={tIn} onChange={e => setTIn(e.target.value)} disabled={!!checkIn} /><button className="btn" style={{ marginTop: 8, width: '100%' }} disabled={!!checkIn || busy} onClick={() => go('in')}>{checkIn ? `출근 ${checkIn}` : '출근 기록'}</button></div>
        <div><label style={{ fontSize: 12, color: 'var(--muted)' }}>퇴근 시각</label><input type="time" value={tOut} onChange={e => setTOut(e.target.value)} disabled={!checkIn || !!checkOut} /><button className="btn ghost" style={{ marginTop: 8, width: '100%' }} disabled={!checkIn || !!checkOut || busy} onClick={() => go('out')}>{checkOut ? `퇴근 ${checkOut}` : '퇴근 기록'}</button></div>
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.includes('기록됨') ? 'var(--ok)' : 'var(--bad)' }}>{msg}</div>}
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>자리에 앉은 후 실제 시각으로 기록. 출근은 한 번 기록되면 수정 불가(어드민 문의). 지각은 다음날 근태에 '대기'로 자동 생성되어 팀장이 확정합니다.</div>
    </div>
  );
}
