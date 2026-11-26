'use client';
import { Fragment, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import MetaPayBox from '@/components/MetaPayBox';
import { addItems } from '../rank-watch/actions';
import { dbAdd, dbUpdate, dbDelete, dbRestore, dbPurge, dbTransfer, dbRank, type DbRow, type DbIn } from './actions';

const GRADES = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
const GC: Record<string, string> = { S: '#B42318', A: '#D92D20', B: '#B54708', C: '#175CD3', D: '#667085', E: '#98A2B3', F: '#98A2B3' };
const STATUSES = ['진행', '결제', '이탈', '보류', '종료'];
const META_STATUSES = ['진행', '부재', '결제', '이탈', '보류', '종료', '허수'];   // 메타 인바운드 건 — 부재 · 허수 추가 (메타 효율 집계에 쓰임)
const LEFT_BG = '#FBE4EC';   // 이탈(결제했다가 빠진 고객) — 분홍 줄
const PAID_BG = '#FFF27A';   // 결제 건 — 엑셀에서 쓰던 노란 줄 그대로 (등급 색보다 우선)
const ROW_BG: Record<string, string> = { S: '#FFD9D5', A: '#FFE7D1', B: '#DFF3E1', C: '#DCEBFD', E: '#F0F2F5', F: '#E2E5EA' };   // 등급별 줄 색 — D(가장 흔함)는 흰색
const SORTS: Record<string, (r: DbRow) => string | number> = { contact_date: r => r.contact_date ?? '', name: r => r.name, phone: r => r.phone, gender: r => r.gender, channel: r => r.channel, item: r => r.item, grade: r => { const i = GRADES.indexOf(r.grade); return i < 0 ? 99 : i; }, status: r => STATUSES.indexOf(r.status), next_on: r => (r.next_on ?? '9999') + (r.alarm_time ?? ''), rank: r => r.rank_at ? (r.rank_now || 999) : 9999, expect_amt: r => r.expect_amt ?? -1 };
const CHANNELS = ['카톡', '전화', '이메일'];   // 연락방식 체크란 (여러 개 체크 가능) — 엑셀에서 온 다른 값(문자 등)은 그 줄에만 추가로 보인다
type Parsed = { sheet: string; rows: DbIn[] };
type Hist = { t: string; r: number; k: string };
const kstMD = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ');
/** 순위 이력 그래프 — 위쪽이 1위, 100위 밖은 맨 아래 점선 아래에 찍는다 */
function RankChart({ h, w, ht, big }: { h: Hist[]; w: number; ht: number; big?: boolean }) {
  if (h.length < 2 && !big) return null; const pad = big ? 22 : 3; const n = h.length; const top = big ? 16 : 3;
  const y = (r: number) => top + ((r ? Math.min(r, 100) : 108) - 1) / 107 * (ht - top - pad); const x = (i: number) => (big ? 30 : 3) + (n === 1 ? 0 : i / (n - 1)) * (w - (big ? 44 : 6));
  const pts = h.map((p, i) => `${x(i).toFixed(1)},${y(p.r).toFixed(1)}`).join(' ');
  return <svg width={w} height={ht} style={{ display: 'block' }}>
    {big && [1, 10, 40, 100].map(v => <g key={v}><line x1={30} x2={w - 10} y1={y(v)} y2={y(v)} stroke="#E4E7EC" strokeDasharray={v === 100 ? '4 3' : undefined} /><text x={26} y={y(v) + 4} fontSize={10} textAnchor="end" fill="#98A2B3">{v}위</text></g>)}
    <polyline points={pts} fill="none" stroke="#2F54EB" strokeWidth={big ? 2 : 1.5} strokeLinejoin="round" />
    {h.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.r)} r={big ? 3.5 : i === n - 1 ? 2.5 : 0} fill={p.r ? '#2F54EB' : '#98A2B3'}><title>{`${kstMD(p.t)} · ${p.r ? p.r + '위' : '100위 밖'} · ${p.k}`}</title></circle>
      {big && (n <= 14 || i === n - 1 || i % Math.ceil(n / 12) === 0) && <text x={x(i)} y={y(p.r) - 7} fontSize={10.5} textAnchor="middle" fontWeight={700} fill={p.r ? '#1D2939' : '#98A2B3'}>{p.r || '밖'}</text>}
      {big && (n <= 10 || i === 0 || i === n - 1 || i % Math.ceil(n / 8) === 0) && <text x={x(i)} y={ht - 6} fontSize={9.5} textAnchor="middle" fill="#98A2B3">{kstMD(p.t).slice(0, 5)}</text>}</g>)}
  </svg>;
}

