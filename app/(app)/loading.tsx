export default function Loading() {
  return <div style={{ display: 'grid', gap: 14 }} aria-busy>
    <div style={{ height: 26, width: 220, background: 'var(--line)', borderRadius: 8 }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>{[0, 1, 2, 3].map(i => <div key={i} className="card" style={{ height: 84, background: 'var(--panel)' }}><div style={{ height: 10, width: '40%', background: 'var(--line)', borderRadius: 6, marginBottom: 10 }} /><div style={{ height: 22, width: '60%', background: 'var(--line)', borderRadius: 6 }} /></div>)}</div>
    <div className="card" style={{ height: 320 }}><div style={{ height: 10, width: '30%', background: 'var(--line)', borderRadius: 6, marginBottom: 14 }} />{[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={{ height: 12, background: 'var(--line)', borderRadius: 6, marginBottom: 12, opacity: 1 - i * 0.12 }} />)}</div>
  </div>;
}
