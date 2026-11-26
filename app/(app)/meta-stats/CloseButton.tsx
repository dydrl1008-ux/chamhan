'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { metaClose } from '../meta-db/payActions';
export default function CloseButton({ month, closed }: { month: string; closed: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(false);
  const run = async () => { setBusy(true); const r = await metaClose(month, !closed); setBusy(false); setAsk(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) router.refresh(); };
  if (!ask) return <button className={closed ? 'btn ghost' : 'btn'} onClick={() => setAsk(true)}>{closed ? '마감 취소' : '이 달 마감'}</button>;
  return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span style={{ fontSize: 12.5 }}>{closed ? '마감을 풀까요?' : '광고비까지 넣었나요? 지금 숫자로 고정됩니다'}</span><button className="btn" disabled={busy} onClick={run}>{closed ? '풀기' : '마감'}</button><button className="btn ghost" onClick={() => setAsk(false)}>아니오</button></span>;
}
