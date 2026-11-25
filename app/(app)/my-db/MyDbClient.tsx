'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { dbAdd, dbUpdate, dbDelete, dbRestore, dbPurge, dbTransfer, type DbRow, type DbIn } from './actions';

const GRADES = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
const GC: Record<string, string> = { S: '#B42318', A: '#D92D20', B: '#B54708', C: '#175CD3', D: '#667085', E: '#98A2B3', F: '#98A2B3' };
const STATUSES = ['진행', '결제', '보류', '종료'];
const PAID_BG = '#FFF7B2';   // 결제 건 — 엑셀에서 쓰던 노란 줄 그대로
const CHANNELS = ['카톡', '문자', '전화', '이메일'];
type Parsed = { sheet: string; rows: DbIn[] };

/** 엑셀 시트 → 등록 행. 머리글(상호명·번호·성별·껀덕지·키워드·URL·성과조회·상황설명·1차 콜·URL2)을 이름으로 찾고, 날짜는 빈 칸이면 윗줄 날짜를 이어받는다. 노란 줄은 결제로 읽음 */
function parseSheet(XLSX: any, ws: any, today: string): DbIn[] {
  const g: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const hi = g.slice(0, 8).findIndex(r => r.some(c => /상호|업체명/.test(String(c)))); if (hi < 0) return [];
  const h = g[hi].map(c => String(c ?? '').replace(/\s+/g, '')); const find = (...re: RegExp[]) => { for (const x of re) { const i = h.findIndex(c => x.test(c)); if (i >= 0) return i; } return -1; };
  const iName = find(/상호|업체명/); const iPhone0 = find(/^번호$|전화|연락처|휴대/);
  const col = { date: find(/날짜|일자/), kind: find(/분류|구분|가망/), gender: find(/성별/), channel: find(/껀덕지|건덕지|연락수단|채널/), item: find(/키워드|품목/), url: find(/^URL$/i, /^URL1$/i, /URL|주소|링크/i), url2: find(/^URL2$/i), grade: find(/성과조회|등급/), note1: find(/상황설명|진행사항|메모/), note2: find(/^1차콜/, /^2차콜/), note3: find(/^3차콜/, /^2차콜/), biz: find(/사업자/) };
  if (col.note3 === col.note2) col.note3 = -1; if (col.url2 === col.url) col.url2 = -1;
  const body = g.slice(hi + 1); const isPhone = (v: unknown) => /^0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}$/.test(String(v ?? '').trim());
  let iPhone = iPhone0; if (iPhone < 0) { let best = 0; for (let c = 0; c < h.length; c++) { const n = body.slice(0, 60).filter(r => isPhone(r[c])).length; if (n > best) { best = n; iPhone = c; } } }   // 머리글이 이상해도 내용으로 전화 칸 찾기
  if (col.date < 0 && iName > 0 && !h[iName - 1]) col.date = iName - 1;   // 머리글 없는 맨 앞 칸 = 날짜
  if (col.date < 0 && iName > 0 && col.kind !== iName - 1) col.date = iName - 1;
  const ymd = (v: unknown): string | null => {
    if (v instanceof Date) return new Date(v.getTime() + 10 * 3600e3).toISOString().slice(0, 10);   // 엑셀 날짜(자정)가 몇 십 초 앞당겨 읽히는 것 보정
    const t = String(v ?? '').trim().replace(/[oO]/g, '0'); if (!t) return null;
    let m = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = t.match(/^(\d{1,2})[./-](\d{1,2})$/); if (m && +m[1] <= 12 && +m[2] <= 31) { const y = +today.slice(0, 4); const d = `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; return `${`${y}-${d}` > today ? y - 1 : y}-${d}`; }
    return null;
  };
  const cell = (r: any[], i: number) => i >= 0 ? String(r[i] ?? '').trim() : '';
  const out: DbIn[] = []; let last: string | null = null;
  body.forEach((r, k) => {
    const d = col.date >= 0 ? ymd(r[col.date]) : null; if (d) last = d;
    const name = cell(r, iName); if (!name) return;
    const addr = XLSX.utils.encode_cell({ r: hi + 1 + k, c: iName }); const fill = String(ws[addr]?.s?.fgColor?.rgb ?? '').toUpperCase(); const yellow = /^(FF)?FFFF00$/.test(fill) || /^(FF)?FFF[0-9A-F]{3}$/.test(fill) && fill.slice(-2) < '99';
    let grade = cell(r, col.grade).toUpperCase(); let extra = ''; if (/^S+\+?$/.test(grade)) grade = 'S'; else if (!GRADES.includes(grade)) { extra = cell(r, col.grade); grade = ''; }
    out.push({ contact_date: last, name, phone: cell(r, iPhone), biz_no: cell(r, col.biz), kind: cell(r, col.kind), gender: cell(r, col.gender), channel: cell(r, col.channel), item: cell(r, col.item), url: cell(r, col.url), url2: cell(r, col.url2), grade,
      status: yellow ? '결제' : '진행', note1: [extra, cell(r, col.note1)].filter(Boolean).join(' · '), note2: cell(r, col.note2), note3: cell(r, col.note3) });
  });
  return out;
}

export default function MyDbClient({ me, target, who, trash, today, rows0, err, people }: { me: { id: string; boss: boolean }; target: string; who: string; trash: boolean; today: string; rows0: DbRow[]; err: string; people: { id: string; name: string }[] }) {
  const router = useRouter(); const [rows, setRows] = useState(rows0); const [tab, setTab] = useState('all'); const [q, setQ] = useState(''); const [sel, setSel] = useState<Set<number>>(new Set()); const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(100); const [to, setTo] = useState(''); const [adding, setAdding] = useState(false); const [parsed, setParsed] = useState<Parsed[] | null>(null); const [pick, setPick] = useState<Set<string>>(new Set()); const [dups, setDups] = useState<{ name: string; who: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null); const [nw, setNw] = useState<DbIn>({ name: '', contact_date: today });
  const mine = target === me.id; const canEdit = !trash && (mine || me.boss);
  const due = (r: DbRow) => r.status === '진행' && !!r.next_on && r.next_on <= today;
  const TABS = [{ k: 'all', l: '전체', f: (_: DbRow) => true }, { k: 'due', l: '오늘·지난 약속', f: due }, { k: 'hot', l: 'S·A·B 등급', f: (r: DbRow) => r.status === '진행' && ['S', 'A', 'B'].includes(r.grade) }, { k: 'paid', l: '결제', f: (r: DbRow) => r.status === '결제' }, { k: 'off', l: '보류·종료', f: (r: DbRow) => r.status === '보류' || r.status === '종료' }];
  const kw = q.trim().toLowerCase().replace(/\s/g, '');
  const view = useMemo(() => { const f = (TABS.find(t => t.k === tab) ?? TABS[0]).f; return rows.filter(r => f(r) && (!kw || `${r.name}${r.phone}${r.item}${r.kind}${r.note1}`.toLowerCase().replace(/[\s-]/g, '').includes(kw.replace(/-/g, '')))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rows, tab, kw, today]);
  const patch = async (r: DbRow, p: Partial<DbIn>) => { const x = await dbUpdate(r.id, p); if (!x.ok) return notify(x.msg, 'bad'); setRows(rs => rs.map(y => y.id === r.id ? x.row : y)); if ('status' in p || 'grade' in p || 'next_on' in p) notify(p.status === '결제' ? '결제로 표시했습니다' : '저장됨', 'ok'); };
  const run = async (fn: () => Promise<{ ok: boolean; msg: string }>, drop = true) => { setBusy(true); const x = await fn(); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad', 5000); if (x.ok) { if (drop) setRows(rs => rs.filter(r => !sel.has(r.id))); setSel(new Set()); router.refresh(); } };
  const ids = [...sel];
  const addOne = async () => { if (!nw.name?.trim()) return notify('상호명을 적어 주세요', 'bad'); setBusy(true); const x = await dbAdd([nw], '직접', mine ? undefined : target); setBusy(false); if (!x.ok) return notify(x.msg, 'bad'); notify(x.added ? x.msg : (x.dup[0] ? `등록 안 됨 — ${x.dup[0].who}` : x.msg), x.added ? 'ok' : 'bad', 5000); if (x.added) { setNw({ name: '', contact_date: today }); setAdding(false); router.refresh(); location.reload(); } };
  const onFile = async (f: File | undefined) => {
    if (!f) return; setBusy(true);
    try { const XLSX = await import('xlsx'); const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellStyles: true, cellDates: true });
      const list = wb.SheetNames.map(n => ({ sheet: n, rows: parseSheet(XLSX, wb.Sheets[n], today) })).filter(p => p.rows.length);
      if (!list.length) notify('표를 찾지 못했습니다 — 머리글에 「상호명」이 있어야 합니다', 'bad', 6000); else { setParsed(list); setPick(new Set([list[0].sheet])); setDups([]); }
    } catch (e: any) { notify('파일을 읽지 못했습니다: ' + String(e?.message ?? e).slice(0, 80), 'bad', 6000); }
    setBusy(false); if (fileRef.current) fileRef.current.value = '';
  };
  const importNow = async () => { if (!parsed) return; const all = parsed.filter(p => pick.has(p.sheet)).flatMap(p => p.rows); if (!all.length) return notify('시트를 골라 주세요', 'bad'); setBusy(true); let added = 0; const dd: { name: string; who: string }[] = [];
    for (let i = 0; i < all.length; i += 1000) { const x = await dbAdd(all.slice(i, i + 1000), '엑셀', mine ? undefined : target); if (!x.ok) { setBusy(false); return notify(x.msg, 'bad', 6000); } added += x.added; dd.push(...x.dup); }
    setBusy(false); notify(`${added}건 등록` + (dd.length ? ` · ${dd.length}건 건너뜀(중복)` : ''), 'ok', 6000); setDups(dd); setParsed(null); if (added) { router.refresh(); setTimeout(() => location.reload(), dd.length ? 4000 : 300); } };
  const template = async () => { const XLSX = await import('xlsx'); const ws = XLSX.utils.aoa_to_sheet([['날짜', '상호명', '번호', '성별', '껀덕지', '키워드', 'URL', '성과조회', '상황설명 및 진행사항', '1차 콜', 'URL2'], [today, '예시상회', '010-0000-0000', '남', '카톡', '고등어', 'https://smartstore.naver.com/example', 'B', '1차 통화 후 카톡 남김', '', '']]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '유효콜'); XLSX.writeFile(wb, '내DB_양식.xlsx'); };
  const inp = { fontSize: 12.5, padding: '4px 6px', width: '100%' } as const;
  const Txt = ({ r, k, w, ph }: { r: DbRow; k: keyof DbIn; w?: number; ph?: string }) => canEdit ? <input defaultValue={(r as any)[k] ?? ''} placeholder={ph} onBlur={e => { if (e.target.value !== ((r as any)[k] ?? '')) patch(r, { [k]: e.target.value } as any); }} style={{ ...inp, minWidth: w, background: 'transparent' }} /> : <span style={{ fontSize: 12.5 }}>{(r as any)[k] || ''}</span>;
  return <div style={{ display: 'grid', gap: 14 }}>
    {err && <div className="card" style={{ color: '#B42318' }}>{err}</div>}
    {!trash && (mine || me.boss) && <div className="card" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn" onClick={() => setAdding(a => !a)}>+ 한 건 추가</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>엑셀 올리기</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => onFile(e.target.files?.[0])} />
        <button type="button" className="help" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={template}>양식 내려받기</button>
        <span className="cell-sub">쓰던 「유효콜」 엑셀 그대로 올려도 됩니다 · 노란 줄은 결제로, 성과조회 칸은 등급으로 들어옵니다{mine ? '' : ` · ${who} 님 DB 로 배정됩니다`}</span>
      </div>
      {adding && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, alignItems: 'center' }}>
        <input type="date" value={nw.contact_date ?? ''} onChange={e => setNw({ ...nw, contact_date: e.target.value })} />
        <input placeholder="상호명 *" value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} /><input placeholder="번호" value={nw.phone ?? ''} onChange={e => setNw({ ...nw, phone: e.target.value })} />
        <select value={nw.channel ?? ''} onChange={e => setNw({ ...nw, channel: e.target.value })}><option value="">껀덕지</option>{CHANNELS.map(c => <option key={c}>{c}</option>)}</select>
        <input placeholder="키워드" value={nw.item ?? ''} onChange={e => setNw({ ...nw, item: e.target.value })} /><input placeholder="URL" value={nw.url ?? ''} onChange={e => setNw({ ...nw, url: e.target.value })} />
        <select value={nw.grade ?? ''} onChange={e => setNw({ ...nw, grade: e.target.value })}><option value="">등급</option>{GRADES.map(c => <option key={c}>{c}</option>)}</select>
        <input placeholder="상황설명" value={nw.note1 ?? ''} onChange={e => setNw({ ...nw, note1: e.target.value })} style={{ gridColumn: 'span 2' }} />
        <button type="button" className="btn" disabled={busy} onClick={addOne}>등록</button>
      </div>}
      {parsed && <div style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
        <b>올릴 시트 고르기</b>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{parsed.map(p => <label key={p.sheet} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={pick.has(p.sheet)} onChange={() => setPick(s => { const n = new Set(s); n.has(p.sheet) ? n.delete(p.sheet) : n.add(p.sheet); return n; })} />{p.sheet} <span className="cell-sub">{p.rows.length}건 · 결제 {p.rows.filter(r => r.status === '결제').length}</span></label>)}</div>
        <div className="cell-sub">같은 전화번호는 한 번만 들어갑니다 (다른 시트에 같은 업체가 있어도 중복 등록 안 됨)</div>
        <div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn" disabled={busy} onClick={importNow}>{busy ? '등록 중…' : `${parsed.filter(p => pick.has(p.sheet)).reduce((a, p) => a + p.rows.length, 0)}건 등록`}</button><button type="button" className="btn ghost" onClick={() => setParsed(null)}>취소</button></div>
      </div>}
      {dups.length > 0 && <div style={{ fontSize: 12.5, color: '#B54708' }}>건너뛴 {dups.length}건: {dups.slice(0, 12).map(d => `${d.name}(${d.who})`).join(', ')}{dups.length > 12 ? ' …' : ''}</div>}
    </div>}
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
        {!trash && TABS.map(t => <button key={t.k} type="button" onClick={() => { setTab(t.k); setShown(100); }} className={`btn ${t.k === tab ? '' : 'ghost'}`} style={{ padding: '6px 12px' }}>{t.l} <b style={{ marginLeft: 4 }}>{rows.filter(t.f).length}</b></button>)}
        {trash && <b style={{ padding: '6px 4px' }}>지운 DB {rows.length}건 <span className="cell-sub" style={{ fontWeight: 400 }}>{me.boss ? '총괄 화면에는 기한 없이 남습니다' : '지운 지 30일까지 되살릴 수 있습니다'}</span></b>}
        <input value={q} onChange={e => { setQ(e.target.value); setShown(100); }} placeholder="상호·번호·키워드 검색" style={{ width: 200, marginLeft: 'auto' }} />
      </div>
      {sel.size > 0 && <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--line)', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg)' }}>
        <b>{sel.size}건 선택</b>
        {!trash && (mine || me.boss) && <button type="button" className="btn ghost" disabled={busy} style={{ color: '#B42318' }} onClick={() => run(() => dbDelete(ids))}>삭제</button>}
        {trash && (mine || me.boss) && <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => dbRestore(ids))}>되살리기</button>}
        {trash && me.boss && <button type="button" className="btn ghost" disabled={busy} style={{ color: '#B42318' }} onClick={() => { if (confirm(`${sel.size}건을 완전히 지울까요? 되돌릴 수 없습니다`)) run(() => dbPurge(ids)); }}>완전 삭제</button>}
        {(me.boss || (mine && !trash)) && <><select value={to} onChange={e => setTo(e.target.value)} style={{ width: 150 }}><option value="">넘길 사람</option>{people.filter(p => p.id !== target).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button type="button" className="btn ghost" disabled={busy || !to} onClick={() => run(() => dbTransfer(ids, to))}>넘기기</button></>}
        <button type="button" className="help" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setSel(new Set())}>선택 해제</button>
      </div>}
      {view.length ? <div style={{ overflow: 'auto' }}><table style={{ fontSize: 12.5 }}>
        <thead><tr><th style={{ width: 28 }}><input type="checkbox" style={{ width: 'auto' }} checked={view.slice(0, shown).every(r => sel.has(r.id))} onChange={e => setSel(e.target.checked ? new Set(view.slice(0, shown).map(r => r.id)) : new Set())} /></th>
          <th>날짜</th><th style={{ minWidth: 130 }}>상호명</th><th>번호</th><th>성별</th><th>껀덕지</th><th>키워드</th><th>URL</th><th>등급</th><th>상태</th><th>다음 연락일</th><th style={{ minWidth: 260 }}>상황설명 및 진행사항</th><th style={{ minWidth: 180 }}>1차 콜</th><th style={{ minWidth: 150 }}>2차 콜</th>{trash && <th>지운 날</th>}</tr></thead>
        <tbody>{view.slice(0, shown).map(r => { const paid = r.status === '결제'; const late = due(r); return <tr key={r.id} style={{ background: paid ? PAID_BG : undefined, opacity: r.status === '종료' ? .55 : 1 }}>
          <td><input type="checkbox" style={{ width: 'auto' }} checked={sel.has(r.id)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>
          <td style={{ whiteSpace: 'nowrap' }}>{canEdit ? <input type="date" defaultValue={r.contact_date ?? ''} onBlur={e => { if (e.target.value !== (r.contact_date ?? '')) patch(r, { contact_date: e.target.value || null }); }} style={{ ...inp, width: 118, background: 'transparent' }} /> : (r.contact_date ?? '').slice(5)}</td>
          <td><div style={{ fontWeight: 700 }}><Txt r={r} k="name" /></div><div className="cell-sub" style={{ fontSize: 11 }}>{[r.source, r.kind, r.biz_no && `사업자 ${r.biz_no}`].filter(Boolean).join(' · ')}</div></td>
          <td style={{ whiteSpace: 'nowrap' }}><Txt r={r} k="phone" w={112} /></td>
          <td><Txt r={r} k="gender" w={34} /></td>
          <td>{canEdit ? <select defaultValue={r.channel} onChange={e => patch(r, { channel: e.target.value })} style={{ ...inp, width: 74, background: 'transparent' }}><option value=""></option>{Array.from(new Set([...CHANNELS, r.channel].filter(Boolean))).map(c => <option key={c}>{c}</option>)}</select> : r.channel}</td>
          <td><Txt r={r} k="item" w={90} /></td>
          <td style={{ whiteSpace: 'nowrap' }}>{r.url ? <a href={/^https?:/i.test(r.url.trim()) ? r.url.trim() : `https://${r.url.trim()}`} target="_blank" rel="noreferrer">열기</a> : ''}{r.url2 ? <> · <a href={/^https?:/i.test(r.url2.trim()) ? r.url2.trim() : `https://${r.url2.trim()}`} target="_blank" rel="noreferrer">2</a></> : ''}{canEdit && !r.url && <Txt r={r} k="url" w={80} ph="URL" />}</td>
          <td>{canEdit ? <select value={r.grade} onChange={e => patch(r, { grade: e.target.value })} title="결제 나올 가능성 — S 가 가장 높음" style={{ ...inp, width: 56, fontWeight: 800, color: GC[r.grade] ?? 'inherit', background: 'transparent' }}><option value="">-</option>{GRADES.map(g => <option key={g} value={g}>{g}</option>)}</select> : <b style={{ color: GC[r.grade] }}>{r.grade || '-'}</b>}</td>
          <td>{canEdit ? <select value={r.status} onChange={e => patch(r, { status: e.target.value })} style={{ ...inp, width: 70, fontWeight: 700, color: paid ? '#067647' : 'inherit', background: 'transparent' }}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select> : <b style={{ color: paid ? '#067647' : undefined }}>{r.status}</b>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{canEdit ? <input type="date" defaultValue={r.next_on ?? ''} onBlur={e => { if (e.target.value !== (r.next_on ?? '')) patch(r, { next_on: e.target.value || null }); }} style={{ ...inp, width: 118, background: 'transparent', color: late ? '#B42318' : undefined, fontWeight: late ? 800 : undefined }} /> : <span style={{ color: late ? '#B42318' : undefined }}>{r.next_on ?? ''}</span>}{late && <div style={{ fontSize: 11, color: '#B42318', fontWeight: 700 }}>{r.next_on === today ? '오늘 연락' : '약속 지남'}</div>}</td>
          <td><Txt r={r} k="note1" /></td><td><Txt r={r} k="note2" /></td><td><Txt r={r} k="note3" /></td>
          {trash && <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{(r.deleted_at ?? '').slice(0, 10)}</td>}</tr>; })}
          {view.length > shown && <tr><td colSpan={15} style={{ textAlign: 'center', padding: 14 }}><button type="button" className="btn" onClick={() => setShown(n => n + 100)}>100건 더 보기 ({shown} / {view.length})</button> <button type="button" className="btn ghost" onClick={() => setShown(view.length)}>전부 보기</button></td></tr>}</tbody></table></div>
        : <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>{trash ? '지운 DB 가 없습니다' : rows.length ? '조건에 맞는 DB 가 없습니다' : '아직 DB 가 없습니다 — 「엑셀 올리기」로 쓰던 파일을 올리거나 「+ 한 건 추가」를 눌러 주세요'}</div>}
    </div>
  </div>;
}
