'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { mdAdd, mdAssign, mdUpdate, mdDelete, type MetaLead, type MetaIn } from './actions';

const STATUSES = ['미연락', '부재', '상담중', '결제', '허수', '중복', '종료'];
const SC: Record<string, string> = { 미연락: '#175CD3', 부재: '#B54708', 상담중: '#067647', 결제: '#B42318', 허수: '#667085', 중복: '#98A2B3', 종료: '#667085' };
const BG: Record<string, string> = { 결제: '#FFF27A', 허수: '#F0F2F5', 중복: '#F0F2F5', 종료: '#F7F8FA' };
const HEAD: [keyof MetaIn, RegExp][] = [['received_on', /접수|날짜|일자|일시|등록/], ['source', /구분|경로|매체|유입/], ['name', /이름|성함|상호|업체|고객/], ['phone', /전화|연락처|번호|휴대/], ['product', /상품|서비스|종류/], ['inquiry', /문의|내용|메모|요청/], ['url', /url|링크|주소|스토어/i]];
const ORDER: (keyof MetaIn)[] = ['received_on', 'source', 'name', 'phone', 'product', 'inquiry', 'url'];
const p2 = (n: number) => String(n).padStart(2, '0');
function toDay(v: any): string | null {
  if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
  const m = String(v ?? '').trim().match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/); if (m) return `${m[1]}-${p2(+m[2])}-${p2(+m[3])}`;
  const s = String(v ?? '').trim().match(/^(\d{1,2})[.\-/]\s*(\d{1,2})/); return s ? `${new Date().getFullYear()}-${p2(+s[1])}-${p2(+s[2])}` : null;
}
/** 표(2차원) → 문의 목록. 첫 줄이 제목이면 제목 이름으로, 아니면 「접수일·구분·이름·전화·상품·문의내용·URL」 순서로 읽는다 */
function parseGrid(g: any[][]): MetaIn[] {
  const rows = g.filter(r => r.some(c => String(c ?? '').trim())); if (!rows.length) return [];
  const h = rows[0].map(c => String(c ?? '').trim()); const isHead = h.some(c => /전화|연락처|이름|성함/.test(c)) && !h.some(c => /\d{3,4}[- ]?\d{4}/.test(c));
  const map: Partial<Record<keyof MetaIn, number>> = {};
  if (isHead) h.forEach((c, i) => { for (const [k, re] of HEAD) if (map[k] == null && re.test(c)) { map[k] = i; break; } }); else ORDER.forEach((k, i) => { map[k] = i; });
  return (isHead ? rows.slice(1) : rows).map(r => { const v = (k: keyof MetaIn) => map[k] == null ? '' : r[map[k]!]; const st = (k: keyof MetaIn) => String(v(k) ?? '').trim();
    return { received_on: toDay(v('received_on')), source: st('source'), name: st('name'), phone: st('phone'), product: st('product'), inquiry: st('inquiry'), url: st('url') }; }).filter(r => r.name || r.phone);
}
export default function MetaDbClient({ rows: init, people, owner, lead, boss, meId, today }: { rows: MetaLead[]; people: { id: string; name: string; role: string }[]; owner: string; lead: boolean; boss: boolean; meId: string; today: string }) {
  const router = useRouter(); const [rows, setRows] = useState(init); const [st, setSt] = useState('전체'); const [q, setQ] = useState(''); const [show, setShow] = useState(100);
  const [sel, setSel] = useState<Set<number>>(new Set()); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState(''); const [parsed, setParsed] = useState<MetaIn[]>([]); const [to, setTo] = useState('auto'); const [moveTo, setMoveTo] = useState(''); const fileRef = useRef<HTMLInputElement>(null);
  const nameOf = useMemo(() => new Map(people.map(p => [p.id, p.name])), [people]);
  const cnt = useMemo(() => { const m: Record<string, number> = {}; for (const r of rows) m[r.status] = (m[r.status] ?? 0) + 1; return m; }, [rows]);
  const due = rows.filter(r => r.next_on && r.next_on <= today && !['결제', '허수', '중복', '종료'].includes(r.status)).length;
  const list = useMemo(() => { const k = q.trim().toLowerCase(); const kd = k.replace(/\D/g, '');
    return rows.filter(r => (st === '전체' || (st === '오늘 연락' ? !!r.next_on && r.next_on <= today && !['결제', '허수', '중복', '종료'].includes(r.status) : r.status === st)) && (!k || r.name.toLowerCase().includes(k) || r.product.toLowerCase().includes(k) || r.inquiry.toLowerCase().includes(k) || r.memo.toLowerCase().includes(k) || (kd.length >= 3 && r.phone.replace(/\D/g, '').includes(kd)))); }, [rows, st, q, today]);
  const save = async (id: number, patch: Parameters<typeof mdUpdate>[1]) => { const r = await mdUpdate(id, patch); if (!r.ok) { notify(r.msg, 'bad'); return; } setRows(a => a.map(x => x.id === id ? r.row : x)); };
  const onFile = async (f: File) => { try { const XLSX = await import('xlsx'); const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true }); const out: MetaIn[] = []; for (const n of wb.SheetNames) out.push(...parseGrid(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) as any[][])); setParsed(out); setPaste(''); if (!out.length) notify('읽을 문의가 없습니다 — 이름이나 전화번호 칸이 있어야 합니다', 'bad'); } catch (e: any) { notify('엑셀을 읽지 못했습니다: ' + (e?.message ?? e), 'bad'); } if (fileRef.current) fileRef.current.value = ''; };
  const onPaste = (t: string) => { setPaste(t); setParsed(parseGrid(t.split(/\r?\n/).map(l => l.split('\t')))); };
  const add = async () => { if (!parsed.length || busy) return; setBusy(true); const r = await mdAdd(parsed, to); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { setParsed([]); setPaste(''); setOpen(false); router.refresh(); } };
  const assign = async () => { if (!sel.size || busy) return; setBusy(true); const r = await mdAssign([...sel], moveTo); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { setRows(a => a.map(x => sel.has(x.id) ? { ...x, owner_id: moveTo || null } : x)); setSel(new Set()); } };
  const del = async () => { if (!sel.size || busy) return; setBusy(true); const r = await mdDelete([...sel]); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { setRows(a => a.filter(x => !sel.has(x.id))); setSel(new Set()); } };
  const template = async () => { const XLSX = await import('xlsx'); const ws = XLSX.utils.aoa_to_sheet([['접수일', '구분', '이름', '전화번호', '상품', '문의내용', 'URL'], [today, '상담신청', '홍길동', '010-0000-0000', '쇼핑', '상위노출 문의드립니다', '']]); ws['!cols'] = [12, 12, 14, 16, 12, 50, 40].map(wch => ({ wch })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '인바운드'); XLSX.writeFile(wb, '인바운드DB_양식.xlsx'); };
  const pill = (k: string, n?: number) => <button key={k} onClick={() => { setSt(k); setShow(100); }} style={{ padding: '5px 12px', borderRadius: 999, border: '1px solid ' + (st === k ? '#1D2939' : '#D0D5DD'), background: st === k ? '#1D2939' : '#fff', color: st === k ? '#fff' : (SC[k] ?? '#344054'), fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{k}{n != null && <span style={{ marginLeft: 5, opacity: .75 }}>{n}</span>}</button>;
  const inp: React.CSSProperties = { border: '1px solid #D0D5DD', borderRadius: 6, padding: '5px 7px', fontSize: 13, background: '#fff' };
  const cols = lead ? 12 : 10;
  return <>
    {lead && <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <b style={{ fontSize: 13 }}>담당자</b>
      <select style={inp} value={owner} onChange={e => router.push('/meta-db' + (e.target.value === 'all' ? '' : '?u=' + e.target.value))}><option value="all">전체</option><option value="none">미배정</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}{p.role === 'manager' ? ' (팀장)' : ''}</option>)}</select>
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={() => setOpen(o => !o)}>{open ? '닫기' : '+ DB 올리기'}</button>
    </div>}
    {lead && open && <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <b>DB 올리기</b><span style={{ fontSize: 12.5, color: '#667085' }}>엑셀에서 복사해 붙여넣거나 파일을 올립니다. 제목 줄이 없으면 「접수일 · 구분 · 이름 · 전화번호 · 상품 · 문의내용 · URL」 순서로 읽습니다</span>
        <span style={{ flex: 1 }} /><button className="btn ghost" onClick={template}>양식 받기</button><button className="btn ghost" onClick={() => fileRef.current?.click()}>엑셀 올리기</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </div>
      <textarea value={paste} onChange={e => onPaste(e.target.value)} placeholder="여기에 붙여넣기 (엑셀 칸을 그대로 복사)" style={{ ...inp, width: '100%', minHeight: 90, fontFamily: 'inherit' }} />
      {parsed.length > 0 && <div style={{ marginTop: 8 }}>
        <div style={{ overflowX: 'auto', maxHeight: 180, border: '1px solid #EAECF0', borderRadius: 6 }}><table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}><tbody>{parsed.slice(0, 5).map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #F2F4F7' }}>{[r.received_on ?? today, r.source || '상담신청', r.name, r.phone, r.product, r.inquiry].map((c, j) => <td key={j} style={{ padding: '4px 8px', whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</td>)}</tr>)}</tbody></table></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}><b>{parsed.length}건</b> 읽음{parsed.length > 5 ? ' (위는 앞 5건)' : ''} →</span>
          <select style={inp} value={to} onChange={e => setTo(e.target.value)}><option value="auto">자동 배분 (미연락 적은 사람부터)</option><option value="">미배정으로 두기</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}에게</option>)}</select>
          <button className="btn" disabled={busy} onClick={add}>{busy ? '올리는 중…' : '등록'}</button>
        </div>
      </div>}
    </div>}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      {pill('전체', rows.length)}{due > 0 && pill('오늘 연락', due)}{STATUSES.map(k => pill(k, cnt[k] ?? 0))}
      <span style={{ flex: 1 }} /><input style={{ ...inp, width: 200 }} placeholder="이름 · 전화 · 내용 검색" value={q} onChange={e => { setQ(e.target.value); setShow(100); }} />
    </div>
    {lead && sel.size > 0 && <div className="card" style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#F5F8FF' }}>
      <b style={{ fontSize: 13 }}>{sel.size}건 선택</b>
      <select style={inp} value={moveTo} onChange={e => setMoveTo(e.target.value)}><option value="">미배정으로</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}에게</option>)}</select>
      <button className="btn" disabled={busy} onClick={assign}>배정</button>
      {boss && <button className="btn ghost" disabled={busy} style={{ color: '#B42318' }} onClick={del}>삭제</button>}
      <button className="btn ghost" onClick={() => setSel(new Set())}>선택 해제</button>
    </div>}
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: lead ? 1300 : 1160 }}>
        <thead><tr style={{ background: '#F9FAFB', textAlign: 'left', color: '#475467', fontSize: 12.5 }}>
          {lead && <th style={{ padding: '8px 6px 8px 12px', width: 30 }}><input type="checkbox" checked={list.length > 0 && list.slice(0, show).every(r => sel.has(r.id))} onChange={e => setSel(e.target.checked ? new Set(list.slice(0, show).map(r => r.id)) : new Set())} /></th>}
          {['접수일', '구분', '이름', '전화번호', '상품 · 문의', '상태', '결제 금액', '상품비', '다음 연락', '메모'].concat(lead ? ['담당자'] : []).map(h => <th key={h} style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {list.slice(0, show).map(r => { const mine = lead || r.owner_id === meId; return <tr key={r.id} style={{ borderTop: '1px solid #EAECF0', background: BG[r.status], verticalAlign: 'top' }}>
            {lead && <td style={{ padding: '8px 6px 8px 12px' }}><input type="checkbox" checked={sel.has(r.id)} onChange={e => setSel(s => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} /></td>}
            <td style={{ padding: 8, whiteSpace: 'nowrap', color: '#475467' }}>{r.received_on.slice(5).replace('-', '/')}{r.received_at && <div style={{ fontSize: 11.5, color: '#98A2B3' }}>{new Date(new Date(r.received_at).getTime() + 9 * 3600e3).toISOString().slice(11, 16)}</div>}</td>
            <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{r.source}</td>
            <td style={{ padding: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name || '—'}</td>
            <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{r.phone}</td>
            <td style={{ padding: 8, minWidth: 220, maxWidth: 340 }}>{r.product && <b style={{ marginRight: 6 }}>{r.product}</b>}<span style={{ color: '#344054', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.inquiry}</span>{r.url && <> <a href={/^https?:/.test(r.url) ? r.url : 'https://' + r.url} target="_blank" rel="noreferrer" style={{ color: '#175CD3' }}>링크</a></>}{r.inflow && <div style={{ fontSize: 11.5, color: '#98A2B3', marginTop: 2 }}>유입 {r.inflow.split(' / ')[0]}</div>}</td>
            <td style={{ padding: 8 }}><select disabled={!mine} style={{ ...inp, color: SC[r.status], fontWeight: 700 }} value={r.status} onChange={e => save(r.id, { status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></td>
            <td style={{ padding: 8 }}><input disabled={!mine} key={'a' + r.id + r.updated_at} style={{ ...inp, width: 110, textAlign: 'right' }} inputMode="numeric" placeholder={r.status === '결제' ? '금액 입력' : ''} defaultValue={r.paid_amt ? r.paid_amt.toLocaleString() : ''} onBlur={e => { const n = Number(e.target.value.replace(/[^\d]/g, '')) || null; if (n !== (r.paid_amt ?? null)) save(r.id, { paid_amt: n }); }} /></td>
            <td style={{ padding: 8 }}><input disabled={!mine} key={'c' + r.id + r.updated_at} style={{ ...inp, width: 100, textAlign: 'right' }} inputMode="numeric" placeholder={r.status === '결제' ? '상품비' : ''} defaultValue={r.cost_amt ? r.cost_amt.toLocaleString() : ''} onBlur={e => { const n = Number(e.target.value.replace(/[^\d]/g, '')) || null; if (n !== (r.cost_amt ?? null)) save(r.id, { cost_amt: n }); }} />
              {r.paid_amt != null && r.cost_amt != null && <div style={{ fontSize: 11.5, color: '#067647', textAlign: 'right', marginTop: 2 }}>마진 {(r.paid_amt - r.cost_amt).toLocaleString()}</div>}</td>
            <td style={{ padding: 8 }}><input disabled={!mine} type="date" style={{ ...inp, color: r.next_on && r.next_on <= today ? '#B42318' : undefined }} value={r.next_on ?? ''} onChange={e => save(r.id, { next_on: e.target.value || null })} /></td>
            <td style={{ padding: 8, minWidth: 220 }}><textarea disabled={!mine} key={'m' + r.id + r.updated_at} style={{ ...inp, width: '100%', minHeight: 34, fontFamily: 'inherit', resize: 'vertical' }} defaultValue={r.memo} onBlur={e => { if (e.target.value !== r.memo) save(r.id, { memo: e.target.value }); }} /></td>
            {lead && <td style={{ padding: 8, whiteSpace: 'nowrap', color: r.owner_id ? '#344054' : '#B54708' }}>{r.owner_id ? (nameOf.get(r.owner_id) ?? '(팀 밖)') : '미배정'}</td>}
          </tr>; })}
          {!list.length && <tr><td colSpan={cols} style={{ padding: 28, textAlign: 'center', color: '#98A2B3' }}>{rows.length ? '조건에 맞는 DB 가 없습니다' : lead ? '아직 올린 DB 가 없습니다 — 위 「+ DB 올리기」' : '아직 배정된 DB 가 없습니다'}</td></tr>}
        </tbody>
      </table>
    </div>
    {list.length > show && <div style={{ textAlign: 'center', marginTop: 10 }}><button className="btn ghost" onClick={() => setShow(s => s + 100)}>100건 더 보기 ({show}/{list.length})</button></div>}
  </>;
}
