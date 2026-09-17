'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { upsertRow, deactivateRow } from '@/lib/adminCrud';
type D = { id: number; owner_id: string | null; title: string; detail: string | null; cycle: string | null; systems: string | null; backup_id: string | null; sort_order: number };
export default function DutiesAdmin({ rows, people }: { rows: D[]; people: { id: string; name: string; is_mgmt: boolean }[] }) {
  const r = useRouter(); const [edit, setEdit] = useState<D | null>(null); const paths = ['/admin/duties']; const nm = (id: string | null) => people.find(p => p.id === id)?.name ?? '-';
  const mgmt = people.filter(p => p.is_mgmt); const list = mgmt.length ? mgmt : people;
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>관리팀 담당업무 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>관리팀 체크된 인원 {mgmt.map(p => p.name).join(' · ') || '없음'}</span></h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
        <div className="card"><table><thead><tr><th>담당</th><th>업무</th><th>주기</th><th>시스템</th><th>백업</th><th></th></tr></thead><tbody>{rows.map(d => <tr key={d.id}><td><b>{nm(d.owner_id)}</b></td><td>{d.title}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{d.detail}</div></td><td>{d.cycle}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{d.systems}</td><td>{nm(d.backup_id)}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEdit(d)}>편집</button> <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={async () => { if (confirm('삭제할까요?')) { const x = await deactivateRow('mgmt_duties', d.id, paths); notify(x.msg); r.refresh(); } }}>삭제</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>없음</td></tr>}</tbody></table></div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? '편집' : '업무 추가'}</h3>
          <form key={edit?.id ?? 'new'} action={async fd => { const x = await upsertRow('mgmt_duties', fd, ['sort_order'], paths); notify(x.msg); if (x.ok) { setEdit(null); r.refresh(); } }} style={{ display: 'grid', gap: 8 }}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><select name="owner_id" defaultValue={edit?.owner_id ?? ''} required><option value="">담당자</option>{list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select name="backup_id" defaultValue={edit?.backup_id ?? ''}><option value="">백업 담당</option>{list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <input name="title" placeholder="업무명" defaultValue={edit?.title ?? ''} required />
            <textarea name="detail" rows={2} placeholder="상세" defaultValue={edit?.detail ?? ''} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 70px', gap: 8 }}><input name="cycle" placeholder="주기" defaultValue={edit?.cycle ?? ''} /><input name="systems" placeholder="관련 시스템·계정" defaultValue={edit?.systems ?? ''} /><input name="sort_order" type="number" defaultValue={edit?.sort_order ?? rows.length + 1} /></div>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn">{edit ? '저장' : '추가'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>취소</button>}</div>
          </form></div>
      </div>
    </div>
  );
}
