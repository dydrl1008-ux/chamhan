'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { checkAttendance } from './actions';
import { nowTimeKST } from '@/lib/date/kst';
export default function CheckCard({ today, checkIn, checkOut, isLate }: { today: string; checkIn: string | null; checkOut: string | null; isLate: boolean }) {
  const [now, setNow] = useState(''); const [busy, setBusy] = useState(false); const r = useRouter();
  useEffect(() => { setNow(nowTimeKST()); const t = setInterval(() => setNow(nowTimeKST()), 1000); return () => clearInterval(t); }, []);
  async function go(kind: 'in' | 'out') { setBusy(true); const res = await checkAttendance(kind); setBusy(false); notify(res.msg); if (res.ok) r.refresh(); }
  const box = (label: string, val: string | null, live: boolean) => <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', background: 'var(--bg)' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div><div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: val ? 'var(--ink)' : live ? 'var(--accent)' : 'var(--muted)' }}>{val ?? (live ? now || '--:--' : '--:--')}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{val ? '기록됨' : live ? '현재 시각 (기록 시 이 시각으로 저장)' : '출근 후 가능'}</div></div>;
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>오늘 ({today}) {checkIn && <span className="pill" style={isLate ? { background: 'var(--bad-soft)', color: 'var(--bad)' } : undefined}>{isLate ? '지각' : '정상 출근'}</span>}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>{box('출근 시각', checkIn, !checkIn)}<button className="btn" style={{ marginTop: 8, width: '100%' }} disabled={!!checkIn || busy} onClick={() => go('in')}>{checkIn ? `출근 ${checkIn}` : '출근 기록'}</button></div>
        <div>{box('퇴근 시각', checkOut, !!checkIn && !checkOut)}<button className="btn ghost" style={{ marginTop: 8, width: '100%' }} disabled={!checkIn || !!checkOut || busy} onClick={() => go('out')}>{checkOut ? `퇴근 ${checkOut}` : '퇴근 기록'}</button></div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>시각은 버튼 누르는 순간의 서버 시간으로 고정되며 수정할 수 없습니다. 잘못 눌렀으면 아래 수정 요청 → 총괄 승인.</div>
    </div>
  );
}
