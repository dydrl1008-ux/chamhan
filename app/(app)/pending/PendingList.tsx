'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { dismissPending, doCancel } from './actions';
import ApproveModal from './ApproveModal';
import { fmtKST, won } from '@/lib/date/kst';
type P = { item_key: string; settle_no: string | null; empl_id: string | null; empl_name: string | null; cust_name: string | null; prod_name: string | null; req_gubun: string | null; amount: number; req_date: string | null; status: string | null; first_seen: string; dismissed_at: string | null };
export default function PendingList({ open, dismissed }: { open: P[]; dismissed: P[] }) {
  const r = useRouter(); const [sel, setSel] = useState<Set<string>>(new Set()); const [showDis, setShowDis] = useState(false); const [appr, setAppr] = useState<string | null>(null);
  const toggle = (k: string) => setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const act = async (keys: string[], dismiss: boolean) => { const x = await dismissPending(keys, dismiss); notify(x.msg); setSel(new Set()); r.refresh(); };
  const Row = ({ p, dis }: { p: P; dis?: boolean }) => <tr key={p.item_key} style={{ opacity: dis ? .6 : 1 }}>
    {!dis && <td><input type="checkbox" checked={sel.has(p.item_key)} onChange={() => toggle(p.item_key)} style={{ width: 16, height: 16 }} /></td>}
    <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12.5 }}>{p.settle_no}</td><td>{p.req_date}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtKST(p.first_seen)}</td><td><b>{p.empl_name}</b> <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.empl_id}</span></td><td>{p.cust_name}</td><td>{p.prod_name}</td><td>{p.req_gubun}</td><td style={{ textAlign: 'right', color: p.amount < 0 ? 'var(--bad)' : 'inherit' }}>{won(p.amount)}</td>
    <td style={{ whiteSpace: 'nowrap' }}>{dis ? <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => act([p.item_key], false)}>복원</button> : <><button className="btn" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => setAppr(p.settle_no ?? '')}>승인</button> <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => act([p.item_key], true)}>알림 해제</button></>}</td></tr>;
  const head = (dis?: boolean) => <thead><tr>{!dis && <th><input type="checkbox" checked={open.length > 0 && sel.size === open.length} onChange={e => setSel(e.target.checked ? new Set(open.map(p => p.item_key)) : new Set())} style={{ width: 16, height: 16 }} /></th>}<th>정산번호</th><th>요청일</th><th>들어온 시각</th><th>담당자</th><th>고객</th><th>상품</th><th>구분</th><th style={{ textAlign: 'right' }}>영업이익</th><th></th></tr></thead>;
  return <>
    {appr && <ApproveModal settlementSeq={appr} onClose={() => setAppr(null)} />}
    <div className="card">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 600 }}>대기 {open.length}건</span>{sel.size > 0 && <button className="btn" style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={() => { if (confirm(`${sel.size}건 알림 해제할까요? 목록·배지에서 빠지고, 정산 사이트에서 승인되면 처리됨으로 정리됩니다.`)) act([...sel], true); }}>선택 {sel.size}건 알림 해제</button>}<span style={{ fontSize: 12, color: 'var(--muted)' }}>승인 = 정산 사이트에 바로 반영 (입금금액 확인 후). 안 할 건은 알림 해제.</span></div>
      <div style={{ overflowX: 'auto' }}><table>{head()}<tbody>{open.map(p => <Row key={p.item_key} p={p} />)}{open.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>대기 중인 승인요청 없음</td></tr>}</tbody></table></div>
    </div>
    {dismissed.length > 0 && <div className="card"><button className="btn ghost" style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={() => setShowDis(!showDis)}>{showDis ? '알림 해제 목록 접기' : `알림 해제한 건 ${dismissed.length}개 보기`}</button>
      {showDis && <div style={{ overflowX: 'auto', marginTop: 10 }}><table>{head(true)}<tbody>{dismissed.map(p => <Row key={p.item_key} p={p} dis />)}</tbody></table></div>}</div>}
  </>;
}
