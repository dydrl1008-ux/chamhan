'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { savePnl, addCategory } from './actions';
import { won, man } from '@/lib/date/kst';
type S = { month: string; operating_profit: number; total_cost: number; net_profit: number };
export default function PnlAdmin({ month, range, cats, mo, items, summary, marginSum }: { month: string; range: [string, string]; cats: { id: number; name: string }[]; mo: { operating_profit: number; note: string | null } | null; items: { category_id: number; amount: number; note: string | null }[]; summary: S[]; marginSum: number }) {
  const r = useRouter(); const [op, setOp] = useState(Number(mo?.operating_profit ?? 0)); const [amts, setAmts] = useState<Record<number, number>>(Object.fromEntries(cats.map(c => [c.id, Number(items.find(i => i.category_id === c.id)?.amount ?? 0)])));
  const cost = Object.values(amts).reduce((a, b) => a + b, 0); const net = op - cost; const prev = summary.filter(s => s.month < month + '-01').at(-1);
  const mx = Math.max(1, ...summary.map(s => Math.abs(Number(s.operating_profit))));
  const kpi = (l: string, v: string, d?: string, c?: string) => <div className="card" style={{ padding: '14px 18px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>{d && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d}</div>}</div>;
  const diff = (a: number, b?: number) => b === undefined ? '' : `전월 대비 ${a - b >= 0 ? '+' : ''}${man(a - b)}`;
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h1 style={{ fontSize: 20, margin: 0 }}>영업이익 월별</h1><input type="month" value={month} onChange={e => r.push(`/admin/pnl?m=${e.target.value}`)} style={{ width: 160 }} /><span style={{ fontSize: 12, color: 'var(--muted)' }}>{Number(month.slice(5))}월 = {range[0].slice(5).replace('-', '/')} ~ {range[1].slice(5).replace('-', '/')} (21일~20일 마감) · VAT 제외 · 실수익 = 영업이익 − 비용합계</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>{kpi('영업이익', won(op), diff(op, prev ? Number(prev.operating_profit) : undefined))}{kpi('비용 합계', won(cost), diff(cost, prev ? Number(prev.total_cost) : undefined))}{kpi('실수익', won(net), diff(net, prev ? Number(prev.net_profit) : undefined), net >= 0 ? 'var(--ok)' : 'var(--bad)')}{kpi('실수익률', op ? Math.round(net / op * 100) + '%' : '-')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <form className="card" action={async fd => { const x = await savePnl(fd); notify(x.msg); if (x.ok) r.refresh(); }}>
          <input type="hidden" name="month" value={month} />
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{Number(month.slice(5))}월 항목 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>금액·비고 바로 수정 후 저장</span></h3>
          <table><thead><tr><th>항목</th><th style={{ textAlign: 'right' }}>금액</th><th style={{ minWidth: 200 }}>비고</th></tr></thead><tbody>
            <tr><td><b>영업이익</b></td><td><input name="operating_profit" type="number" value={op} onChange={e => setOp(Number(e.target.value) || 0)} style={{ textAlign: 'right', width: 160 }} /></td><td><input name="note" defaultValue={mo?.note ?? ''} placeholder="비고" style={{ padding: '6px 10px', fontSize: 12.5 }} /><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>참고: {Number(month.slice(5))}월({range[0].slice(5).replace('-', '/')}~{range[1].slice(5).replace('-', '/')}) KPI 마진 합계 {won(marginSum)} <button type="button" className="btn ghost" style={{ padding: '1px 6px', fontSize: 11, marginLeft: 6 }} onClick={() => setOp(marginSum)}>가져오기</button></div></td></tr>
            {cats.map(c => <tr key={c.id}><td>{c.name}<input type="hidden" name="category_id" value={c.id} /></td><td><input name="amount" type="number" value={amts[c.id] ?? 0} onChange={e => setAmts({ ...amts, [c.id]: Number(e.target.value) || 0 })} style={{ textAlign: 'right', width: 160 }} /></td><td><input name="item_note" defaultValue={items.find(i => i.category_id === c.id)?.note ?? ''} placeholder="비고" style={{ padding: '6px 10px', fontSize: 12.5 }} /></td></tr>)}
            <tr style={{ fontWeight: 700, background: 'var(--bg)' }}><td>비용 합계</td><td style={{ textAlign: 'right' }}>{won(cost)}</td><td></td></tr>
            <tr style={{ fontWeight: 700, background: 'var(--bg)' }}><td>실수익</td><td style={{ textAlign: 'right', color: net >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{won(net)}</td><td></td></tr></tbody></table>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}><button className="btn">저장</button><input id="newCat" placeholder="비용 항목 추가" style={{ width: 180, padding: '6px 10px', fontSize: 12.5 }} /><button type="button" className="btn ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={async () => { const el = document.getElementById('newCat') as HTMLInputElement; const x = await addCategory(el.value); notify(x.msg); if (x.ok) { el.value = ''; r.refresh(); } }}>항목 추가</button></div>
        </form>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>추세 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>영업이익 · 비용 · 실수익</span></h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 160 }}>{summary.map(s => <div key={s.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}><div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', width: '100%', height: 120 }}><div style={{ flex: 1, height: `${Number(s.operating_profit) / mx * 100}%`, background: 'var(--accent)', borderRadius: '4px 4px 0 0' }} /><div style={{ flex: 1, height: `${Number(s.total_cost) / mx * 100}%`, background: 'var(--line)', borderRadius: '4px 4px 0 0' }} /></div>{Number(s.month.slice(5, 7))}월</div>)}{summary.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>데이터 없음</div>}</div>
          <table style={{ marginTop: 12, fontSize: 13 }}><tbody>{summary.map(s => <tr key={s.month}><td>{s.month.slice(0, 7)}</td><td style={{ textAlign: 'right' }}>{won(s.operating_profit)}</td><td style={{ textAlign: 'right', color: 'var(--muted)' }}>−{won(s.total_cost)}</td><td style={{ textAlign: 'right', fontWeight: 700, color: Number(s.net_profit) >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{won(s.net_profit)}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}
