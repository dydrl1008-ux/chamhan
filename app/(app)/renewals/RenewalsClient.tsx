'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { Status } from '@/components/ui';
import { giveUp, undoGiveUp, reassign, syncNow } from './actions';

export type Churn = { id: number; owner_id: string; cust_name: string; prod_name: string; biz_no: string; slots: number; date_to: string; status: string; alert_level: number; give_up_reason: string; given_up_at: string | null; assignee_id: string | null; assigned_at: string | null; closed_reason: string; renewed_at: string | null };
export type Person = { id: string; name: string };

const md = (d: string | null) => d ? d.slice(5, 10).replace('-', '/') : '-';
const days = (today: string, d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
const ST: Record<string, [string, 'ok' | 'wait' | 'bad' | 'off']> = {
  open: ['미결제', 'wait'], given_up: ['포기 · 분배 대기', 'bad'], reassigned: ['분배됨', 'wait'], renewed: ['연장됨', 'ok'], closed: ['종료', 'off'],
};
function Age({ today, d }: { today: string; d: string }) {
  const n = days(today, d);
  const tone = n >= 14 ? 'bad' : n >= 7 ? 'wait' : 'off';
  return <Status kind={tone}>{n >= 14 ? '2주+' : n >= 7 ? '1주+' : ''} {n}일 경과</Status>;
}

export default function RenewalsClient({ mode, rows, people = [], names = {}, today }: { mode: 'mine' | 'tome' | 'distribute' | 'all'; rows: Churn[]; people?: Person[]; names?: Record<string, string>; today: string }) {
  const r = useRouter(); const [busy, start] = useTransition();
  const [why, setWhy] = useState<Record<number, string>>({}); const [ask, setAsk] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set()); const [to, setTo] = useState(''); const [settle, setSettle] = useState(true);
  const run = (p: Promise<{ ok: boolean; msg: string }>) => start(async () => { const x = await p; notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setSel(new Set()); setAsk(null); r.refresh(); } });
  const toggle = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const all = rows.length > 0 && sel.size === rows.length;

  const giveUpCell = (c: Churn, label: string) => ask === c.id
    ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input style={{ flex: 1, minWidth: 160 }} placeholder="이유 (다음 담당자가 봄)" value={why[c.id] ?? ''} onChange={e => setWhy(s => ({ ...s, [c.id]: e.target.value }))} />
        <button className="btn danger xs" disabled={busy} onClick={() => run(giveUp(c.id, why[c.id] ?? ''))}>{label}</button>
        <button className="btn ghost xs" onClick={() => setAsk(null)}>취소</button>
      </div>
    : <button className="btn ghost xs" disabled={busy} onClick={() => setAsk(c.id)}>{label}</button>;

  if (mode === 'distribute') return (<>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
      <select value={to} onChange={e => setTo(e.target.value)}>
        <option value="">자동 (맡은 수 적은 영업사원부터)</option>
        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={settle} onChange={e => setSettle(e.target.checked)} />정산 사이트 고객 배정도 같이</label>
      <button className="btn sm" disabled={!sel.size || busy} onClick={() => run(reassign([...sel], to || null, settle))}>선택 {sel.size}곳 분배</button>
      <button className="btn ghost sm" disabled={busy} onClick={() => run(syncNow())}>지금 갱신</button>
    </div>
    <div className="tbl-wrap"><table>
      <thead><tr><th style={{ width: 32 }}><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map(x => x.id)))} /></th><th>업체 · 상품</th><th>원래 담당</th><th>종료</th><th>포기 이유</th><th></th></tr></thead>
      <tbody>{rows.map(c => <tr key={c.id}>
        <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /></td>
        <td><div className="cell-main">{c.cust_name}</div><div className="cell-sub">{c.prod_name} · {c.slots}개{c.biz_no ? '' : ' · 사업자번호 없음'}</div></td>
        <td>{names[c.owner_id] ?? '-'}</td>
        <td><div>{md(c.date_to)}</div><Age today={today} d={c.date_to} /></td>
        <td style={{ maxWidth: 260 }}><div className="cell-sub">{c.give_up_reason || '-'}</div></td>
        <td><button className="btn ghost xs" disabled={busy} onClick={() => run(undoGiveUp(c.id))}>되돌리기</button></td>
      </tr>)}</tbody>
    </table></div>
  </>);

  return (
    <div className="tbl-wrap"><table>
      <thead><tr><th>업체 · 상품</th>{mode === 'all' && <th>담당</th>}<th>종료</th><th>상태</th>{mode !== 'all' && <th></th>}</tr></thead>
      <tbody>{rows.map(c => <tr key={c.id} style={{ verticalAlign: 'top' }}>
        <td style={{ minWidth: 180 }}>
          <div className="cell-main">{c.cust_name}</div>
          <div className="cell-sub">{c.prod_name} · {c.slots}개</div>
          {mode === 'tome' && c.give_up_reason && <div className="cell-sub">원래 담당 메모: {c.give_up_reason}</div>}
        </td>
        {mode === 'all' && <td style={{ minWidth: 110 }}>{names[c.owner_id] ?? '-'}{c.assignee_id && <div className="cell-sub">→ {names[c.assignee_id] ?? '-'}</div>}</td>}
        <td style={{ minWidth: 110 }}><div>{md(c.date_to)}</div>{['open', 'given_up', 'reassigned'].includes(c.status) && <Age today={today} d={c.date_to} />}</td>
        <td style={{ minWidth: 110 }}>
          <Status kind={(ST[c.status] ?? ['', 'off'])[1]}>{(ST[c.status] ?? [c.status])[0]}</Status>
          {c.status === 'renewed' && c.renewed_at && <div className="cell-sub">{md(c.renewed_at)} 확인</div>}
          {c.status === 'closed' && c.closed_reason && <div className="cell-sub">{c.closed_reason}</div>}
        </td>
        {mode === 'mine' && <td style={{ minWidth: 220 }}>
          {c.status === 'open' ? giveUpCell(c, '포기') : <button className="btn ghost xs" disabled={busy} onClick={() => run(undoGiveUp(c.id))}>포기 취소</button>}
        </td>}
        {mode === 'tome' && <td style={{ minWidth: 220 }}>
          <div className="cell-sub" style={{ marginBottom: 6 }}>{md(c.assigned_at)} 받음 · 계약하면 정산요청만 올리면 자동 「연장됨」</div>
          {giveUpCell(c, '나도 포기 (종료)')}
        </td>}
      </tr>)}</tbody>
    </table></div>
  );
}
