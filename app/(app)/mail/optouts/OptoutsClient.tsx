'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { addOptouts, removeOptout } from './actions';
type Row = { email: string; code: string | null; created_at: string };
const src = (c: string | null) => c === 'page' ? '수신거부 페이지' : c === 'manual' ? '직접 추가' : '메일 속 링크';
const kst = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
export default function OptoutsClient({ rows }: { rows: Row[] }) {
  const r = useRouter(); const [q, setQ] = useState(''); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [url, setUrl] = useState('');
  const list = useMemo(() => { const k = q.trim().toLowerCase(); return k ? rows.filter(x => x.email.includes(k)) : rows; }, [rows, q]);
  const n = (c: string) => rows.filter(x => src(x.code) === c).length;
  const copy = async (t: string, ok: string) => { try { await navigator.clipboard.writeText(t); notify(ok, 'ok'); } catch { notify('복사 실패 — 직접 선택해 복사해 주세요', 'bad'); } };
  const page = url || (typeof window !== 'undefined' ? `${window.location.origin}/unsub` : '/unsub');
  return <div style={{ display: 'grid', gap: 18 }}>
    <h1 style={{ fontSize: 20, margin: 0 }}>수신거부 목록 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>전체 {rows.length.toLocaleString()}개 · 페이지 {n('수신거부 페이지')} · 메일 속 링크 {n('메일 속 링크')} · 직접 추가 {n('직접 추가')}</span></h1>
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <b>수신거부 페이지 주소</b>
      <div className="cell-sub">수동(묶음) 발송 본문 맨 아래에 이 주소를 적어 두면, 받는 사람이 자기 이메일을 직접 넣어 신청합니다. 신청된 주소는 자동 발송·수동 뽑기에서 바로 빠집니다.</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><input readOnly value={page} onFocus={e => { setUrl(page); e.currentTarget.select(); }} style={{ flex: 1, minWidth: 240 }} />
        <button type="button" className="btn ghost" onClick={() => copy(page, '주소 복사됨')}>주소 복사</button>
        <button type="button" className="btn ghost" onClick={() => copy(`수신을 원치 않으시면 아래 주소에서 이메일을 입력해 주세요.\n${page}`, '문구 복사됨')}>안내 문구째 복사</button></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'start' }}>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="이메일 검색" style={{ flex: 1, minWidth: 180 }} />
          <span className="cell-sub">{list.length.toLocaleString()}개</span>
          <button type="button" className="btn ghost" onClick={() => copy(list.map(x => x.email).join('\n'), `${list.length}개 복사됨`)}>보이는 주소 전체 복사</button>
        </div>
        <div style={{ maxHeight: 620, overflow: 'auto' }}><table><thead><tr><th>이메일</th><th>들어온 곳</th><th>신청 시각</th><th></th></tr></thead>
          <tbody>{list.slice(0, 2000).map(x => <tr key={x.email}><td>{x.email}</td><td className="cell-sub">{src(x.code)}</td><td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{kst(x.created_at)}</td>
            <td><button type="button" className="btn ghost xs" disabled={busy} onClick={async () => { if (!window.confirm(`${x.email}\n목록에서 빼면 다시 발송 대상이 됩니다. 뺄까요?`)) return; setBusy(true); const a = await removeOptout(x.email); setBusy(false); notify(a.msg, a.ok ? 'ok' : 'bad'); if (a.ok) r.refresh(); }}>삭제</button></td></tr>)}
            {list.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>없음</td></tr>}</tbody></table></div>
        {list.length > 2000 && <div className="cell-sub" style={{ marginTop: 8 }}>앞 2,000개만 보입니다 — 검색으로 좁혀 주세요 (복사는 전체가 됩니다).</div>}
      </div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <b>직접 추가</b>
        <div className="cell-sub">전화·카톡·답장으로 "보내지 말라"고 한 주소를 넣습니다. 여러 개는 줄바꿈이나 쉼표로.</div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder={'a@example.com\nb@example.com'} />
        <button type="button" className="btn" disabled={busy || !text.trim()} onClick={async () => { setBusy(true); const a = await addOptouts(text); setBusy(false); notify(a.msg, a.ok ? 'ok' : 'bad'); if (a.ok) { setText(''); r.refresh(); } }}>{busy ? '처리 중…' : '추가'}</button>
      </div>
    </div>
  </div>;
}
