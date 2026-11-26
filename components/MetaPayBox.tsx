'use client';
// 메타 결제 내역 창 — 1차 · 2차 · 3차 … 결제를 쌓는다 (VAT 제외). 내 DB · 인바운드 DB 에서 같이 쓴다
import { useEffect, useState } from 'react';
import { notify } from '@/components/Toast';
import { mpList, mpAdd, mpCancel, type MetaPay } from '@/app/(app)/meta-db/payActions';
const won = (n: number) => Math.round(n || 0).toLocaleString('ko-KR'); const num = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0;
export default function MetaPayBox({ leadId, today, onClose, onChanged }: { leadId: number; today: string; onClose: () => void; onChanged: (sum: { amt: number | null; cost: number | null; paid: boolean }) => void }) {
  const [rows, setRows] = useState<MetaPay[] | null>(null); const [canAdd, setCanAdd] = useState(false); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ kind: '결제', paid_on: today, amount: '', cost: '', product: '', memo: '' });
  const load = async (tell = false) => { const r = await mpList(leadId); if (!r.ok) { notify(r.msg, 'bad'); setRows([]); return; } setRows(r.rows); setName(r.name); setCanAdd(r.canAdd); setF(x => ({ ...x, product: x.product || r.product }));
    if (tell) { const live = r.rows.filter(p => !p.canceled_at); onChanged({ amt: live.length ? live.reduce((s, p) => s + p.amount, 0) : null, cost: live.length ? live.reduce((s, p) => s + p.cost, 0) : null, paid: live.some(p => p.kind === '결제') }); } };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId]);
  const add = async () => { if (busy) return; setBusy(true); const r = await mpAdd(leadId, { kind: f.kind, paid_on: f.paid_on, amount: num(f.amount), cost: num(f.cost), product: f.product, memo: f.memo }); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { setF(x => ({ ...x, amount: '', cost: '', memo: '' })); await load(true); } };
  const cancel = async (id: number) => { if (busy) return; setBusy(true); const r = await mpCancel(id); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) await load(true); };
  const live = (rows ?? []).filter(p => !p.canceled_at); const amt = live.reduce((s, p) => s + p.amount, 0), cost = live.reduce((s, p) => s + p.cost, 0); let nth = 0;
  const inp: React.CSSProperties = { border: '1px solid #D0D5DD', borderRadius: 6, padding: '6px 8px', fontSize: 13, background: '#fff' }; const td: React.CSSProperties = { padding: '7px 8px', whiteSpace: 'nowrap' };
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.45)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 16 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 18, width: 'min(760px, 100%)', maxHeight: '88vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><b style={{ fontSize: 16 }}>결제 내역 — {name}</b><span style={{ fontSize: 12.5, color: '#667085' }}>금액은 VAT 제외</span><span style={{ flex: 1 }} /><button className="btn ghost" onClick={onClose}>닫기</button></div>
      {rows == null ? <div style={{ padding: 20, color: '#98A2B3' }}>불러오는 중…</div> : <>
        <div style={{ overflowX: 'auto', border: '1px solid #EAECF0', borderRadius: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F9FAFB', color: '#475467', fontSize: 12.5, textAlign: 'left' }}>{['차수', '결제일', '금액', '상품비', '마진', '상품 · 메모', '입력', ''].map(h => <th key={h} style={td}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(p => { const off = !!p.canceled_at; const label = off ? '취소됨' : p.kind === '환불' ? '환불' : p.kind === '사용' ? '킵 사용' : `${++nth}차`; return <tr key={p.id} style={{ borderTop: '1px solid #EAECF0', opacity: off ? .45 : 1, textDecoration: off ? 'line-through' : undefined }}>
            <td style={{ ...td, fontWeight: 700, color: p.kind === '환불' ? '#B42318' : undefined }}>{label}</td><td style={td}>{p.paid_on.slice(5).replace('-', '/')}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{won(p.amount)}</td><td style={{ ...td, textAlign: 'right' }}>{won(p.cost)}</td><td style={{ ...td, textAlign: 'right', color: '#067647' }}>{won(p.amount - p.cost)}</td>
            <td style={{ ...td, whiteSpace: 'normal' }}>{[p.product, p.memo].filter(Boolean).join(' · ')}</td><td style={{ ...td, color: '#98A2B3', fontSize: 12 }}>{p.by}</td><td style={td}>{!off && canAdd && <button className="btn ghost" disabled={busy} style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => cancel(p.id)}>취소</button>}</td></tr>; })}
            {!rows.length && <tr><td colSpan={8} style={{ padding: 18, textAlign: 'center', color: '#98A2B3' }}>아직 결제 내역이 없습니다</td></tr>}
            {live.length > 0 && <tr style={{ borderTop: '1px solid #EAECF0', background: '#F9FAFB', fontWeight: 700 }}><td style={td} colSpan={2}>누적</td><td style={{ ...td, textAlign: 'right' }}>{won(amt)}</td><td style={{ ...td, textAlign: 'right' }}>{won(cost)}</td><td style={{ ...td, textAlign: 'right', color: '#067647' }}>{won(amt - cost)}</td><td colSpan={3} /></tr>}
          </tbody></table></div>
        {canAdd ? <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option>결제</option><option>환불</option></select>
          <input type="date" style={inp} max={today} value={f.paid_on} onChange={e => setF({ ...f, paid_on: e.target.value })} />
          <input style={{ ...inp, width: 120, textAlign: 'right' }} inputMode="numeric" placeholder={f.kind === '환불' ? '환불 금액' : '결제 금액'} value={f.amount} onChange={e => setF({ ...f, amount: num(e.target.value) ? num(e.target.value).toLocaleString() : '' })} />
          <input style={{ ...inp, width: 110, textAlign: 'right' }} inputMode="numeric" placeholder={f.kind === '환불' ? '돌려받는 상품비' : '상품비'} value={f.cost} onChange={e => setF({ ...f, cost: num(e.target.value) ? num(e.target.value).toLocaleString() : '' })} />
          <input style={{ ...inp, width: 110 }} placeholder="상품" value={f.product} onChange={e => setF({ ...f, product: e.target.value })} />
          <input style={{ ...inp, flex: '1 1 140px' }} placeholder="메모 (예: 10일 연장)" value={f.memo} onChange={e => setF({ ...f, memo: e.target.value })} />
          <button className="btn" disabled={busy} onClick={add}>{f.kind === '환불' ? '환불 기록' : `+ ${live.filter(p => p.kind === '결제').length + 1}차 결제 추가`}</button>
        </div>
        : <div style={{ marginTop: 12, padding: 12, background: '#F5F8FF', borderRadius: 8, fontSize: 13.5, lineHeight: 1.6 }}>결제는 <a href="/settle-request" style={{ color: '#175CD3', fontWeight: 700 }}>정산요청</a>에서 <b>「인바운드」를 체크</b>하고 접수하면 여기에 자동으로 들어갑니다. 정산요청을 취소하면 여기서도 취소됩니다.</div>}
        <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 8 }}>결제는 결제일이 속한 회사월(21일~20일)의 실적으로 잡힙니다. 금액은 정산요청의 판매총액 · 상품총액을 VAT 제외로 바꾼 값입니다.</div>
      </>}
    </div>
  </div>;
}