/** 엑셀 시트 → 등록 행. 머리글(상호명·번호·성별·껀덕지·키워드·URL·성과조회·상황설명·1차 콜·URL2)을 이름으로 찾고, 날짜는 빈 칸이면 윗줄 날짜를 이어받는다. 노란 줄은 결제로 읽음 */
function parseSheet(XLSX: any, ws: any, today: string): DbIn[] {
  const g: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const hi = g.slice(0, 8).findIndex(r => r.some(c => /상호|업체명/.test(String(c)))); if (hi < 0) return [];
  const h = g[hi].map(c => String(c ?? '').replace(/\s+/g, '')); const find = (...re: RegExp[]) => { for (const x of re) { const i = h.findIndex(c => x.test(c)); if (i >= 0) return i; } return -1; };
  const iName = find(/상호|업체명/); const iPhone0 = find(/^번호$|전화|연락처|휴대/);
  const col = { date: find(/날짜|일자/), kind: find(/분류|구분|가망/), gender: find(/성별/), channel: find(/껀덕지|건덕지|연락수단|연락방식|채널/), item: find(/키워드|품목/), url: find(/^URL$/i, /^URL1$/i, /URL|주소|링크/i), url2: find(/^URL2$/i), grade: find(/성과조회|등급/), note1: find(/상황설명|진행사항|메모/), note2: find(/^1차콜/, /^2차콜/), note3: find(/^3차콜/, /^2차콜/), biz: find(/사업자/), status: find(/^상태$/), amt: find(/예상금액|결제예상|예상매출/) };
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
      expect_amt: cell(r, col.amt) || null, status: yellow ? '결제' : (STATUSES.includes(cell(r, col.status)) ? cell(r, col.status) : '진행'), note1: [extra, cell(r, col.note1)].filter(Boolean).join(' · '), note2: cell(r, col.note2), note3: cell(r, col.note3) });
  });
  return out;
}

