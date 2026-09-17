'use client';
import { useState } from 'react';
import { incentiveOf, type Tier } from '@/lib/rules';
import { won, man } from '@/lib/date/kst';
export default function Simulator({ tiers, newRate }: { tiers: Tier[]; newRate: number }) {
  const [m, setM] = useState(10000000); const [nm, setNm] = useState(0);
  const r = incentiveOf(tiers, 'staff', m, nm, newRate);
  return (
    <div style={{ marginTop: 14, padding: 14, background: 'var(--bg)', borderRadius: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>시뮬레이션</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10, alignItems: 'center' }}>
        <div><label style={{ fontSize: 11.5, color: 'var(--muted)' }}>월 마진</label><input type="number" value={m} onChange={e => setM(Number(e.target.value) || 0)} /></div>
        <div><label style={{ fontSize: 11.5, color: 'var(--muted)' }}>그중 신규 마진</label><input type="number" value={nm} onChange={e => setNm(Number(e.target.value) || 0)} /></div>
        <div>{r.items.map((x, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{x.name}</span><span>{won(x.amt)}</span></div>)}<div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4 }}><span>예상 합계</span><span>{won(r.total)}</span></div>{r.next && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>다음 구간({r.next.label} {(Number(r.next.rate) * 100).toFixed(0)}%)까지 {won(Number(r.next.min_margin) - m)} 남음</div>}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiers.length},1fr)`, gap: 4, marginTop: 10 }}>{tiers.map(t => { const cur = r.tier?.id === t.id; const past = r.tier && t.sort_order < r.tier.sort_order; return <div key={t.id} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 8, border: `1px solid ${cur ? 'var(--accent)' : 'var(--line)'}`, background: cur ? 'var(--accent-soft)' : past ? 'var(--ok-soft)' : 'var(--panel)' }}><div style={{ fontSize: 15, fontWeight: 800, color: cur ? 'var(--accent)' : past ? 'var(--ok)' : 'var(--ink)' }}>{(Number(t.rate) * 100).toFixed(0)}%</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t.label}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>{t.max_margin === null ? `${man(t.min_margin)}↑` : `~${man(t.max_margin)}`}</div></div>; })}</div>
    </div>
  );
}
