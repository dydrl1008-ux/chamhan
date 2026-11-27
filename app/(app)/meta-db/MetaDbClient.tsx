'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import MetaPayBox from '@/components/MetaPayBox';
import { mdAdd, mdAssign, mdUpdate, mcList, mcAdd, type MetaLead, type MetaIn, type MetaContact } from './actions';

const STATUSES = ['미연락', '부재', '상담중', '보류', '결제', '종료', '허수', '중복'];
const GRADES = ['', 'S', 'A', 'B', 'C', 'D', 'E', 'F']; const WAYS = ['전화', '카톡', '문자', '기타']; const WAYS3 = ['카톡', '전화', '문자']; const RESULTS = ['부재', '통화', '메시지 남김', '자료 발송', '거절'];
const GBG: Record<string, string> = { S: '#FFD9D5', A: '#FFE7D1', B: '#DFF3E1', C: '#DCEBFD', E: '#F0F2F5', F: '#E2E5EA' };   // 등급별 줄 색 (내 DB 와 같은 색)
const SC: Record<string, string> = { 미연락: '#175CD3', 부재: '#B54708', 상담중: '#067647', 보류: '#6941C6', 결제: '#B42318', 허수: '#667085', 중복: '#98A2B3', 종료: '#667085' };
const BG: Record<string, string> = { 결제: '#FFF27A', 허수: '#F0F2F5', 중복: '#F0F2F5', 종료: '#F7F8FA' };
const SRC: Record<string, [string, string]> = { 상담신청: ['#DBEAFE', '#1D4ED8'], '바이럴 접수': ['#FCE7F3', '#BE185D'] };   // 들어온 시트(탭)별 배지 색
/** 어떻게 들어왔나 — 접수 ID 로 구분: 시트 자동 접수 / 예전 시트 이관 / 직접 올림 */
const cameBy = (id: string | null) => !id ? '직접 올림' : /^old_/.test(id) ? '시트 이관' : '자동 접수';
const CH: Record<string, string> = { ig: '인스타그램', fb: '페이스북', an: '오디언스 네트워크', th: '스레드', msg: '메신저' };
/** 유입 경로를 읽을 수 있게 — 'ig / paid / …' → '인스타그램 광고', 'ig / social / link_in_bio' → '인스타그램 프로필 링크' */
const inflowLabel = (v: string) => { const [a = '', b = ''] = v.split(' / ').map(x => x.trim()); const ch = CH[a] ?? (/naver/i.test(a) ? '네이버 검색' : a); return ch + (b === 'paid' ? ' 광고' : b === 'social' ? ' 프로필 링크' : ''); };
const HEAD: [keyof MetaIn, RegExp][] = [['received_on', /접수|날짜|일자|일시|등록/], ['source', /구분|경로|매체|유입/], ['name', /이름|성함|상호|업체|고객/], ['phone', /전화|연락처|번호|휴대/], ['product', /상품|서비스|종류/], ['inquiry', /문의|내용|메모|요청/], ['url', /url|링크|주소|스토어/i]];
const ORDER: (keyof MetaIn)[] = ['received_on', 'source', 'name', 'phone', 'product', 'inquiry', 'url'];
const p2 = (n: number) => String(n).padStart(2, '0');
const hm = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ');
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
  useEffect(() => { setRows(init); setSel(new Set()); setShow(100); }, [init]);   // 담당자를 바꾸거나 새로 불러오면 목록도 따라 바뀐다 (처음 받은 목록을 붙들고 있던 문제)
  const [pay, setPay] = useState<number | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set()); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState(''); const [parsed, setParsed] = useState<MetaIn[]>([]); const [to, setTo] = useState('auto'); const [moveTo, setMoveTo] = useState(''); const fileRef = useRef<HTMLInputElement>(null);
  const nameOf = useMemo(() => new Map(people.map(p => [p.id, p.name])), [people]);
  const cnt = useMemo(() => { const m: Record<string, number> = {}; for (const r of rows) m[r.status] = (m[r.status] ?? 0) + 1; return m; }, [rows]);
  const isNow = (r: MetaLead) => !!r.owner_id && ((r.status === '미연락' && !r.first_contact_at) || (!!r.next_on && r.next_on <= today && !['결제', '허수', '중복', '종료'].includes(r.status)));   // 처음 연락할 건 + 약속 시각이 된 건
  const nowCall = rows.filter(isNow).length;
  const [logOf, setLogOf] = useState<number | null>(null); const [logs, setLogs] = useState<MetaContact[] | null>(null); const [lf, setLf] = useState({ way: '전화', result: '통화', note: '', next_on: '', alarm_time: '' });
  const toggleLog = async (r: MetaLead) => { if (logOf === r.id) { setLogOf(null); return; } setLogOf(r.id); setLogs(null); setLf({ way: '전화', result: '통화', note: '', next_on: '', alarm_time: '' }); const x = await mcList(r.id); if (!x.ok) { notify(x.msg, 'bad'); setLogs([]); return; } setLogs(x.rows); };
  const addLog = async (r: MetaLead) => { if (busy) return; setBusy(true); const x = await mcAdd(r.id, { way: lf.way, result: lf.result, note: lf.note, ...(lf.next_on ? { next_on: lf.next_on, alarm_time: lf.alarm_time } : {}) }); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (!x.ok) return; setRows(a => a.map(y => y.id === r.id ? x.row : y)); setLogs(l => [...(l ?? []), x.contact]); setLf({ way: lf.way, result: '통화', note: '', next_on: '', alarm_time: '' }); };
  const list = useMemo(() => { const k = q.trim().toLowerCase(); const kd = k.replace(/\D/g, '');
    return rows.filter(r => (st === '전체' || (st === '지금 연락' ? isNow(r) : r.status === st)) && (!k || r.name.toLowerCase().includes(k) || r.product.toLowerCase().includes(k) || r.inquiry.toLowerCase().includes(k) || r.memo.toLowerCase().includes(k) || r.care_note.toLowerCase().includes(k) || (kd.length >= 3 && r.phone.replace(/\D/g, '').includes(kd)))); }, [rows, st, q, today]);
  const save = async (id: number, patch: Parameters<typeof mdUpdate>[1]) => { const r = await mdUpdate(id, patch); if (!r.ok) { notify(r.msg, 'bad'); return; } setRows(a => a.map(x => x.id === id ? r.row : x)); };
  const onFile = async (f: File) => { try { const XLSX = await import('xlsx'); const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true }); const out: MetaIn[] = []; for (const n of wb.SheetNames) out.push(...parseGrid(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) as any[][])); setParsed(out); setPaste(''); if (!out.length) notify('읽을 문의가 없습니다 — 이름이나 전화번호 칸이 있어야 합니다', 'bad'); } catch (e: any) { notify('엑셀을 읽지 못했습니다: ' + (e?.message ?? e), 'bad'); } if (fileRef.current) fileRef.current.value = ''; };
  const onPaste = (t: string) => { setPaste(t); setParsed(parseGrid(t.split(/\r?\n/).map(l => l.split('\t')))); };
  const add = async () => { if (!parsed.length || busy) return; setBusy(true); const r = await mdAdd(parsed, to); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { setParsed([]); setPaste(''); setOpen(false); router.refresh(); } };
  const assign = async () => { if (!sel.size || busy) return; setBusy(true); const r = await mdAssign([...sel], moveTo); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { setRows(a => a.map(x => sel.has(x.id) ? { ...x, owner_id: moveTo || null } : x)); setSel(new Set()); } };
  const template = async () => { const XLSX = await import('xlsx'); const ws = XLSX.utils.aoa_to_sheet([['접수일', '구분', '이름', '전화번호', '상품', '문의내용', 'URL'], [today, '상담신청', '홍길동', '010-0000-0000', '쇼핑', '상위노출 문의드립니다', '']]); ws['!cols'] = [12, 12, 14, 16, 12, 50, 40].map(wch => ({ wch })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '인바운드'); XLSX.writeFile(wb, '인바운드DB_양식.xlsx'); };
  const pill = (k: string, n?: number) => <button key={k} onClick={() => { setSt(k); setShow(100); }} style={{ padding: '5px 12px', borderRadius: 999, border: '1px solid ' + (st === k ? '#1D2939' : '#D0D5DD'), background: st === k ? '#1D2939' : '#fff', color: st === k ? '#fff' : (SC[k] ?? '#344054'), fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{k}{n != null && <span style={{ marginLeft: 5, opacity: .75 }}>{n}</span>}</button>;
  const inp: React.CSSProperties = { border: '1px solid #D0D5DD', borderRadius: 6, padding: '5px 7px', fontSize: 13, background: '#fff' };
  const cols = lead ? 12 : 10;
  return <>
    {pay != null && <MetaPayBox leadId={pay} today={today} onClose={() => setPay(null)} onChanged={x => setRows(rs => rs.map(y => y.id === pay ? { ...y, paid_amt: x.amt, cost_amt: x.cost, status: x.paid ? '결제' : y.status } : y))} />}
    {lead && <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <b style={{ fontSize: 13 }}>담당자</b>
      <select style={inp} value={owner} onChange={e => router.push('/meta-db' + (e.target.value === 'all' ? '' : '?u=' + e.target.value))}><option value="all">전체</option><option value="none">미배정</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}{p.role === 'manager' ? ' (팀장)' : ''}</option>)}</select>
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={() => setOpen(o => !o)}>{open ? '닫기' : '+ DB 올리기'}</button>
    </div>}
    {lead && open && <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <b>DB 직접 올리기</b><span style={{ fontSize: 12.5, color: '#667085' }}>엑셀에서 복사해 붙여넣거나 파일을 올립니다. 제목 줄이 없으면 「접수일 · 구분 · 이름 · 전화번호 · 상품 · 문의내용 · URL」 순서로 읽습니다</span>
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
      {pill('전체', rows.length)}{nowCall > 0 && pill('지금 연락', nowCall)}{STATUSES.map(k => pill(k, cnt[k] ?? 0))}
      <span style={{ flex: 1 }} /><input style={{ ...inp, width: 220 }} placeholder="이름 · 전화 · 내용 검색" value={q} onChange={e => { setQ(e.target.value); setShow(100); }} />
    </div>
    {lead && sel.size > 0 && <div className="card" style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#F5F8FF' }}>
      <b style={{ fontSize: 13 }}>{sel.size}건 선택</b>
      <select style={inp} value={moveTo} onChange={e => setMoveTo(e.target.value)}><option value="">미배정으로</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}에게</option>)}</select>
      <button className="btn" disabled={busy} onClick={assign}>배정 · 넘기기</button>
      <span style={{ fontSize: 12.5, color: '#667085' }}>연락 기록 · 관리 내용 · 결제 내역이 그대로 따라갑니다</span>
      <button className="btn ghost" onClick={() => setSel(new Set())}>선택 해제</button>
    </div>}
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: lead ? 1560 : 1430 }}>
        <thead><tr style={{ background: '#F9FAFB', textAlign: 'left', color: '#475467', fontSize: 12.5 }}>
          {lead && <th style={{ padding: '8px 6px 8px 12px', width: 30 }}><input type="checkbox" checked={list.length > 0 && list.slice(0, show).every(r => sel.has(r.id))} onChange={e => setSel(e.target.checked ? new Set(list.slice(0, show).map(r => r.id)) : new Set())} /></th>}
          {['접수 · 시트', '고객', '첫 문의 내용', '연락방식', '등급', '상태', '⏰ 다음 연락', '연락 기록', '관리 내용 (인수인계)', '결제 (정산 자동)'].concat(lead ? ['담당자'] : []).map(h => <th key={h} style={{ padding: 8, whiteSpace: 'nowrap' }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {list.slice(0, show).map(r => { const mine = lead || r.owner_id === meId; const off = ['허수', '중복', '종료'].includes(r.status); const late = !!r.next_on && r.next_on <= today && !['결제', '허수', '중복', '종료'].includes(r.status); const chs = r.channel ? r.channel.split(',').filter(Boolean) : [];
            return <Fragment key={r.id}><tr style={{ borderTop: '1px solid #EAECF0', background: r.status === '결제' ? '#FFF27A' : off ? '#F2F4F7' : GBG[r.grade], opacity: off ? .6 : 1, verticalAlign: 'top' }}>
            {lead && <td style={{ padding: '8px 6px 8px 12px' }}><input type="checkbox" checked={sel.has(r.id)} onChange={e => setSel(x => { const n = new Set(x); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} /></td>}
            <td style={{ padding: 8, whiteSpace: 'nowrap', color: '#475467' }}>{r.received_on.slice(5).replace('-', '/')}{r.received_at && <div style={{ fontSize: 11.5, color: '#98A2B3' }}>{hm(r.received_at).slice(6)}</div>}<div style={{ marginTop: 4 }}><span title="들어온 시트" style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: (SRC[r.source] ?? ['#EAECF0', '#344054'])[0], color: (SRC[r.source] ?? ['#EAECF0', '#344054'])[1] }}>{r.source || '구분 없음'}</span></div><div style={{ fontSize: 11, color: '#98A2B3', marginTop: 2 }}>{cameBy(r.ext_id)}</div></td>
            <td style={{ padding: 8, whiteSpace: 'nowrap' }}><b>{r.name || '—'}</b><div>{r.phone}</div>{r.product && <div style={{ fontSize: 12, fontWeight: 700, color: '#6941C6' }}>{r.product}</div>}</td>
            <td style={{ padding: 8, minWidth: 190, maxWidth: 280 }}><span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.inquiry || '—'}</span>{r.url && <> <a href={/^https?:/.test(r.url) ? r.url : 'https://' + r.url} target="_blank" rel="noreferrer" style={{ color: '#175CD3' }}>링크</a></>}{r.inflow && <div style={{ fontSize: 11.5, color: '#98A2B3', marginTop: 2 }}>유입 {inflowLabel(r.inflow)}</div>}</td>
            <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{WAYS3.map(c => <label key={c} style={{ display: 'block', fontSize: 12.5 }}><input type="checkbox" disabled={!mine} checked={chs.includes(c)} onChange={e => save(r.id, { channel: (e.target.checked ? [...chs, c] : chs.filter(x => x !== c)).join(',') })} /> {c}</label>)}</td>
            <td style={{ padding: 8 }}><select disabled={!mine} style={{ ...inp, width: 52, fontWeight: 800, background: 'rgba(255,255,255,.7)' }} value={r.grade} onChange={e => save(r.id, { grade: e.target.value })}>{GRADES.map(g => <option key={g} value={g}>{g || '-'}</option>)}</select></td>
            <td style={{ padding: 8 }}><select disabled={!mine} style={{ ...inp, color: SC[r.status], fontWeight: 700 }} value={r.status} onChange={e => save(r.id, { status: e.target.value })}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select></td>
            <td style={{ padding: 8, whiteSpace: 'nowrap' }}><input disabled={!mine} type="date" style={{ ...inp, display: 'block', color: late ? '#B42318' : undefined, fontWeight: late ? 700 : 400 }} value={r.next_on ?? ''} onChange={e => save(r.id, { next_on: e.target.value || null })} />{r.next_on && <input disabled={!mine} type="time" style={{ ...inp, marginTop: 3 }} value={r.alarm_time} onChange={e => save(r.id, { alarm_time: e.target.value })} title="이 시각에 알림이 갑니다" />}</td>
            <td style={{ padding: 8, minWidth: 200, maxWidth: 260 }}>
              {r.first_contact_at ? <div style={{ fontSize: 12, color: '#667085' }}><b style={{ color: '#1D2939' }}>{r.contacts || 1}차</b> · {hm(r.last_contact_at ?? r.first_contact_at)}</div> : r.owner_id ? <div style={{ fontSize: 12, color: '#B42318', fontWeight: 700 }}>첫 연락 전{r.assigned_at ? ' · 배정 ' + hm(r.assigned_at) : ''}</div> : null}
              {r.memo && <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>{r.memo.length > 70 ? r.memo.slice(0, 70) + '…' : r.memo}</div>}
              <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11.5, marginTop: 4 }} onClick={() => toggleLog(r)}>{logOf === r.id ? '접기' : mine ? '+ 연락 기록' : '기록 보기'}</button></td>
            <td style={{ padding: 8, minWidth: 220 }}><textarea disabled={!mine} key={'c' + r.id + r.updated_at} placeholder="고객 성향 · 진행 키워드 · 약속한 것 · 주의할 점" style={{ ...inp, width: '100%', minHeight: 58, fontFamily: 'inherit', resize: 'vertical', background: 'rgba(255,255,255,.7)' }} defaultValue={r.care_note} onBlur={e => { if (e.target.value !== r.care_note) save(r.id, { care_note: e.target.value }); }} /></td>
            <td style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.paid_amt != null ? <><b>{r.paid_amt.toLocaleString()}</b><div style={{ fontSize: 11.5, color: '#067647', fontWeight: 700 }}>마진 {(r.paid_amt - (r.cost_amt ?? 0)).toLocaleString()}</div></> : <span style={{ color: '#98A2B3' }}>—</span>}
              {(boss || r.paid_amt != null) && r.owner_id && <div><button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11.5, marginTop: 2 }} onClick={() => setPay(r.id)}>{r.paid_amt != null ? '결제 내역' : '+ 결제'}</button></div>}
              {r.status === '결제' && r.paid_amt == null && !boss && <div><a href="/settle-request" style={{ fontSize: 11.5, color: '#B42318', fontWeight: 700 }}>정산요청에서 입력 →</a></div>}</td>
            {lead && <td style={{ padding: 8, whiteSpace: 'nowrap', color: r.owner_id ? '#344054' : '#B54708' }}>{r.owner_id ? (nameOf.get(r.owner_id) ?? '(팀 밖)') : '미배정'}{r.prev_owner && <div style={{ fontSize: 11.5, color: '#98A2B3' }}>← {nameOf.get(r.prev_owner) ?? '이전 담당'}{r.moved_at ? ' ' + hm(r.moved_at).slice(0, 5) : ''}</div>}</td>}
          </tr>
          {logOf === r.id && <tr style={{ background: '#F9FAFB' }}><td colSpan={cols} style={{ padding: '10px 14px 14px' }}>
            {!lead && r.prev_owner && <div style={{ fontSize: 12.5, color: '#6941C6', marginBottom: 6 }}>이전 담당자에게서 넘겨받은 건입니다 — 아래 기록과 관리 내용을 먼저 읽어 주세요</div>}
            {logs == null ? <div style={{ color: '#98A2B3', fontSize: 13 }}>불러오는 중…</div> : logs.length ? logs.map((c, k) => <div key={c.id} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '5px 0', borderTop: k ? '1px solid #EAECF0' : undefined }}><b style={{ width: 34 }}>{k + 1}차</b><span style={{ width: 96, color: '#667085' }}>{hm(c.at)}</span><span style={{ width: 40 }}>{c.way}</span><span style={{ width: 76, fontWeight: 700, color: c.result === '부재' ? '#B54708' : '#067647' }}>{c.result}</span><span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{c.note}</span><span style={{ color: '#98A2B3', fontSize: 12 }}>{c.by}</span></div>) : <div style={{ color: '#98A2B3', fontSize: 13 }}>아직 연락 기록이 없습니다</div>}
            {mine && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
              <select style={inp} value={lf.way} onChange={e => setLf({ ...lf, way: e.target.value })}>{WAYS.map(x => <option key={x}>{x}</option>)}</select>
              <select style={inp} value={lf.result} onChange={e => setLf({ ...lf, result: e.target.value })}>{RESULTS.map(x => <option key={x}>{x}</option>)}</select>
              <input style={{ ...inp, flex: '1 1 260px' }} placeholder="통화 · 메시지 내용" value={lf.note} onChange={e => setLf({ ...lf, note: e.target.value })} />
              <span style={{ fontSize: 12.5, color: '#667085' }}>다음 연락</span><input type="date" style={inp} min={today} value={lf.next_on} onChange={e => setLf({ ...lf, next_on: e.target.value })} /><input type="time" style={inp} value={lf.alarm_time} onChange={e => setLf({ ...lf, alarm_time: e.target.value })} />
              <button className="btn" disabled={busy} onClick={() => addLog(r)}>{(logs?.length ?? 0) + 1}차 기록</button>
            </div>}
          </td></tr>}</Fragment>; })}
          {!list.length && <tr><td colSpan={cols} style={{ padding: 28, textAlign: 'center', color: '#98A2B3' }}>{rows.length ? '조건에 맞는 DB 가 없습니다' : lead ? '아직 들어온 DB 가 없습니다' : '아직 배정된 DB 가 없습니다'}</td></tr>}
        </tbody>
      </table>
    </div>
    {list.length > show && <div style={{ textAlign: 'center', marginTop: 10 }}><button className="btn ghost" onClick={() => setShow(x => x + 100)}>100건 더 보기 ({show}/{list.length})</button></div>}
  </>;
}
