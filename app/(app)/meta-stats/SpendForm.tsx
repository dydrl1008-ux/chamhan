'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { mdSpend } from '../meta-db/actions';
export default function SpendForm({ month, amount }: { month: string; amount: number }) {
  const router = useRouter(); const [v, setV] = useState(amount ? amount.toLocaleString() : ''); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); const r = await mdSpend(month, Number(v.replace(/[^\d]/g, '')) || 0); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) router.refresh(); };
  return <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <b style={{ fontSize: 13 }}>이 달 광고비</b>
    <input value={v} onChange={e => setV(e.target.value)} inputMode="numeric" placeholder="예: 5,000,000" style={{ border: '1px solid #D0D5DD', borderRadius: 6, padding: '6px 8px', fontSize: 13, width: 160, textAlign: 'right' }} />
    <span style={{ fontSize: 13 }}>원</span><button className="btn" disabled={busy} onClick={save}>저장</button>
    <span style={{ fontSize: 12.5, color: '#667085' }}>총괄 · 어드민만 입력 (팀장에겐 결과만 보임)</span>
  </div>;
}
