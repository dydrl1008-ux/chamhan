'use client';
import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/components/Toast';
import { kwContacts, kwSetResult, kwRequest, kwRequests, kwCloseRequest, type KwCount, type Contact, type KwReq } from './actions';
const RESULTS = ['부재', '관심', '재연락', '거절', '계약'];
const COLOR: Record<string, string> = { 관심: '#067647', 계약: '#175CD3', 재연락: '#B54708', 거절: '#B42318', 부재: '#667085' };
export default function KwCallsClient({ me, keywords, err, reqs0, reqErr, initialKw }: { me: { id: string; boss: boolean }; keywords: KwCount[]; err: string; reqs0: { mine: KwReq[]; open: KwReq[] }; reqErr: string; initialKw?: string }) {
  const [reqs, setReqs] = useState(reqs0); const [rq, setRq] = useState(''); const [rbusy, setRbusy] = useState(false); const [sel, setSel] = useState<Set<number>>(new Set());
  const md = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
  const reloadReq = async () => { const r = await kwRequests(); if (r.ok) { setReqs({ mine: r.mine, open: r.open }); setSel(new Set()); } };
  const ask = async () => { if (!rq.trim() || rbusy) return; setRbusy(true); const r = await kwRequest(rq); setRbusy(false); notify(r.msg, r.ok && r.added.length ? 'ok' : 'bad'); if (r.ok) { if (r.added.length) setRq(''); reloadReq(); } };
  const closeSel = async (status: 'done' | 'rejected') => { const ids = [...sel]; if (!ids.length) return notify('먼저 요청을 체크해 주세요', 'bad'); setRbusy(true); const r = await kwCloseRequest(ids, status); setRbusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) reloadReq(); };
  const openKws = Array.from(new Set(reqs.open.map(r => r.keyword)));
  const [q, setQ] = useState(''); const [kw, setKw] = useState(''); const [rows, setRows] = useState<Contact[]>([]); const [busy, setBusy] = useState(false);
  const [only010, setOnly010] = useState(true); const [onlyOpen, setOnlyOpen] = useState(false); const [memo, setMemo] = useState<Record<number, string>>({});
  const nk = (x: string) => x.replace(/\s+/g, '').toLowerCase();
  const myKw = useMemo(() => new Set(reqs.mine.filter(r => r.status === 'done').map(r => nk(r.keyword))), [reqs.mine]);
  const kws = useMemo(() => { const k = q.trim().replace(/\s/g, ''); const l = k ? keywords.filter(x => x.keyword.replace(/\s/g, '').includes(k)) : keywords; return [...l.filter(x => myKw.has(nk(x.keyword))), ...l.filter(x => !myKw.has(nk(x.keyword)))].slice(0, 300); }, [keywords, q, myKw]);   // 내가 요청한 키워드 먼저
  useEffect(() => { if (initialKw) load(initialKw); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const load = async (k: string) => { setKw(k); setBusy(true); const r = await kwContacts(k); setBusy(false); if (!r.ok) return notify(r.msg, 'bad'); setRows(r.rows); setMemo({}); };
  const is010 = (p: string) => /^01[016789]/.test(p.replace(/\D/g, ''));
  const view = rows.filter(r => (!only010 || is010(r.phone)) && (!onlyOpen || !r.result));
  const save = async (r: Contact, result: string) => {
    const m = memo[r.id] ?? r.memo; const x = await kwSetResult(r.id, result, m); notify(x.msg, x.ok ? 'ok' : 'bad'); if (!x.ok) return;
    setRows(rs => rs.map(y => y.id === r.id ? { ...y, result, memo: m, claimed_by: !result && !m ? null : y.claimed_by ?? me.id, claimed_name: !result && !m ? '' : y.claimed_name || '나' } : y));
  };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); notify('복사됨', 'ok'); } catch { notify('복사 실패', 'bad'); } };
  return <div style={{ display: 'grid', gap: 16 }}>
    {me.boss && reqs.open.length > 0 && <div className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>직원 키워드 요청 <span style={{ color: '#B54708' }}>{openKws.length}개 대기</span></b>
        <button type="button" className="btn" onClick={() => copy(openKws.join(','))}>전체 복사 (콤마)</button>
        <button type="button" className="btn ghost" disabled={rbusy || !sel.size} onClick={() => closeSel('done')}>체크한 것 완료</button>
        <button type="button" className="btn ghost" disabled={rbusy || !sel.size} onClick={() => closeSel('rejected')} title="추출해도 업체가 안 나온 키워드">체크한 것 반려</button>
        <span className="help">복사해서 추출기에 붙여 넣고, 끝나면 CSV 를 「수동 발송 엑셀」에 올리면 자동으로 완료 처리됩니다</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{reqs.open.map(r => <label key={r.id} className="chip" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }} title={md(r.created_at)}>
        <input type="checkbox" checked={sel.has(r.id)} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} style={{ width: 'auto' }} />{r.keyword} <span style={{ color: 'var(--muted)' }}>{r.by}</span></label>)}</div>
    </div>}
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16, alignItems: 'start' }}>
    <div style={{ display: 'grid', gap: 16 }}>
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <b>키워드 요청</b>
      <div className="help">리스트에 없는 키워드를 요청하면 추출해서 올려 드립니다. 올라오면 알림이 갑니다. 콤마로 여러 개 가능.</div>
      <div style={{ display: 'flex', gap: 6 }}><input value={rq} onChange={e => setRq(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(); }} placeholder="예: 캠핑의자, 전기장판" style={{ flex: 1, minWidth: 0 }} /><button type="button" className="btn" disabled={rbusy || !rq.trim()} onClick={ask}>요청</button></div>
      {reqErr && <div style={{ color: '#B42318', fontSize: 13 }}>{reqErr}</div>}
      {reqs.mine.length > 0 && <div style={{ display: 'grid', gap: 3, maxHeight: 170, overflow: 'auto' }}>{reqs.mine.map(r => <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
        {r.status === 'done' ? <button type="button" onClick={() => load(r.keyword)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: 'inherit', fontSize: 13, textAlign: 'left' }}>{r.keyword}</button> : <span>{r.keyword}</span>}
        <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: r.status === 'done' ? '#067647' : r.status === 'rejected' ? '#B42318' : '#B54708' }}>{r.status === 'done' ? '올라옴' : r.status === 'rejected' ? '업체 없음' : '대기'}</span></div>)}</div>}
    </div>
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <b>키워드 <span className="cell-sub" style={{ fontWeight: 400 }}>{keywords.length.toLocaleString()}개</span></b>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="키워드 검색" />
      {err && <div style={{ color: '#B42318', fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'grid', gap: 2, maxHeight: 640, overflow: 'auto' }}>
        {kws.map(k => <button key={k.keyword} type="button" onClick={() => load(k.keyword)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 9px', border: 0, borderRadius: 8, cursor: 'pointer', textAlign: 'left', background: k.keyword === kw ? 'var(--bg)' : 'transparent', fontWeight: k.keyword === kw ? 800 : 500, fontSize: 13.5 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myKw.has(nk(k.keyword)) && <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#7A5AF8', borderRadius: 999, padding: '1px 7px', marginRight: 6 }}>내 요청</span>}{k.keyword}</span><span className="cell-sub" style={{ whiteSpace: 'nowrap' }}>미연락 {k.open} / {k.n}</span></button>)}
        {!kws.length && !err && <div className="cell-sub" style={{ padding: 8 }}>{keywords.length ? '검색 결과 없음' : '아직 업체가 없습니다 — 총괄이 「수동 발송 엑셀」에서 추출기 CSV 를 올리면 쌓입니다'}</div>}
      </div>
    </div>
    </div>
    <div className="card" style={{ minWidth: 0 }}>
      {!kw ? <div className="cell-sub" style={{ padding: 24, textAlign: 'center' }}>왼쪽에서 키워드를 골라 주세요</div> : <>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <b style={{ fontSize: 16 }}>{kw}</b><span className="cell-sub">{busy ? '불러오는 중…' : `${view.length} / ${rows.length}곳`}</span>
          <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={only010} onChange={e => setOnly010(e.target.checked)} style={{ width: 'auto' }} /> 010 번호만</label>
          <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} style={{ width: 'auto' }} /> 미연락만</label>
        </div>
        <div style={{ overflow: 'auto' }}><table><thead><tr><th>업체</th><th>대표자</th><th>전화</th><th>이메일</th><th style={{ minWidth: 250 }}>결과 · 메모</th><th>담당</th></tr></thead>
          <tbody>{view.map(r => { const rsvMine = r.reserved_by === me.id, rsvOther = !!r.reserved_by && !rsvMine; const mine = me.boss || r.claimed_by === me.id || (!r.claimed_by && !rsvOther); return <tr key={r.id} style={{ opacity: r.result === '거절' ? .55 : 1, background: rsvMine ? 'rgba(122,90,248,.07)' : undefined }}>
            <td><div style={{ fontWeight: 700 }}>{rsvMine && <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#7A5AF8', borderRadius: 999, padding: '1px 7px', marginRight: 6 }}>내 요청</span>}{rsvOther && <span title="요청한 직원에게 7일간 우선권이 있습니다" style={{ fontSize: 11, fontWeight: 700, color: '#667085', border: '1px solid #D0D5DD', borderRadius: 999, padding: '1px 7px', marginRight: 6 }}>{r.reserved_name || '다른 직원'} 요청</span>}{r.store_url ? <a href={r.store_url} target="_blank" rel="noreferrer">{r.store_name}</a> : r.store_name}</div><div className="cell-sub">{[r.company, r.address.split(' ').slice(0, 2).join(' ')].filter(Boolean).join(' · ')}</div></td>
            <td style={{ whiteSpace: 'nowrap' }}>{r.rep || '-'}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{r.phone ? <button type="button" onClick={() => copy(r.phone)} title="누르면 복사" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, fontSize: 13.5 }}>{r.phone}</button> : '-'}</td>
            <td className="cell-sub">{r.email ? <button type="button" onClick={() => copy(r.email)} title="누르면 복사" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5, color: 'inherit' }}>{r.email}</button> : '-'}</td>
            <td>{mine ? <div style={{ display: 'grid', gap: 5 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{RESULTS.map(x => <button key={x} type="button" onClick={() => save(r, r.result === x ? '' : x)} style={{ padding: '3px 9px', fontSize: 12, borderRadius: 999, cursor: 'pointer', border: `1px solid ${r.result === x ? COLOR[x] : 'var(--line, #D0D5DD)'}`, background: r.result === x ? COLOR[x] : 'transparent', color: r.result === x ? '#fff' : 'inherit', fontWeight: 700 }}>{x}</button>)}</div>
              <input value={memo[r.id] ?? r.memo} onChange={e => setMemo(m => ({ ...m, [r.id]: e.target.value }))} onBlur={() => { if ((memo[r.id] ?? r.memo) !== r.memo) save(r, r.result); }} placeholder="메모 (칸을 벗어나면 저장)" style={{ fontSize: 12.5 }} />
            </div> : <div><b style={{ color: COLOR[r.result] ?? 'inherit' }}>{r.result || (rsvOther ? '요청자 우선' : '-')}</b><div className="cell-sub">{r.memo || (rsvOther && r.reserved_until ? `${md(r.reserved_until).slice(0, 5)} 이후 누구나 가능` : '')}</div></div>}</td>
            <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{r.claimed_name || (r.reserved_by ? `${rsvMine ? '나' : r.reserved_name} (요청)` : '-')}</td></tr>; })}
            {!view.length && !busy && <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>조건에 맞는 업체가 없습니다 — 위 체크를 풀어 보세요</td></tr>}</tbody></table></div>
      </>}
    </div>
  </div>
  </div>;
}
