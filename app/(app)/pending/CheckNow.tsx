'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { checkNow } from './actions';
export default function CheckNow() { const r = useRouter(); const [busy, setBusy] = useState(false);
  return <button className="btn ghost" style={{ padding: '5px 12px', fontSize: 12.5 }} disabled={busy} onClick={async () => { setBusy(true); const x = await checkNow(); setBusy(false); notify(x.msg); r.refresh(); }}>{busy ? '확인 중…' : '지금 확인'}</button>; }
