'use client';
import { useEffect, useState } from 'react';
import { notify } from '@/components/Toast';
import { loadAssignments, loadEmpCustomers, findCustomers, assignCustomer, unassignCustomer, createCustomerAssigned } from './actions';
type Emp = { empId: string; empName: string; deptName?: string; useInd?: string };
type Cust = { bizNo: string; custName: string; ownerName: string };
const fmtBiz = (b: string) => b.length === 10 ? `${b.slice(0, 3)}-${b.slice(3, 5)}-${b.slice(5)}` : b;

export default function CustomersClient() {
  const [emps, setEmps] = useState<Emp[]>([]); const [byBiz, setByBiz] = useState<Record<string, string[]>>({}); const [loading, setLoading] = useState(true); const [err, setErr] = useState('');
  const [tab, setTab] = useState<'new' | 'assign' | 'emp'>('new');
  const [newEmps, setNewEmps] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(''); const [found, setFound] = useState<Cust[] | null>(null); const [sel, setSel] = useState<Cust | null>(null); const [selEmps, setSelEmps] = useState<Set<string>>(new Set());
  const [empId, setEmpId] = useState(''); const [empCusts, setEmpCusts] = useState<Cust[] | null>(null);
  const nameOf = (id: string) => emps.find(e => e.empId === id)?.empName ?? id;
  const reload = async () => { setLoading(true); const r = await loadAssignments(); setLoading(false); if (!r.ok) { setErr(r.msg); return; } setErr(''); setEmps(r.emps ?? []); setByBiz(r.byBiz ?? {}); };
  useEffect(() => { reload(); }, []);
  const search = async () => { if (!q.trim()) return; const r = await findCustomers(q.trim()); if (!r.ok) return notify(r.msg, 'bad'); setFound(r.list ?? []); };
  const openEmp = async (id: string) => { setEmpId(id); setEmpCusts(null); if (!id) return; const r = await loadEmpCustomers(id); if (!r.ok) return notify(r.msg, 'bad'); setEmpCusts(r.list ?? []); };
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };
  const EmpPicker = ({ value, onChange, exclude = [] }: { value: Set<string>; onChange: (s: Set<string>) => void; exclude?: string[] }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {emps.filter(e => e.useInd !== 'N').map(e => { const on = value.has(e.empId), dis = exclude.includes(e.empId); return <button type="button" key={e.empId} disabled={dis} className="btn ghost" style={{ padding: '4px 10px', fontSize: 12.5, background: on ? 'var(--accent-soft)' : dis ? 'var(--bg)' : undefined, borderColor: on ? 'var(--accent)' : undefined, opacity: dis ? .5 : 1 }} onClick={() => toggle(value, onChange, e.empId)}>{e.empName} <span style={{ color: 'var(--muted)', fontSize: 11 }}>{e.empId}</span>{dis ? ' ✓' : ''}</button>; })}
    {emps.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>직원 목록 없음</span>}</div>;
  const tabBtn = (k: typeof tab, label: string) => <button type="button" className="btn ghost" style={{ padding: '6px 14px', fontSize: 13, background: tab === k ? 'var(--accent-soft)' : undefined, borderColor: tab === k ? 'var(--accent)' : undefined }} onClick={() => setTab(k)}>{label}</button>;
  if (err) return <div className="card" style={{ color: 'var(--bad)' }}>{err} <button className="btn ghost" style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }} onClick={reload}>다시 시도</button></div>;
  return <>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{tabBtn('new', '새 고객 등록 + 배정')}{tabBtn('assign', '기존 고객 배정')}{tabBtn('emp', '직원별 고객 보기')}<span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{loading ? '사이트에서 불러오는 중…' : `직원 ${emps.length}명 · 배정된 고객 ${Object.keys(byBiz).length}개`}</span><button className="btn ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={reload} disabled={loading}>새로고침</button></div>

    {tab === 'new' && <div className="card">
      <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>새 고객 등록 + 담당 직원 배정</h3>
      <form action={async fd => { if (busy) return; setBusy(true); for (const id of newEmps) fd.append('empIds', id); const r = await createCustomerAssigned(fd); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad', r.ok ? 4000 : 7000); if (r.ok) { setNewEmps(new Set()); (document.getElementById('newCustForm') as HTMLFormElement)?.reset(); reload(); } }} id="newCustForm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <input name="bizNo" placeholder="사업자번호 * (숫자만)" required pattern="[0-9\-]{10,12}" /><input name="custName" placeholder="고객(업체)명 *" required /><input name="ownerName" placeholder="대표자" />
        <input name="custTel" placeholder="연락처" /><input name="custMail" placeholder="이메일" type="email" /><input name="depositorName" placeholder="입금자명" />
        <input name="custAddr" placeholder="주소" style={{ gridColumn: 'span 3' }} /><input name="bizType" placeholder="업태" /><input name="bizClass" placeholder="종목" /><input name="incentiveRate" placeholder="고객 인센율 (예: 0.3, 비우면 직원율)" type="number" step="0.01" min="0" max="1" />
        <div style={{ gridColumn: 'span 3' }}><div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>담당 직원 * (여러 명 가능) — 선택 {newEmps.size}명</div><EmpPicker value={newEmps} onChange={setNewEmps} /></div>
        <div style={{ gridColumn: 'span 3', display: 'flex', gap: 10, alignItems: 'center' }}><button className="btn" disabled={busy || newEmps.size === 0} style={{ padding: '7px 14px', fontSize: 13 }}>{busy ? '등록 중…' : '정산 사이트에 등록 + 배정'}</button><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>같은 사업자번호가 이미 있으면 사이트가 거부합니다 → '기존 고객 배정' 탭에서 배정만 하세요.</span></div>
      </form>
    </div>}

    {tab === 'assign' && <div className="card">
      <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>기존 고객에 직원 배정</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} placeholder="고객명 또는 사업자번호 검색" style={{ width: 260 }} /><button className="btn ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={search}>검색</button></div>
      {found && <div style={{ overflowX: 'auto', marginBottom: 12 }}><table><thead><tr><th>고객</th><th>사업자번호</th><th>대표자</th><th>현재 배정</th><th></th></tr></thead><tbody>
        {found.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center' }}>검색 결과 없음</td></tr>}
        {found.slice(0, 50).map(c => <tr key={c.bizNo} style={{ background: sel?.bizNo === c.bizNo ? 'var(--accent-soft)' : undefined }}><td><b>{c.custName}</b></td><td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtBiz(c.bizNo)}</td><td>{c.ownerName}</td><td style={{ fontSize: 12 }}>{(byBiz[c.bizNo] ?? []).map(nameOf).join(', ') || <span style={{ color: 'var(--bad)' }}>미배정</span>}</td><td><button className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => { setSel(c); setSelEmps(new Set()); }}>선택</button></td></tr>)}
      </tbody></table>{found.length > 50 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>외 {found.length - 50}개 — 더 구체적으로 검색</div>}</div>}
      {sel && <div style={{ padding: 12, border: '1px dashed var(--accent)', borderRadius: 10 }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}><b>{sel.custName}</b> <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{fmtBiz(sel.bizNo)}</span></div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>현재 배정: {(byBiz[sel.bizNo] ?? []).length === 0 ? '없음' : (byBiz[sel.bizNo] ?? []).map(id => <span key={id} className="pill" style={{ marginRight: 6 }}>{nameOf(id)} <button type="button" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--bad)', fontSize: 12 }} title="배정 해제" onClick={async () => { if (!confirm(`${nameOf(id)} 배정을 해제할까요? 해당 직원 정산요청 목록에서 이 고객이 사라집니다.`)) return; const r = await unassignCustomer(sel.bizNo, id); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) reload(); }}>✕</button></span>)}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>추가 배정할 직원 — 선택 {selEmps.size}명</div><EmpPicker value={selEmps} onChange={setSelEmps} exclude={byBiz[sel.bizNo] ?? []} />
        <button className="btn" disabled={busy || selEmps.size === 0} style={{ marginTop: 10, padding: '6px 14px', fontSize: 13 }} onClick={async () => { setBusy(true); const r = await assignCustomer(sel.bizNo, [...selEmps]); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { setSelEmps(new Set()); reload(); } }}>{busy ? '배정 중…' : '배정'}</button>
      </div>}
    </div>}

    {tab === 'emp' && <div className="card">
      <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>직원별 배정 고객</h3>
      <select value={empId} onChange={e => openEmp(e.target.value)} style={{ width: 260, marginBottom: 10 }}><option value="">직원 선택</option>{emps.map(e => <option key={e.empId} value={e.empId}>{e.empName} ({e.empId}){e.useInd === 'N' ? ' · 퇴사' : ''} — {Object.values(byBiz).filter(l => l.includes(e.empId)).length}개</option>)}</select>
      {empId && (empCusts === null ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>불러오는 중…</div> : <div style={{ overflowX: 'auto' }}><table><thead><tr><th>고객</th><th>사업자번호</th><th>대표자</th><th>같이 배정된 직원</th><th></th></tr></thead><tbody>
        {empCusts.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center' }}>배정된 고객 없음</td></tr>}
        {empCusts.map(c => <tr key={c.bizNo}><td><b>{c.custName}</b></td><td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtBiz(c.bizNo)}</td><td>{c.ownerName}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{(byBiz[c.bizNo] ?? []).filter(id => id !== empId).map(nameOf).join(', ') || '-'}</td><td><button className="btn ghost" style={{ padding: '3px 10px', fontSize: 12, color: 'var(--bad)' }} onClick={async () => { if (!confirm(`${c.custName} 을(를) ${nameOf(empId)} 에게서 해제할까요?`)) return; const r = await unassignCustomer(c.bizNo, empId); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { openEmp(empId); reload(); } }}>해제</button></td></tr>)}
      </tbody></table></div>)}
    </div>}
  </>;
}
