'use client';
// 상품 안내 — 검색(상품명·분류·설명·단가·접수·주의 전체) + 분류 칩. 본문 주소는 링크
import { useState } from 'react';
type P = { id: number; name: string; category: string | null; description: string | null; unit_price: string | null; intake_process: string | null; required_materials: string | null; caution: string | null };
const L = (t: string | null | undefined) => !t ? '-' : String(t).split(/(https?:\/\/[^\s·,)]+)/g).map((x, i) => /^https?:\/\//.test(x) ? <a key={i} href={x} target="_blank" rel="noreferrer" style={{ fontWeight: 600, wordBreak: 'break-all' }}>{x}</a> : x);
export default function ProductsList({ rows, canManage }: { rows: P[]; canManage: boolean }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState('');
  const cats = [...new Set(rows.map(p => p.category).filter(Boolean))] as string[];
  const k = q.trim().toLowerCase();
  const list = rows.filter(p => (!cat || p.category === cat) && (!k || [p.name, p.category, p.description, p.unit_price, p.intake_process, p.required_materials, p.caution].some(v => (v ?? '').toLowerCase().includes(k))));
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>상품 안내 · 접수방법</h1>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="검색 — 상품명·분류·설명·단가·접수·주의" style={{ width: 320 }} />
        <span className="cell-sub">{list.length}/{rows.length}</span>
        {canManage && <a href="/products/manage" className="btn ghost" style={{ marginLeft: 'auto' }}>상품 관리 (추가·수정)</a>}
      </div>
      {cats.length > 1 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button type="button" className={`btn xs ${cat ? 'ghost' : ''}`} onClick={() => setCat('')}>전체</button>{cats.map(c => <button key={c} type="button" className={`btn xs ${cat === c ? '' : 'ghost'}`} onClick={() => setCat(cat === c ? '' : c)}>{c} <span style={{ opacity: .7 }}>{rows.filter(p => p.category === c).length}</span></button>)}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {list.map(p => <div className="card" key={p.id}><h3 style={{ margin: '0 0 10px', fontSize: 15, display: 'flex', justifyContent: 'space-between' }}><span>{p.name}</span><span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{p.category}</span></h3>
          <table style={{ fontSize: 13 }}><tbody>
            {p.description && <tr><td style={{ width: 90, color: 'var(--muted)', verticalAlign: 'top' }}>설명</td><td style={{ whiteSpace: 'pre-wrap' }}>{L(p.description)}</td></tr>}
            <tr><td style={{ color: 'var(--muted)' }}>단가</td><td>{p.unit_price ?? '-'}</td></tr>
            <tr><td style={{ color: 'var(--muted)', verticalAlign: 'top' }}>접수 절차</td><td style={{ whiteSpace: 'pre-wrap' }}>{L(p.intake_process)}</td></tr>
            <tr><td style={{ color: 'var(--muted)', verticalAlign: 'top' }}>필요 자료</td><td style={{ whiteSpace: 'pre-wrap' }}>{L(p.required_materials)}</td></tr>
            {p.caution && <tr><td style={{ color: 'var(--muted)' }}>주의</td><td style={{ color: '#D97706' }}>{L(p.caution)}</td></tr>}</tbody></table></div>)}
        {list.length === 0 && <div className="card" style={{ color: 'var(--muted)' }}>{rows.length ? '검색 결과 없음' : '등록된 상품이 없습니다.'}</div>}
      </div>
    </div>
  );
}
