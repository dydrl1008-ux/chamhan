'use client';
// 오늘의 콜 리스트 안의 「키워드 요청 건」 — 내가 요청해 올라온 업체 + 내가 담당인 키워드 콜을 콜 리스트처럼 보여 준다 (자동 배분 리스트와 별개, 보라색)
import { useMemo, useState } from 'react';
import { notify } from '@/components/Toast';
import { kwSetResult } from '../kw-calls/actions';
export type KwRow = { id: number; store_name: string; store_url: string; company: string; rep: string; email: string; phone: string; address: string; keywords: string[]; reserved_kw: string; claimed: boolean; result: string; memo: string; result_at: string | null; until: string | null };
const RESULTS = ['부재', '관심', '재연락', '거절', '계약'];
const COLOR: Record<string, string> = { 관심: '#067647', 계약: '#175CD3', 재연락: '#B54708', 거절: '#B42318', 부재: '#667085' };
const V = '#7A5AF8';
const TABS: { key: string; label: string; f: (r: KwRow) => boolean }[] = [
  { key: 'open', label: '미연락', f: r => !r.result },
  { key: '관심', label: '관심', f: r => r.result === '관심' },
  { key: '재연락', label: '재연락', f: r => r.result === '재연락' },
  { key: '계약', label: '계약', f: r => r.result === '계약' },
  { key: 'no', label: '부재·거절', f: r => r.result === '부재' || r.result === '거절' },
];
export default function KwMine({ rows0, canEdit, who, today, owner }: { rows0: KwRow[]; canEdit: boolean; who: string; today: string; owner: string }) {
  const [rows, setRows] = useState(rows0); const [tab, setTab] = useState('open'); const [kw, setKw] = useState(''); const [memo, setMemo] = useState<Record<number, string>>({}); const [shown, setShown] = useState(100);
  const [touched, setTouched] = useState<Set<number>>(new Set());   // 방금 결과 남긴 줄은 그 탭에 남겨 둠 (새로고침하면 해당 탭으로)
  const kwOf = (r: KwRow) => r.reserved_kw || r.keywords[0] || '';
  const kws = useMemo(() => { const m = new Map<string, number>(); rows.forEach(r => { const k = kwOf(r); if (k) m.set(k, (m.get(k) ?? 0) + (r.result ? 0 : 1)); }); return [...m].sort((a, b) => b[1] - a[1]); }, [rows]);
  const base = kw ? rows.filter(r => kwOf(r) === kw) : rows;
  const cur = TABS.find(t => t.key === tab) ?? TABS[0];
  const view = base.filter(r => cur.f(r) || (tab === 'open' && touched.has(r.id)));
  const kst = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString();
  const todayN = rows.filter(r => r.result && r.result_at && kst(r.result_at).slice(0, 10) === today).length;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); notify('복사됨', 'ok'); } catch { notify('복사 실패', 'bad'); } };
  const save = async (r: KwRow, result: string) => {
    const m = memo[r.id] ?? r.memo; const x = await kwSetResult(r.id, result, m, owner); notify(x.msg, x.ok ? 'ok' : 'bad'); if (!x.ok) return;
    setTouched(s => new Set(s).add(r.id));
    setRows(rs => rs.map(y => y.id === r.id ? { ...y, result, memo: m, result_at: result || m ? new Date().toISOString() : null } : y));
  };
  return <div className="card" style={{ padding: 0, borderLeft: `4px solid ${V}` }}>
    <div style={{ display: 'grid', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--line)', background: 'rgba(122,90,248,.05)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b><span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: V, borderRadius: 999, padding: '2px 8px', marginRight: 8 }}>키워드 요청 건</span>{who} 요청한 업체 + 직접 연락한 키워드 콜</b>
        <span className="cell-sub">자동 배분 리스트와 별개 · 여기엔 요청 건과 이미 결과를 남긴 업체만 나옵니다 · 오늘 키워드 콜 {todayN}건</span>
        <a href={kw ? `/kw-calls?k=${encodeURIComponent(kw)}` : '/kw-calls'} className="help" style={{ marginLeft: 'auto', fontWeight: 700 }}>{kw ? `「${kw}」 전체 업체 보기 →` : '키워드 콜 리스트 전체 보기 →'}</a>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => <button key={t.key} type="button" onClick={() => { setTab(t.key); setShown(100); setTouched(new Set()); }} className={`btn ${t.key === tab ? '' : 'ghost'}`} style={{ padding: '6px 14px', ...(t.key === tab ? { background: V, borderColor: V } : {}) }}>{t.label} <b style={{ marginLeft: 4 }}>{base.filter(t.f).length}</b></button>)}
        {kws.length > 1 && <select value={kw} onChange={e => { setKw(e.target.value); setShown(100); }} style={{ width: 'auto', marginLeft: 8, padding: '5px 8px', fontSize: 13 }}><option value="">키워드 전체</option>{kws.map(([k, n]) => <option key={k} value={k}>{k} (미연락 {n})</option>)}</select>}
        {kws.length === 1 && <span className="help" style={{ marginLeft: 8 }}>{kws[0][0]}</span>}
      </div>
    </div>
    {view.length ? <div style={{ overflow: 'auto' }}><table><thead><tr><th style={{ width: 36 }}>#</th><th>업체</th><th>대표자</th><th>전화</th><th>이메일</th><th style={{ minWidth: 250 }}>결과 · 메모</th></tr></thead>
      <tbody>{view.slice(0, shown).map((r, i) => <tr key={r.id} style={{ opacity: r.result === '거절' ? .55 : 1 }}>
        <td className="cell-sub">{i + 1}</td>
        <td><div style={{ fontWeight: 700 }}>{r.store_url ? <a href={r.store_url} target="_blank" rel="noreferrer">{r.store_name}</a> : r.store_name}</div>
          <div className="cell-sub"><span style={{ color: V, fontWeight: 700 }}>{kwOf(r)}</span>{[r.company, r.address.split(' ').slice(0, 2).join(' ')].filter(Boolean).map(x => ` · ${x}`).join('')}{!r.claimed && !r.result && r.until ? ` · ~${kst(r.until).slice(5, 10).replace('-', '/')} 까지 내 우선` : ''}</div></td>
        <td style={{ whiteSpace: 'nowrap' }}>{r.rep || '-'}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{r.phone ? <button type="button" onClick={() => copy(r.phone)} title="누르면 복사" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, fontSize: 13.5 }}>{r.phone}</button> : '-'}</td>
        <td className="cell-sub">{r.email ? <button type="button" onClick={() => copy(r.email)} title="누르면 복사" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5, color: 'inherit' }}>{r.email}</button> : '-'}</td>
        <td>{canEdit ? <div style={{ display: 'grid', gap: 5 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{RESULTS.map(x => <button key={x} type="button" onClick={() => save(r, r.result === x ? '' : x)} style={{ padding: '3px 9px', fontSize: 12, borderRadius: 999, cursor: 'pointer', border: `1px solid ${r.result === x ? COLOR[x] : 'var(--line, #D0D5DD)'}`, background: r.result === x ? COLOR[x] : 'transparent', color: r.result === x ? '#fff' : 'inherit', fontWeight: 700 }}>{x}</button>)}</div>
          <input value={memo[r.id] ?? r.memo} onChange={e => setMemo(m => ({ ...m, [r.id]: e.target.value }))} onBlur={() => { if ((memo[r.id] ?? r.memo) !== r.memo) save(r, r.result); }} placeholder="메모 (칸을 벗어나면 저장)" style={{ fontSize: 12.5 }} />
        </div> : <div><b style={{ color: COLOR[r.result] ?? 'inherit' }}>{r.result || '-'}</b><div className="cell-sub">{r.memo}</div></div>}</td></tr>)}
        {view.length > shown && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 14 }}><button type="button" className="btn" onClick={() => setShown(n => n + 100)}>100곳 더 보기 ({shown} / {view.length})</button></td></tr>}</tbody></table></div>
      : <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>{cur.label} 업체가 없습니다{tab === 'open' ? ' — 전체 공용 키워드의 미연락 업체는 위 「전체 업체 보기 →」(키워드 콜 리스트)에 있습니다' : ''}</div>}
  </div>;
}
