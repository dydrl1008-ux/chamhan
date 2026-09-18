'use client';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { doCancel } from './actions';
export default function CancelBtn({ settlementSeq }: { settlementSeq: string }) { const r = useRouter();
  return <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11, marginLeft: 6 }} onClick={async () => { if (!confirm(`${settlementSeq} 승인취소 하시겠습니까? 정산 사이트에 즉시 반영됩니다. (급여 처리된 건은 거부됨)`)) return; const x = await doCancel(settlementSeq); notify(x.msg, x.ok ? 'ok' : 'bad'); r.refresh(); }}>승인취소</button>; }
