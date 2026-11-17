'use client';
import { useMemo, useState } from 'react';
import { notify } from '@/components/Toast';
import { kwContacts, kwSetResult, type KwCount, type Contact } from './actions';
const RESULTS = ['부재', '관심', '재연락', '거절', '계약'];
const COLOR: Record<string, string> = { 관심: '#067647', 계약: '#175CD3', 재연락: '#B54708', 거절: '#B42318', 부재: '#667085' };
export default function KwCallsClient({ me, keywords, err }: { me: { id: string; boss: boolean }; keywords: KwCount[]; err: string }) {
  const [q, setQ] = useState(''); const [kw, setKw] = useState(''); const [rows, setRows] = useState<Contact[]>([]); const [busy, setBusy] = useState(false);
  const [only010, setOnly010] = useState(true); const [onlyOpen, setOnlyOpen] = useState(false); const [memo, setMemo] = useState<Record<number, string>>({});
  const kws = useMemo(() => { const k = q.trim().replace(/\s/g, ''); return (k ? keywords.filter(x => x.keyword.replace(/\s/g, '').includes(k)) : keywords).slice(0, 300); }, [keywords, q]);
  const load = async (k: string) => { setKw(k); setBusy(true); const r = await kwContacts(k); setBusy(false); if (!r.ok) return notify(r.msg, 'bad'); setRows(r.rows); setMemo({}); };
  const is010 = (p: string) => /^01[016789]/.test(p.replace(/\D/g, ''));
  const view = rows.filter(r => (!only010 || is010(r.phone)) && (!onlyOpen || !r.result));
  const save = async (r: Contact, result: string) => {
    const m = memo[r.id] ?? r.memo; const x = await kwSetResult(r.id, result, m); notify(x.msg, x.ok ? 'ok' : 'bad'); if (!x.ok) return;
    setRows(rs => rs.map(y => y.id === r.id ? { ...y, result, memo: m, claimed_by: !result && !m ? null : y.claimed_by ?? me.id, claimed_name: !result && !m ? '' : y.claimed_name || '나' } : y));
  };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); notify('복사됨', 'ok'); } catch { notify('복사 실패', 'bad'); } };
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16, alignItems: 'start' }}>
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <b>키워드 <span className="cell-sub" style={{ fontWeight: 400 }}>{keywords.length.toLocaleString()}개</span></b>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="키워드 검색" />
      {err && <div style={{ color: '#B42318', fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'grid', gap: 2, maxHeight: 640, overflow: 'auto' }}>
        {kws.map(k => <button key={k.keyword} type="button" onClick={() => load(k.keyword)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 9px', border: 0, borderRadius: 8, cursor: 'pointer', textAlign: 'left', background: k.keyword === kw ? 'var(--bg)' : 'transparent', fontWeight: k.keyword === kw ? 800 : 500, fontSize: 13.5 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.keyword}</span><span className="cell-sub" style={{ whiteSpace: 'nowrap' }}>미연락 {k.open} / {k.n}</span></button>)}
        {!kws.length && !err && <div className="cell-sub" style={{ padding: 8 }}>{keywords.length ? '검색 결과 없음' : '아직 업체가 없습니다 — 총괄이 「수동 발송 엑셀」에서 추출기 CSV 를 올리면 쌓입니다'}</div>}
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
          <tbody>{view.map(r => { const mine = !r.claimed_by || r.claimed_by === me.id || me.boss; return <tr key={r.id} style={{ opacity: r.result === '거절' ? .55 : 1 }}>
            <td><div style={{ fontWeight: 700 }}>{r.store_url ? <a href={r.store_url} target="_blank" rel="noreferrer">{r.store_name}</a> : r.store_name}</div><div className="cell-sub">{[r.company, r.address.split(' ').slice(0, 2).join(' ')].filter(Boolean).join(' · ')}</div></td>
            <td style={{ whiteSpace: 'nowrap' }}>{r.rep || '-'}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{r.phone ? <button type="button" onClick={() => copy(r.phone)} title="누르면 복사" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, fontSize: 13.5 }}>{r.phone}</button> : '-'}</td>
            <td className="cell-sub">{r.email ? <button type="button" onClick={() => copy(r.email)} title="누르면 복사" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5, color: 'inherit' }}>{r.email}</button> : '-'}</td>
            <td>{mine ? <div style={{ display: 'grid', gap: 5 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{RESULTS.map(x => <button key={x} type="button" onClick={() => save(r, r.result === x ? '' : x)} style={{ padding: '3px 9px', fontSize: 12, borderRadius: 999, cursor: 'pointer', border: `1px solid ${r.result === x ? COLOR[x] : 'var(--line, #D0D5DD)'}`, background: r.result === x ? COLOR[x] : 'transparent', color: r.result === x ? '#fff' : 'inherit', fontWeight: 700 }}>{x}</button>)}</div>
              <input value={memo[r.id] ?? r.memo} onChange={e => setMemo(m => ({ ...m, [r.id]: e.target.value }))} onBlur={() => { if ((memo[r.id] ?? r.memo) !== r.memo) save(r, r.result); }} placeholder="메모 (칸을 벗어나면 저장)" style={{ fontSize: 12.5 }} />
            </div> : <div><b style={{ color: COLOR[r.result] ?? 'inherit' }}>{r.result || '-'}</b><div className="cell-sub">{r.memo}</div></div>}</td>
            <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{r.claimed_name || '-'}</td></tr>; })}
            {!view.length && !busy && <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>조건에 맞는 업체가 없습니다 — 위 체크를 풀어 보세요</td></tr>}</tbody></table></div>
      </>}
    </div>
  </div>;
}
