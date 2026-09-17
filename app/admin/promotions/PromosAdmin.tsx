'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { upsertRow, deactivateRow } from '@/lib/adminCrud';
type P = { id: number; title: string; body: string | null; link_url: string | null; starts_at: string | null; ends_at: string | null; sort_order: number };
export default function PromosAdmin({ rows }: { rows: P[] }) {
  const r = useRouter(); const [edit, setEdit] = useState<P | null>(null); const paths = ['/admin/promotions', '/'];
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>프로모션 (메인 배너)</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18 }}>
        <div className="card"><table><thead><tr><th>제목</th><th>기간</th><th>정렬</th><th></th></tr></thead><tbody>{rows.map(p => <tr key={p.id}><td><b>{p.title}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.body}</div></td><td style={{ whiteSpace: 'nowrap' }}>{p.starts_at ?? '-'} ~ {p.ends_at ?? '-'}</td><td>{p.sort_order}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEdit(p)}>편집</button> <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={async () => { if (confirm('종료 처리할까요?')) { const x = await deactivateRow('promotions', p.id, paths); notify(x.msg); r.refresh(); } }}>종료</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>없음</td></tr>}</tbody></table></div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? '편집' : '프로모션 추가'}</h3>
          <form key={edit?.id ?? 'new'} action={async fd => { const x = await upsertRow('promotions', fd, ['sort_order'], paths); notify(x.msg); if (x.ok) { setEdit(null); r.refresh(); } }} style={{ display: 'grid', gap: 8 }}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <input name="title" placeholder="제목" defaultValue={edit?.title ?? ''} required />
            <textarea name="body" rows={2} placeholder="내용" defaultValue={edit?.body ?? ''} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8 }}><input type="date" name="starts_at" defaultValue={edit?.starts_at ?? ''} /><input type="date" name="ends_at" defaultValue={edit?.ends_at ?? ''} /><input name="sort_order" type="number" defaultValue={edit?.sort_order ?? rows.length + 1} /></div>
            <input name="link_url" placeholder="링크 (선택)" defaultValue={edit?.link_url ?? ''} />
            <div style={{ display: 'flex', gap: 8 }}><button className="btn">{edit ? '저장' : '추가'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>취소</button>}</div>
          </form></div>
      </div>
    </div>
  );
}
