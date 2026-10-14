'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { upsertRow, deactivateRow, reorderRows } from '@/lib/adminCrud';
type P = { id: number; name: string; category: string | null; description: string | null; unit_price: string | null; intake_process: string | null; required_materials: string | null; owner_id: string | null; caution: string | null; sort_order: number };
export default function ProductsAdmin({ rows, people }: { rows: P[]; people: { id: string; name: string }[] }) {
  const r = useRouter(); const [edit, setEdit] = useState<P | null>(null); const paths = ['/admin/products', '/products'];
  const [order, setOrder] = useState<number[]>(rows.map(x => x.id)); const [drag, setDrag] = useState<number | null>(null); const [over, setOver] = useState<number | null>(null);
  const sorted = order.map(id => rows.find(x => x.id === id)!).filter(Boolean).concat(rows.filter(x => !order.includes(x.id)));
  const drop = async (targetId: number) => { if (drag === null || drag === targetId) { setDrag(null); setOver(null); return; } const ids = sorted.map(x => x.id); const from = ids.indexOf(drag), to = ids.indexOf(targetId); ids.splice(from, 1); ids.splice(to, 0, drag); setOrder(ids); setDrag(null); setOver(null); const x = await reorderRows('products', ids, paths); notify(x.msg); r.refresh(); };
  const ta: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: 8 };
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>상품 안내 · 접수방법 관리</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18 }}>
        <div className="card"><table><thead><tr><th style={{ width: 28 }}></th><th>상품</th><th>카테고리</th><th>단가</th><th></th></tr></thead><tbody>{sorted.map(p => <tr key={p.id} draggable onDragStart={() => setDrag(p.id)} onDragOver={e => { e.preventDefault(); setOver(p.id); }} onDragLeave={() => setOver(null)} onDrop={() => drop(p.id)} style={{ opacity: drag === p.id ? .4 : 1, outline: over === p.id && drag !== p.id ? '2px solid var(--accent)' : undefined, cursor: 'grab' }}><td style={{ color: 'var(--muted)', textAlign: 'center' }} title="드래그로 순서 변경">⋮⋮</td><td><b>{p.name}</b></td><td>{p.category}</td><td>{p.unit_price}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEdit(p)}>편집</button> <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={async () => { if (confirm('삭제할까요?')) { const x = await deactivateRow('products', p.id, paths); notify(x.msg); r.refresh(); } }}>삭제</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>등록된 상품 없음</td></tr>}</tbody></table><div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>줄을 끌어서 놓으면 직원 화면의 순서가 바뀝니다.</div></div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? `편집 — ${edit.name}` : '상품 추가'}</h3>
          <form key={edit?.id ?? 'new'} action={async fd => { const x = await upsertRow('products', fd, ['sort_order'], paths); notify(x.msg); if (x.ok) { setEdit(null); r.refresh(); } }} style={{ display: 'grid', gap: 8 }}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}><input name="name" placeholder="상품명" defaultValue={edit?.name ?? ''} required /><input name="category" placeholder="카테고리" defaultValue={edit?.category ?? ''} /></div>
            <input name="unit_price" placeholder="단가 (예: 6,000원/건)" defaultValue={edit?.unit_price ?? ''} />
            <textarea name="description" rows={2} placeholder="상품 설명" defaultValue={edit?.description ?? ''} style={ta} />
            <textarea name="intake_process" rows={2} placeholder="접수 절차 (예: 견적 → 계약 → 원고 → 배포 → 리포트)" defaultValue={edit?.intake_process ?? ''} style={ta} />
            <textarea name="required_materials" rows={2} placeholder="고객에게 받을 자료" defaultValue={edit?.required_materials ?? ''} style={ta} />
            <input type="hidden" name="sort_order" value={edit?.sort_order ?? rows.length + 1} />
            <input name="caution" placeholder="주의사항" defaultValue={edit?.caution ?? ''} />
            <div style={{ display: 'flex', gap: 8 }}><button className="btn">{edit ? '저장' : '추가'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>취소</button>}</div>
          </form></div>
      </div>
    </div>
  );
}