export default function MyDbClient({ me, target, who, trash, today, rows0, err, people }: { me: { id: string; boss: boolean }; target: string; who: string; trash: boolean; today: string; rows0: DbRow[]; err: string; people: { id: string; name: string }[] }) {
  const router = useRouter(); const [rows, setRows] = useState(rows0); const [tab, setTab] = useState('all'); const [q, setQ] = useState(''); const [sel, setSel] = useState<Set<number>>(new Set()); const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(100); const [to, setTo] = useState(''); const [adding, setAdding] = useState(false); const [parsed, setParsed] = useState<Parsed[] | null>(null); const [pick, setPick] = useState<Set<string>>(new Set()); const [dups, setDups] = useState<{ name: string; who: string }[]>([]);
  const [pay, setPay] = useState<number | null>(null);   // 결제 내역 창을 연 메타 건
  const fileRef = useRef<HTMLInputElement>(null); const [nw, setNw] = useState<DbIn>({ name: '', contact_date: today });
  const mine = target === me.id; const canEdit = !trash && (mine || me.boss);
  const due = (r: DbRow) => (r.status === '진행' || r.status === '부재') && !!r.next_on && r.next_on <= today;
  const TABS = [{ k: 'all', l: '전체', f: (_: DbRow) => true }, { k: 'due', l: '오늘·지난 약속', f: due }, { k: 'hot', l: 'S·A·B 등급', f: (r: DbRow) => r.status === '진행' && ['S', 'A', 'B'].includes(r.grade) }, { k: 'paid', l: '결제', f: (r: DbRow) => r.status === '결제' }, { k: 'left', l: '이탈', f: (r: DbRow) => r.status === '이탈' }, { k: 'off', l: '보류·종료', f: (r: DbRow) => r.status === '보류' || r.status === '종료' }];
  const kw = q.trim().toLowerCase().replace(/\s/g, '');
  const [sort, setSort] = useState<{ k: string; d: 1 | -1 } | null>(null); const [flt, setFlt] = useState<Record<string, string>>({});
  const uniq = (k: 'gender' | 'channel' | 'item' | 'grade' | 'status' | 'contact_date') => Array.from(new Set(rows.map(r => String((r as any)[k] ?? '')).filter(Boolean))).sort((a, b) => k === 'grade' ? GRADES.indexOf(a) - GRADES.indexOf(b) : k === 'contact_date' ? (a < b ? 1 : -1) : a.localeCompare(b));
  const view = useMemo(() => { const f = (TABS.find(t => t.k === tab) ?? TABS[0]).f; const fk = Object.entries(flt).filter(([, v]) => v); const out = rows.filter(r => f(r) && fk.every(([k, v]) => v === '(빈칸)' ? !(r as any)[k] : String((r as any)[k] ?? '') === v) && (!kw || `${r.name}${r.phone}${r.item}${r.kind}${r.note1}`.toLowerCase().replace(/[\s-]/g, '').includes(kw.replace(/-/g, ''))));
    if (sort) { const g = SORTS[sort.k]; out.sort((a, b) => { const x = g(a), y = g(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.d; }); }
    return out; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rows, tab, kw, today, sort, flt]);
  const patch = async (r: DbRow, p: Partial<DbIn>) => { const x = await dbUpdate(r.id, p); if (!x.ok) return notify(x.msg, 'bad'); setRows(rs => rs.map(y => y.id === r.id ? x.row : y)); if (p.status === '결제' && r.meta_id && r.paid_amt == null) setPay(r.meta_id); /* 메타 건을 결제로 바꾸면 바로 금액을 넣게 */ if ('status' in p || 'grade' in p || 'next_on' in p || 'alarm_time' in p) notify(p.status === '결제' ? '결제로 표시했습니다' : 'alarm_time' in p || 'next_on' in p ? (x.row.next_on ? `⏰ 알람 설정 — ${x.row.next_on.slice(5).replace('-', '/')} ${x.row.alarm_time || '아침'}` : '알람 해제') : '저장됨', 'ok'); };
  // 「순위 체크」 메뉴(매일 자동 수집)로 넘기기 — 상품 링크 + 키워드를 상호명 그룹으로 등록
  const toWatch = async (r: DbRow) => { if (!r.item.trim()) return notify('키워드 칸을 먼저 채워 주세요', 'bad'); if (!/\/(products|catalog)\/\d+/.test(r.url)) return notify('URL 칸에 상품 링크(또는 원부 링크)를 넣어 주세요', 'bad'); const fd = new FormData(); fd.set('url', r.url.trim()); fd.set('keywords', r.item.trim()); fd.set('group', r.name); fd.set('memo', '내 DB 에서 등록'); const x = await addItems(fd); notify(x.ok ? `「${r.name}」 순위 체크에 등록했습니다 — 순위 체크 메뉴에서 매일 수집됩니다` : x.msg, x.ok ? 'ok' : 'bad', 5000); };
  const [open, setOpen] = useState(0);   // 순위 이력을 펼친 줄
  const [rk, setRk] = useState(0); const md = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ');
  const rank = async (r: DbRow) => { setRk(r.id); const x = await dbRank(r.id); setRk(0); notify(x.msg, x.ok ? 'ok' : 'bad', 5000); if (x.ok) setRows(rs => rs.map(y => y.id === r.id ? x.row : y)); };
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
  const template = async () => { const XLSX = await import('xlsx'); const ws = XLSX.utils.aoa_to_sheet([['영업 날짜', '상호명', '번호', '연락방식', '키워드', '등급', '상황설명 및 진행사항', '2차 콜', '3차 콜', '결제 예상 금액', '상태', '성별', 'URL'], [today, '예시상회', '010-0000-0000', '카톡,전화', '고등어', 'B', '1차 통화 후 카톡 남김', '', '', 350000, '진행', '남', 'https://smartstore.naver.com/example/products/1234567890']]); ws['!cols'] = [12, 18, 16, 12, 14, 6, 44, 30, 30, 14, 8, 6, 46].map(wch => ({ wch })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '유효콜'); XLSX.writeFile(wb, '내DB_양식.xlsx'); };   // 화면 칸 순서와 같게. 연락방식 카톡·전화·이메일(쉼표로 여러 개), 등급 S·A·B·C·D·E·F, 상태 진행·결제·이탈·보류·종료, URL 은 상품 링크
  const inp = { fontSize: 12.5, padding: '4px 6px', width: '100%', minHeight: 30 } as const;
  // 머리글: 누르면 정렬(오름→내림→해제), 아래 칸에서 값 골라 걸러 보기
  const Th = ({ k, l, w, f }: { k?: string; l: string; w?: number; f?: 'gender' | 'channel' | 'item' | 'grade' | 'status' | 'contact_date' }) => <th style={{ minWidth: w, verticalAlign: 'top' }}>
    <div onClick={() => k && setSort(s => !s || s.k !== k ? { k, d: 1 } : s.d === 1 ? { k, d: -1 } : null)} style={{ cursor: k ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }} title={k ? '누르면 정렬' : undefined}>{l}{k && <span style={{ marginLeft: 3, color: sort?.k === k ? 'var(--accent)' : '#C0C5D0' }}>{sort?.k === k ? (sort.d === 1 ? '▲' : '▼') : '↕'}</span>}</div>
    {f && <select value={flt[f] ?? ''} onChange={e => { setFlt(x => ({ ...x, [f]: e.target.value })); setShown(100); }} style={{ fontSize: 11.5, padding: '2px 4px', minHeight: 24, marginTop: 3, width: '100%', minWidth: 56, background: flt[f] ? '#EEF4FF' : '#fff', fontWeight: flt[f] ? 700 : 400 }}><option value="">전체</option>{uniq(f).map(v => <option key={v} value={v}>{f === 'contact_date' ? v.slice(5) : v}</option>)}{f !== 'status' && <option value="(빈칸)">(빈칸)</option>}</select>}</th>;
  // 긴 글 칸 — 줄바꿈해서 전부 보이게 (잘리지 않음)
  const Area = ({ r, k, ph }: { r: DbRow; k: 'note1' | 'note2' | 'note3'; ph?: string }) => { const v = r[k] ?? ''; return canEdit ? <textarea defaultValue={v} placeholder={ph} rows={Math.min(8, Math.max(1, Math.ceil(v.length / (k === 'note1' ? 24 : 16))))} onBlur={e => { if (e.target.value !== v) patch(r, { [k]: e.target.value } as any); }} style={{ fontSize: 12.5, padding: '4px 6px', lineHeight: 1.45, width: '100%', background: 'rgba(255,255,255,.6)', resize: 'vertical', display: 'block' }} /> : <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.45 }}>{v}</div>; };
  const Txt = ({ r, k, w, ph }: { r: DbRow; k: keyof DbIn; w?: number; ph?: string }) => canEdit ? <input defaultValue={(r as any)[k] ?? ''} placeholder={ph} onBlur={e => { if (e.target.value !== ((r as any)[k] ?? '')) patch(r, { [k]: e.target.value } as any); }} style={{ ...inp, minWidth: w, background: 'transparent' }} /> : <span style={{ fontSize: 12.5 }}>{(r as any)[k] || ''}</span>;
  return <div style={{ display: 'grid', gap: 14 }}>
    {pay != null && <MetaPayBox leadId={pay} today={today} onClose={() => setPay(null)} onChanged={x => setRows(rs => rs.map(y => y.meta_id === pay ? { ...y, paid_amt: x.amt, cost_amt: x.cost, status: x.paid && y.status !== '이탈' ? '결제' : y.status } : y))} />}
    {err && <div className="card" style={{ color: '#B42318' }}>{err}</div>}
    {!trash && (mine || me.boss) && <div className="card" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn" onClick={() => setAdding(a => !a)}>+ 한 건 추가</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>엑셀 올리기</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => onFile(e.target.files?.[0])} />
        <button type="button" className="help" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={template}>양식 내려받기</button>
        <span className="cell-sub">양식은 화면 칸 순서와 같습니다 · 쓰던 「유효콜」 엑셀도 그대로 올라갑니다(노란 줄 = 결제, 성과조회 = 등급){mine ? '' : ` · ${who} 님 DB 로 배정됩니다`}</span>
      </div>
      {adding && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, alignItems: 'center' }}>
        <input type="date" value={nw.contact_date ?? ''} onChange={e => setNw({ ...nw, contact_date: e.target.value })} />
        <input placeholder="상호명 *" value={nw.name} onChange={e => setNw({ ...nw, name: e.target.value })} /><input placeholder="번호" value={nw.phone ?? ''} onChange={e => setNw({ ...nw, phone: e.target.value })} />
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
        {(sort || Object.values(flt).some(Boolean)) && <button type="button" className="help" style={{ background: 'none', border: 0, cursor: 'pointer', marginLeft: 8 }} onClick={() => { setSort(null); setFlt({}); }}>정렬·필터 풀기 ({view.length}건)</button>}
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
          <Th k="contact_date" l="영업 날짜" f="contact_date" /><Th k="rank" l="순위" /><Th k="name" l="상호명" w={120} /><Th k="phone" l="번호" /><Th l="연락방식" /><Th k="item" l="키워드" f="item" /><Th k="grade" l="등급" f="grade" /><Th k="next_on" l="⏰ 알람" /><Th l="상황설명 및 진행사항 (1차 콜)" w={300} /><Th l="2차 콜" w={210} /><Th l="3차 콜" w={170} /><Th k="expect_amt" l="결제 예상 금액" /><Th k="status" l="상태" f="status" /><Th k="gender" l="성별" f="gender" /><Th l="URL" />{trash && <th>지운 날</th>}</tr></thead>
        <tbody>{view.slice(0, shown).map(r => { const paid = r.status === '결제'; const late = due(r); return <Fragment key={r.id}><tr style={{ background: paid ? PAID_BG : r.status === '이탈' ? LEFT_BG : ROW_BG[r.grade], opacity: r.status === '종료' ? .55 : 1, verticalAlign: 'top' }}>
          <td><input type="checkbox" style={{ width: 'auto' }} checked={sel.has(r.id)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>
          <td style={{ whiteSpace: 'nowrap' }}>{canEdit ? <input type="date" defaultValue={r.contact_date ?? ''} onBlur={e => { if (e.target.value !== (r.contact_date ?? '')) patch(r, { contact_date: e.target.value || null }); }} style={{ ...inp, width: 132, background: 'transparent' }} /> : (r.contact_date ?? '').slice(5)}</td>
          <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
            {r.rank_at ? <div title={r.rank_title ? `찾은 상품: ${r.rank_title}` : '상위 100 안에서 못 찾음'} style={{ fontWeight: 800, fontSize: 14, color: r.rank_now ? (r.rank_now <= 10 ? '#B42318' : r.rank_now <= 40 ? '#B54708' : 'inherit') : '#98A2B3' }}>{r.rank_now ? `${r.rank_now}위` : '100위 밖'}{!!r.rank_now && !!r.rank_prev && r.rank_prev !== r.rank_now && <span style={{ fontSize: 11, marginLeft: 3, color: r.rank_prev > r.rank_now ? '#067647' : '#B42318' }}>{r.rank_prev > r.rank_now ? `▲${r.rank_prev - r.rank_now}` : `▼${r.rank_now - r.rank_prev}`}</span>}</div> : null}
            {!trash && <button type="button" className="btn ghost" disabled={rk === r.id} onClick={() => rank(r)} title="URL 칸의 상품 링크로, 키워드를 지수 프로그램에서 지금 새로 조회해 상위 100 안 순위를 봅니다" style={{ padding: '2px 8px', fontSize: 11.5, minHeight: 0 }}>{rk === r.id ? '조회 중…' : r.rank_at ? '다시' : '순위'}</button>}
            {mine && !trash && <button type="button" onClick={() => toWatch(r)} title="이 상품·키워드를 「순위 체크」 메뉴에 등록 — 매일 자동으로 순위가 수집됩니다 (결제 고객용)" style={{ display: 'block', margin: '3px auto 0', border: 0, background: 'none', cursor: 'pointer', padding: 0, fontSize: 10.5, color: 'var(--accent)', fontWeight: 700 }}>순위 체크로 →</button>}
            {r.rank_at && <div className="cell-sub" style={{ fontSize: 10.5 }}>{md(r.rank_at)}</div>}
            {(r.rank_hist ?? []).length > 0 && <button type="button" onClick={() => setOpen(o => o === r.id ? 0 : r.id)} title="누르면 순위 이력 그래프" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, margin: '2px auto 0', display: 'block' }}><RankChart h={(r.rank_hist ?? []).slice(-20)} w={70} ht={22} /><span className="help" style={{ fontSize: 10.5 }}>이력 {(r.rank_hist ?? []).length}회 {open === r.id ? '▲' : '▼'}</span></button>}</td>
          <td><div style={{ fontWeight: 700 }}><Txt r={r} k="name" /></div><div className="cell-sub" style={{ fontSize: 11 }}>{[r.source, r.kind, r.biz_no && `사업자 ${r.biz_no}`].filter(Boolean).join(' · ')}</div></td>
          <td style={{ whiteSpace: 'nowrap' }}><Txt r={r} k="phone" w={108} /></td>
          <td style={{ whiteSpace: 'nowrap' }}>{(() => { const on = new Set(String(r.channel ?? '').split(/[,\s/·]+/).map(x => x.trim()).filter(Boolean)); const opts = Array.from(new Set([...CHANNELS, ...on]));
            return <div style={{ display: 'grid', gap: 2 }}>{opts.map(c => <label key={c} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, cursor: canEdit ? 'pointer' : 'default', fontWeight: on.has(c) ? 700 : 400, color: on.has(c) ? '#101828' : '#98A2B3' }}><input type="checkbox" style={{ width: 'auto', minHeight: 0, margin: 0 }} checked={on.has(c)} disabled={!canEdit} onChange={() => { const n = new Set(on); n.has(c) ? n.delete(c) : n.add(c); patch(r, { channel: opts.filter(x => n.has(x)).join(',') }); }} />{c}</label>)}</div>; })()}</td>
          <td><Txt r={r} k="item" w={84} /></td>
          <td>{canEdit ? <select value={r.grade} onChange={e => patch(r, { grade: e.target.value })} title="결제 나올 가능성 — S 가 가장 높음" style={{ ...inp, width: 56, fontWeight: 800, color: GC[r.grade] ?? 'inherit', background: 'transparent' }}><option value="">-</option>{GRADES.map(g => <option key={g} value={g}>{g}</option>)}</select> : <b style={{ color: GC[r.grade] }}>{r.grade || '-'}</b>}</td>
          <td>{canEdit ? <input type="date" defaultValue={r.next_on ?? ''} onBlur={e => { if (e.target.value !== (r.next_on ?? '')) patch(r, { next_on: e.target.value || null }); }} style={{ ...inp, width: 124, display: 'block', background: 'rgba(255,255,255,.6)', color: late ? '#B42318' : undefined, fontWeight: late ? 800 : undefined }} /> : <span style={{ color: late ? '#B42318' : undefined }}>{r.next_on ?? ''} {r.alarm_time}</span>}
            {canEdit && <input type="time" defaultValue={r.alarm_time ?? ''} title="이 시각에 알림이 옵니다 (비우면 아침에 한 번만)" onBlur={e => { if (e.target.value !== (r.alarm_time ?? '')) { if (e.target.value && !r.next_on) return notify('날짜를 먼저 정해 주세요', 'bad'); patch(r, { alarm_time: e.target.value }); } }} style={{ ...inp, width: 124, display: 'block', marginTop: 3, background: 'rgba(255,255,255,.6)' }} />}{late && <div style={{ fontSize: 11, color: '#B42318', fontWeight: 700 }}>{r.next_on === today ? '오늘 연락' : '약속 지남'}</div>}</td>
          <td><Area r={r} k="note1" /></td><td><Area r={r} k="note2" /></td><td><Area r={r} k="note3" /></td>
          <td style={{ whiteSpace: 'nowrap' }}>{canEdit ? <input key={r.expect_amt ?? 'x'} inputMode="numeric" defaultValue={r.expect_amt ? r.expect_amt.toLocaleString() : ''} placeholder="원" onBlur={e => { const n = Number(e.target.value.replace(/[^\d]/g, '')) || null; if (n !== (r.expect_amt ?? null)) patch(r, { expect_amt: n }); }} style={{ ...inp, width: 104, textAlign: 'right', fontWeight: 700, background: 'rgba(255,255,255,.6)' }} /> : <b>{r.expect_amt ? r.expect_amt.toLocaleString() : ''}</b>}
            {!!r.meta_id && <div style={{ marginTop: 4, textAlign: 'right' }}>{r.paid_amt != null && <div style={{ fontSize: 11.5, lineHeight: 1.45 }}>결제 <b>{r.paid_amt.toLocaleString()}</b><br /><span style={{ color: '#067647', fontWeight: 700 }}>마진 {(r.paid_amt - (r.cost_amt ?? 0)).toLocaleString()}</span></div>}
              {(canEdit || r.paid_amt != null) && <button type="button" className="btn ghost" onClick={() => setPay(r.meta_id!)} style={{ padding: '2px 8px', fontSize: 11.5, minHeight: 0, marginTop: 2, borderColor: paid && r.paid_amt == null ? '#F04438' : undefined, color: paid && r.paid_amt == null ? '#B42318' : undefined }}>{r.paid_amt != null ? '결제 내역' : paid ? '결제 금액 입력' : '+ 결제'}</button>}</div>}</td>
          <td>{canEdit ? <select value={r.status} onChange={e => patch(r, { status: e.target.value })} style={{ ...inp, width: 70, fontWeight: 700, color: paid ? '#067647' : r.status === '이탈' ? '#C11574' : 'inherit', background: 'transparent' }}>{(r.meta_id ? META_STATUSES : STATUSES.includes(r.status) ? STATUSES : [...STATUSES, r.status]).map(s => <option key={s}>{s}</option>)}</select> : <b style={{ color: paid ? '#067647' : r.status === '이탈' ? '#C11574' : undefined }}>{r.status}</b>}{!!r.meta_id && <div style={{ fontSize: 10.5, fontWeight: 800, color: '#6941C6', marginTop: 2 }}>메타 인바운드</div>}</td>
          <td><Txt r={r} k="gender" w={34} /></td>
          <td style={{ minWidth: 190 }}>{canEdit ? <><Txt r={r} k="url" w={170} ph="상품 링크 (…/products/번호)" /><div style={{ fontSize: 11, marginTop: 2 }}>{r.url && <a href={/^https?:/i.test(r.url.trim()) ? r.url.trim() : `https://${r.url.trim()}`} target="_blank" rel="noreferrer">열기</a>}{r.url && !/\/(products|catalog)\/\d+/.test(r.url) && <span style={{ color: '#B54708', marginLeft: 6 }}>상품 링크 아님 — 순위 조회 불가</span>}{r.url2 && <> · <a href={/^https?:/i.test(r.url2.trim()) ? r.url2.trim() : `https://${r.url2.trim()}`} target="_blank" rel="noreferrer">URL2</a></>}</div></>
            : <>{r.url ? <a href={/^https?:/i.test(r.url.trim()) ? r.url.trim() : `https://${r.url.trim()}`} target="_blank" rel="noreferrer">열기</a> : ''}{r.url2 ? <> · <a href={/^https?:/i.test(r.url2.trim()) ? r.url2.trim() : `https://${r.url2.trim()}`} target="_blank" rel="noreferrer">2</a></> : ''}</>}</td>
          {trash && <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{(r.deleted_at ?? '').slice(0, 10)}</td>}</tr>
          {open === r.id && <tr><td colSpan={17} style={{ background: '#F8FAFF', padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div><b>{r.name} · 순위 이력</b> <span className="cell-sub">위쪽이 1위 · 점 위에 마우스를 올리면 조회 시각</span><RankChart h={r.rank_hist ?? []} w={560} ht={190} big /></div>
              <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12.5 }}><table style={{ fontSize: 12.5 }}><thead><tr><th>조회 시각</th><th>키워드</th><th className="num">순위</th><th className="num">변동</th></tr></thead><tbody>
                {[...(r.rank_hist ?? [])].map((p, i, a) => ({ p, prev: i ? a[i - 1] : null })).reverse().map(({ p, prev }, i) => { const d = prev && prev.r && p.r ? prev.r - p.r : 0; return <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{kstMD(p.t)}</td><td>{p.k}</td><td className="num" style={{ fontWeight: 700 }}>{p.r ? `${p.r}위` : '100위 밖'}</td><td className="num" style={{ color: d > 0 ? '#067647' : d < 0 ? '#B42318' : '#98A2B3' }}>{d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : prev ? (prev.r && !p.r ? '이탈' : !prev.r && p.r ? '진입' : '-') : ''}</td></tr>; })}</tbody></table></div>
            </div></td></tr>}</Fragment>; })}
          {view.length > shown && <tr><td colSpan={17} style={{ textAlign: 'center', padding: 14 }}><button type="button" className="btn" onClick={() => setShown(n => n + 100)}>100건 더 보기 ({shown} / {view.length})</button> <button type="button" className="btn ghost" onClick={() => setShown(view.length)}>전부 보기</button></td></tr>}</tbody></table></div>
        : <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>{trash ? '지운 DB 가 없습니다' : rows.length ? '조건에 맞는 DB 가 없습니다' : '아직 DB 가 없습니다 — 「엑셀 올리기」로 쓰던 파일을 올리거나 「+ 한 건 추가」를 눌러 주세요'}</div>}
    </div>
  </div>;
}
