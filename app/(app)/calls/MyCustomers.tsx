'use client';
// 내 고객 — 직원이 직접 적는 기존 고객. 여기 있는 업체(이름 또는 010 번호 일치)는 콜 리스트에 안 올라옴
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { Section, Empty } from '@/components/ui';
import { addMyCustomer, removeMyCustomer, updateMyCustomer } from './customerActions';
export type MyCustomer = { id: number; name: string; phone: string; memo: string; created_at: string; who?: string };

export default function MyCustomers({ rows, canEdit, title = '내 고객 (콜 리스트 제외)' }: { rows: MyCustomer[]; canEdit: boolean; title?: string }) {
  const r = useRouter(); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [edit, setEdit] = useState<MyCustomer | null>(null);
  const save = async () => { if (!edit) return; setBusy(true); const x = await updateMyCustomer(edit.id, edit.name, edit.phone, edit.memo); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setEdit(null); r.refresh(); } };
  const add = async (fd: FormData) => { setBusy(true); const x = await addMyCustomer(fd); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const del = async (c: MyCustomer) => { if (!confirm(`${c.name} 을(를) 내 고객에서 뺄까요? (다시 콜 리스트 대상이 됨)`)) return; setBusy(true); const x = await removeMyCustomer(c.id); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const k = q.trim().toLowerCase(); const list = k ? rows.filter(c => `${c.name} ${c.phone} ${c.memo} ${c.who ?? ''}`.toLowerCase().includes(k)) : rows;
  return (
    <Section title={title} sub={`${rows.length}곳 · 업체명 또는 전화가 같으면 자동으로 「대상 아님」 처리`} right={<span style={{ display: 'inline-flex', gap: 6 }}><input value={q} onChange={e => setQ(e.target.value)} placeholder="검색" style={{ padding: '5px 10px', width: 140 }} />{canEdit && <button type="button" className="btn ghost" onClick={() => setOpen(v => !v)}>{open ? '닫기' : '+ 고객 추가'}</button>}</span>} flush>
      {open && canEdit && <form onSubmit={e => { e.preventDefault(); add(new FormData(e.currentTarget)); (e.target as HTMLFormElement).reset(); }} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr auto', gap: 8, padding: '12px 18px', borderBottom: '1px solid var(--line)', background: 'var(--wait-soft)' }}>
        <input name="name" required placeholder="업체명 (스마트스토어명)" style={{ padding: '7px 10px' }} /><input name="phone" placeholder="010-0000-0000 (선택)" style={{ padding: '7px 10px' }} /><input name="memo" placeholder="메모 (상품·계약 시기 등)" style={{ padding: '7px 10px' }} /><button type="submit" className="btn" disabled={busy}>추가</button>
        <div className="cell-sub" style={{ gridColumn: '1 / -1' }}>여러 개 한 번에: 업체명 칸에 줄바꿈으로 여러 업체를 붙여넣어도 됨 (전화는 비움)</div>
      </form>}
      {list.length ? <table><thead><tr><th>업체</th><th>전화</th><th>메모</th>{rows.some(c => c.who) && <th>담당</th>}<th>등록</th>{canEdit && <th></th>}</tr></thead><tbody>
        {list.map(c => edit?.id === c.id ? <tr key={c.id} style={{ background: 'var(--wait-soft)' }}><td><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={{ padding: '5px 8px', width: '100%' }} /></td><td><input value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} placeholder="010-0000-0000" style={{ padding: '5px 8px', width: '100%' }} /></td><td><input value={edit.memo} onChange={e => setEdit({ ...edit, memo: e.target.value })} style={{ padding: '5px 8px', width: '100%' }} /></td>{rows.some(x => x.who) && <td>{c.who}</td>}<td className="cell-sub num">{c.created_at.slice(0, 10)}</td><td style={{ whiteSpace: 'nowrap' }}><button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} disabled={busy} onClick={save}>저장</button> <button type="button" className="btn ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setEdit(null)}>취소</button></td></tr>
          : <tr key={c.id}><td><b>{c.name}</b></td><td className="num">{c.phone || '-'}</td><td className="cell-sub">{c.memo}</td>{rows.some(x => x.who) && <td>{c.who}</td>}<td className="cell-sub num">{c.created_at.slice(0, 10)}</td>{canEdit && <td style={{ whiteSpace: 'nowrap' }}><button type="button" className="btn ghost" style={{ padding: '2px 8px', fontSize: 12 }} disabled={busy} onClick={() => setEdit({ ...c })}>수정</button> <button type="button" className="btn ghost" style={{ padding: '2px 8px', fontSize: 12 }} disabled={busy} onClick={() => del(c)}>빼기</button></td>}</tr>)}
      </tbody></table> : <div style={{ padding: 16 }}><Empty>{rows.length ? '검색 결과 없음' : '아직 적은 고객이 없습니다. 기존 고객을 적어두면 콜 리스트에 안 올라옵니다.'}</Empty></div>}
    </Section>
  );
}
