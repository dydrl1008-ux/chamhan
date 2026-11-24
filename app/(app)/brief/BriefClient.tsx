'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { normKw, volBandOf, type BriefKw, type BriefRow, type Buckets, type BriefSummary, type Pct } from '@/lib/brief';
import { saveBrief, saveBuckets, addRef, delRef, type BriefRef } from './actions';
import { josa } from '@/lib/proposalV3';

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2';
const FONT_CSS = [['Regular', 400], ['SemiBold', 600], ['ExtraBold', 800]].map(([n, w]) => `@font-face{font-family:'BriefPretendard';font-weight:${w};font-style:normal;font-display:swap;src:url('${FONT_BASE}/Pretendard-${n}.woff2') format('woff2')}`).join('');
const C = { ink: '#0B1220', text: '#28303F', sub: '#5B6577', mute: '#8A93A3', line: '#E3E8F0', bg: '#F5F7FB', navy: '#111C3A', blue: '#2F5BFF', blueSoft: '#EEF3FF', green: '#0F9D6B', greenSoft: '#E8F7F0', amber: '#B7791F', amberSoft: '#FFF6E3', red: '#D8453B' };
const int = (t: string) => { const m = String(t ?? '').replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : null; };
const delta = (t: string) => { const n = int(t); if (n == null) return /-|—|0/.test(String(t ?? '')) ? 0 : null; return /▼|-\s*\d/.test(t) ? -n : n; };

/** 셀팜 「슬롯 운영」 화면의 MID·키워드 표를 찾아 행으로 — HTML(파일·복사한 서식)과 일반 텍스트(탭 구분) 모두 */
export function parseTable(cells: string[][]): BriefRow[] {
  // 머리글은 정렬 화살표·공백·괄호가 붙어도 알아보게 한글·영문·숫자만 남겨 비교한다 (셀팜 화면이 조금 바뀌어도 읽히게)
  const nh = (c: string) => String(c ?? '').replace(/[^가-힣A-Za-z0-9]/g, '');
  const col = (h: string[], ...names: string[]) => { for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; } for (const n of names) { const i = h.findIndex(c => c.startsWith(n)); if (i >= 0) return i; } return -1; };
  const hi = cells.findIndex(r => { const h = r.map(nh); return col(h, '키워드') >= 0 && col(h, '슬롯수', '슬롯') >= 0 && col(h, '현재순위', '현재', '순위') >= 0; });
  if (hi < 0) return [];
  const h = cells[hi].map(nh);
  const ik = col(h, '키워드'), iv = col(h, '검색량', '월검색량', '월간검색량'), is = col(h, '슬롯수', '슬롯'), ir = col(h, '현재순위', '현재', '순위'), ib = col(h, '라이브최고', '최고순위', '최고'), id = col(h, '등록대비'), ip = col(h, '전일대비');
  const out: BriefRow[] = [];
  for (const r of cells.slice(hi + 1)) {
    if (r.length < h.length - 2) { if (out.length) break; continue; }
    const k = (r[ik] ?? '').trim(); if (!k || nh(k) === '키워드') continue;
    out.push({ k, v: iv >= 0 ? int(r[iv]) : null, s: is >= 0 ? int(r[is]) : null, r: ir >= 0 ? int(r[ir]) : null, b: ib >= 0 ? int(r[ib]) : null, d: id >= 0 ? delta(r[id] ?? '') : null, p: ip >= 0 ? delta(r[ip] ?? '') : null });
  }
  return out;
}
function parseAny(html: string, text: string): BriefRow[] {
  if (html && /<table/i.test(html)) {
    const doc = new DOMParser().parseFromString(html, 'text/html'); let best: BriefRow[] = [];
    doc.querySelectorAll('table').forEach(t => { const rows = Array.from(t.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(c => (c.textContent ?? '').replace(/\s+/g, ' ').trim())); const r = parseTable(rows); if (r.length > best.length) best = r; });
    if (best.length) return best;
  }
  return parseTable(text.split(/\r?\n/).map(l => l.split('\t').map(c => c.trim())));
}

export default function BriefClient({ list, buckets, at, n, err, initKws, summary, canEdit = true, refs = [] }: { canEdit?: boolean; refs?: BriefRef[]; list: BriefKw[]; buckets: Buckets; at: string | null; n: number; err: string; initKws?: string; summary: BriefSummary | null }) {
  const router = useRouter(); const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(''); const [kwText, setKwText] = useState(initKws ?? ''); const [q, setQ] = useState(''); const [pasteInfo, setPasteInfo] = useState('');
  const [slots, setSlots] = useState(buckets.slots.join(', ')); const [ranks, setRanks] = useState(buckets.ranks.join(', ')); const [good, setGood] = useState(String(buckets.good ?? 40));
  const [title, setTitle] = useState(''); const [who, setWho] = useState(''); const [brand, setBrand] = useState('참한기획');
  const [show, setShow] = useState({ dist: true, keep: true, band: true, risers: true, vol: true });
  useEffect(() => { try { if (!initKws) setKwText(localStorage.getItem('wh.brief.kws') ?? ''); setWho(localStorage.getItem('wh.brief.who') ?? ''); } catch {} }, []);
  const keep = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };
  const byKey = useMemo(() => new Map(list.map(x => [x.key, x])), [list]);
  const wanted = useMemo(() => [...new Set(kwText.split(/[\n,]+/).map(t => t.trim()).filter(Boolean))], [kwText]);
  const rows = useMemo(() => wanted.map(w => byKey.get(normKw(w))).filter((x): x is BriefKw => !!x).filter((x, i, a) => a.findIndex(y => y.key === x.key) === i).sort((a, b) => a.ro - b.ro || (b.v ?? 0) - (a.v ?? 0)), [wanted, byKey]);
  const missing = wanted.filter(w => !byKey.has(normKw(w)));
  const found = useMemo(() => { const k = normKw(q); return k ? list.filter(x => x.key.includes(k)).slice(0, 40) : []; }, [q, list]);
  const add = (k: string) => { if (wanted.some(w => normKw(w) === normKw(k))) return; const v = (kwText.trim() ? kwText.trim() + '\n' : '') + k; setKwText(v); keep('wh.brief.kws', v); };
  const remove = (k: string) => { const v = wanted.filter(w => normKw(w) !== normKw(k)).join('\n'); setKwText(v); keep('wh.brief.kws', v); };

  const upload = async (html: string, text: string) => {
    const parsed = parseAny(html, text);
    if (!parsed.length) {   // 왜 못 찾았는지 화면에 보여 준다 — 머리글 줄에 '키워드·슬롯수·현재순위'가 한 줄(탭 구분)로 있어야 한다
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean); const near = lines.filter(l => /키워드|슬롯|순위/.test(l)).slice(0, 3).map(l => l.replace(/\t/g, ' | ').slice(0, 110));
      setPasteInfo(`붙여 넣은 내용 ${lines.length}줄 · 표(<table>) ${/<table/i.test(html) ? '있음' : '없음'} · 탭으로 나뉜 줄 ${lines.filter(l => l.includes('\t')).length}줄${near.length ? ' · 머리글 후보: ' + near.join(' ‖ ') : ' · 「키워드/슬롯/순위」가 들어간 줄이 없습니다'}`);
      return notify('표를 찾지 못했습니다 — 셀팜 「슬롯 운영」 화면에서 Ctrl+A → Ctrl+C 한 뒤 여기에 붙여넣어 주세요', 'bad'); }
    setPasteInfo('');
    setBusy('up'); const r = await saveBrief(parsed); setBusy(''); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) router.refresh();
  };
  const onPaste = (e: React.ClipboardEvent) => { e.preventDefault(); upload(e.clipboardData.getData('text/html'), e.clipboardData.getData('text/plain')); };
  const onFile = async (f?: File | null) => { if (!f) return; const t = await f.text(); upload(/<table/i.test(t) ? t : '', t); };
  const [rf, setRf] = useState({ keyword: '', vol: '', slots: '', rank: '', up: '' });
  const addMine = async () => { setBusy('rf'); const r = await addRef({ keyword: rf.keyword, vol: Number(rf.vol) || null, slots: Number(rf.slots) || null, rank: Number(rf.rank) || null, up: Number(rf.up) || null }); setBusy(''); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { add(rf.keyword.trim()); setRf({ keyword: '', vol: '', slots: '', rank: '', up: '' }); router.refresh(); } };
  const delMine = async (id: number) => { setBusy('rf'); const r = await delRef(id); setBusy(''); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) router.refresh(); };
  const nums = (t: string) => t.split(/[,\s]+/).map(Number).filter(x => x > 0);
  const saveBk = async () => { setBusy('bk'); const r = await saveBuckets({ slots: nums(slots), ranks: nums(ranks), good: Number(good) || 40 }); setBusy(''); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) router.refresh(); };

  const png = async () => { if (!sheet.current) return null; const { toPng } = await import('html-to-image'); return toPng(sheet.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true }); };
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const [curKey, setCurKey] = useState(''); const [slotText, setSlotText] = useState('');
  const one = rows.find(r => r.key === curKey) ?? rows[0] ?? null;   // 브리핑은 항상 키워드 하나 (전화 뒤에 남기는 한 장). 여러 개 넣으면 골라 가며 뽑는다
  const oneSlot = slotText.trim() || one?.cases[0]?.slot || '';   // 진행 규모는 직접 고쳐 쓸 수 있다
  const autoTitle = one ? `「${one.k}」 키워드 제안 브리핑` : '키워드 제안 브리핑'; const shownTitle = title.trim() || autoTitle;
  const volBand = volBandOf;
  const top10 = summary?.dist[0]?.pct ?? 0, page1 = top10 + (summary?.dist[1]?.pct ?? 0);   // 41위 밖은 이미지에 넣지 않는다
  const GOOD_PCT = 80;   // 같은 조건 칸은 수치가 좋을 때만 넣는다
  const sameVol = one && summary ? summary.byVol.find(x => x.label === volBandOf(one.v) && x.pct >= GOOD_PCT) : undefined; const sameSlot = one && summary ? summary.bySlot.find(x => x.label === one.sb && x.pct >= GOOD_PCT) : undefined;
  const hk: React.CSSProperties = { background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: '14px 14px', textAlign: 'center' }; const hkN: React.CSSProperties = { fontSize: 38, fontWeight: 800, letterSpacing: '-.03em', color: '#7CF0BE', lineHeight: 1.1 }; const hkL: React.CSSProperties = { fontSize: 13, color: '#C9D3EA', marginTop: 4 };
  const wins = (summary?.wins ?? []).filter(x => x.key !== one?.key).slice(0, 5);   // 지금 브리핑하는 키워드는 빼고 5건
  const hot = one ? one.ro <= 2 : false;   // 10위 이내 구간에 있는 키워드
  const copy = async () => { setBusy('copy'); try { const u = await png(); if (!u) return; const blob = await (await fetch(u)).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); notify('이미지 복사됨 — 카톡 창에 Ctrl+V', 'ok'); } catch (e: any) { notify('복사 실패 — 「PNG 저장」을 써 주세요 (' + (e?.message ?? '') + ')', 'bad'); } finally { setBusy(''); } };
  const save = async () => { setBusy('png'); try { const u = await png(); if (!u) return; const a = document.createElement('a'); a.href = u; a.download = `키워드브리핑_${one ? one.k + '_' : ''}${today}.png`; a.click(); notify('PNG 저장됨', 'ok'); } catch (e: any) { notify('저장 실패: ' + (e?.message ?? ''), 'bad'); } finally { setBusy(''); } };

  const rankTone = (ro: number) => ro === 1 ? [C.green, C.greenSoft] : ro === 2 ? [C.blue, C.blueSoft] : ro <= 3 ? [C.amber, C.amberSoft] : [C.sub, C.bg];
  const trend = (t: string) => t === '상승' || t === '유지' ? <b style={{ color: C.green }}>▲ 상승·유지</b> : null;   // 상승·유지는 묶어서 표기
  const DIST = [C.green, C.blue, '#8FA5F5', '#D5DBE8']; const pc = (v: number) => `${Math.round(v)}%`;
  const box: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', background: '#fff' };
  const cap: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: C.sub, letterSpacing: '.02em' };
  const Bars = ({ items, hi }: { items: Pct[]; hi?: string }) => <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>{items.map(x => <div key={x.label} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 44px', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
    <span style={{ color: x.label === hi ? C.blue : C.text, fontWeight: x.label === hi ? 800 : 600 }}>{x.label}</span>
    <div style={{ height: 8, borderRadius: 99, background: C.bg, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, x.pct)}%`, height: '100%', borderRadius: 99, background: C.green }} /></div>
    <b style={{ textAlign: 'right', color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{pc(x.pct)}</b></div>)}</div>;
  const th: React.CSSProperties = { padding: '11px 14px', fontSize: 12.5, fontWeight: 600, color: '#C9D3EA', textAlign: 'left', letterSpacing: '.02em', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '13px 14px', fontSize: 15, color: C.text, borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' };

  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 18, alignItems: 'start' }}>
    <style dangerouslySetInnerHTML={{ __html: FONT_CSS }} />
    <div style={{ display: 'grid', gap: 14 }}>
      {err && <div className="card" style={{ padding: 14, color: '#B42318' }}>{err}</div>}
      {canEdit && <div className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
        <b>① 진행 현황 넣기</b>
        <div className="cell-sub">셀팜 「슬롯 운영」 화면에서 <b>Ctrl+A → Ctrl+C</b> 한 뒤 아래 칸을 누르고 <b>Ctrl+V</b>. (또는 Ctrl+S 로 저장한 .html 파일 올리기)</div>
        <textarea rows={2} readOnly value="" placeholder={busy === 'up' ? '읽는 중…' : '여기를 누르고 Ctrl+V'} onPaste={onPaste} style={{ resize: 'none' }} />
        {pasteInfo && <div style={{ fontSize: 12.5, color: '#B54708', wordBreak: 'break-all' }}>{pasteInfo}</div>}
        <input type="file" accept=".html,.htm,.txt" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="cell-sub">{at ? `마지막 반영: ${new Date(at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '아직 넣은 데이터가 없습니다'}</div>
      </div>}
      <div className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
        <b>② 브리핑할 키워드</b>
        <div className="cell-sub">브리핑은 키워드 하나에 한 장입니다 (전화 뒤에 남기는 용도). 여러 개 넣어 두고 아래에서 골라 가며 뽑을 수 있습니다.</div>
        <textarea rows={6} value={kwText} onChange={e => { setKwText(e.target.value); keep('wh.brief.kws', e.target.value); }} placeholder={'가습기\n제모기\n식전영상'} />
        {rows.length > 1 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{rows.map(r => <button key={r.key} type="button" className={r.key === one?.key ? 'btn xs' : 'btn ghost xs'} onClick={() => { setCurKey(r.key); setSlotText(''); }}>{r.k}</button>)}</div>}
        {missing.length > 0 && <div className="cell-sub">브리핑에 안 나옴 (진행 현황에 없거나 표시 기준 밖): {missing.slice(0, 12).join(', ')}{missing.length > 12 ? ` 외 ${missing.length - 12}` : ''}</div>}
        <label>키워드 검색<input value={q} onChange={e => setQ(e.target.value)} placeholder="일부만 입력해도 찾습니다" /></label>
        {q.trim() && <div style={{ display: 'grid', gap: 4, maxHeight: 260, overflow: 'auto' }}>
          {found.length === 0 && <div className="cell-sub">브리핑할 수 있는 키워드가 아닙니다 (진행 현황에 없거나 표시 기준 밖)</div>}
          {found.map(x => <div key={x.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', border: `1px solid ${C.line}`, borderRadius: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}><b>{x.k}</b><div className="cell-sub">{[x.vol, x.cases[0]?.slot, x.cases[0]?.rank, x.cases[0]?.trend].filter(Boolean).join(' · ')}</div></div>
            {rows.some(r => r.key === x.key) ? <span className="cell-sub">추가됨</span> : <button type="button" className="btn ghost xs" onClick={() => add(x.k)}>추가</button>}</div>)}
        </div>}
      </div>
      <div className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
        <b>③ 표 설정</b>
        <label>진행 규모 표시 (비우면 자동: {one?.cases[0]?.slot || '—'})<input value={slotText} onChange={e => setSlotText(e.target.value)} placeholder="예: 5~10개" /></label>
        <label>제목 (비우면 자동)<input value={title} onChange={e => setTitle(e.target.value)} placeholder={autoTitle} /></label>
        <label>표시 이름<input value={brand} onChange={e => setBrand(e.target.value)} /></label>
        <label>담당자 · 연락처 (맨 아래 표시)<input value={who} onChange={e => { setWho(e.target.value); keep('wh.brief.who', e.target.value); }} placeholder="예: 홍길동 010-0000-0000" /></label>
        {canEdit && <><label>슬롯 구간 경계<input value={slots} onChange={e => setSlots(e.target.value)} placeholder="5, 10, 20, 30, 50" /></label>
        <label>순위 구간 경계<input value={ranks} onChange={e => setRanks(e.target.value)} placeholder="5, 10, 20, 40, 100" /></label>
        <label>표시 기준 순위 (이 순위 안에 있는 키워드만 브리핑에 나옴)<input type="number" value={good} onChange={e => setGood(e.target.value)} /></label>
        <div className="cell-sub">예) 슬롯 경계 5, 10 → 10개는 「5~10개」 · 순위 경계 5, 10 → 3위·5위는 「5위 이내」</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>{([['dist', '10위·1페이지 비율'], ['keep', '상승·유지 비율'], ['band', '같은 조건 비율'], ['risers', '검색량 높은 진행 사례'], ['vol', '이 키워드 검색량 표시']] as const).map(([k, l]) => <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><input type="checkbox" style={{ width: 'auto' }} checked={show[k]} onChange={e => setShow(v => ({ ...v, [k]: e.target.checked }))} />{l}</label>)}</div>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={saveBk}>{busy === 'bk' ? '저장 중…' : '구간 저장'}</button></>}
      </div>
      <div className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
        <b>④ 내 레퍼런스</b>
        <div className="cell-sub">다른 상품으로 진행한 건을 직접 적어 두는 칸입니다. 본인 것만 쓰이고, 브리핑에는 구간으로 바뀌어 나옵니다 (표시 기준 순위 밖이면 안 나옴).</div>
        <label>키워드<input value={rf.keyword} onChange={e => setRf(v => ({ ...v, keyword: e.target.value }))} placeholder="예: 가습기" /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>진행 규모 (개)<input type="number" value={rf.slots} onChange={e => setRf(v => ({ ...v, slots: e.target.value }))} placeholder="10" /></label>
          <label>현재 순위<input type="number" value={rf.rank} onChange={e => setRf(v => ({ ...v, rank: e.target.value }))} placeholder="3" /></label>
          <label>월 검색량 (선택)<input type="number" value={rf.vol} onChange={e => setRf(v => ({ ...v, vol: e.target.value }))} /></label>
          <label>등록 후 상승폭 (선택)<input type="number" value={rf.up} onChange={e => setRf(v => ({ ...v, up: e.target.value }))} /></label>
        </div>
        <button type="button" className="btn ghost" disabled={!!busy || !rf.keyword.trim() || !rf.rank} onClick={addMine}>{busy === 'rf' ? '처리 중…' : '레퍼런스 추가'}</button>
        {refs.length > 0 && <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflow: 'auto' }}>{refs.map(r => <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', border: `1px solid ${C.line}`, borderRadius: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}><b>{r.keyword}</b><div className="cell-sub">{[r.slots ? `${r.slots}개` : '', r.rank_now ? `${r.rank_now}위` : '', r.vol ? `월 ${r.vol.toLocaleString()}` : '', r.up ? `▲${r.up}` : ''].filter(Boolean).join(' · ')}</div></div>
          <button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => add(r.keyword)}>브리핑</button><button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => delMine(r.id)}>삭제</button></div>)}</div>}
      </div>
    </div>

    <div style={{ display: 'grid', gap: 10, justifyItems: 'start', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" disabled={!!busy || (!rows.length && !summary)} onClick={copy}>{busy === 'copy' ? '복사 중…' : '이미지 복사'}</button>
        <button type="button" className="btn ghost" disabled={!!busy || (!rows.length && !summary)} onClick={save}>{busy === 'png' ? '저장 중…' : 'PNG 저장'}</button>
        <span className="cell-sub" style={{ alignSelf: 'center' }}>{rows.length ? '' : '왼쪽에서 키워드를 넣으면 브리핑이 만들어집니다'}</span>
      </div>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <div ref={sheet} style={{ width: 760, background: '#fff', fontFamily: "'BriefPretendard','Pretendard',system-ui,sans-serif", color: C.ink, border: `1px solid ${C.line}`, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
          <div style={{ background: C.navy, color: '#fff', padding: '26px 30px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#9FB2E8', letterSpacing: '.08em' }}>KEYWORD BRIEFING{brand.trim() ? ` · ${brand.trim()}` : ''}</div>
              <div style={{ fontSize: 13, color: '#9FB2E8' }}>{today.replace(/-/g, '.')} 기준</div></div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', marginTop: 8, lineHeight: 1.3 }}>{title.trim() || (one ? (one.cases[0] && one.ro < 900 ? <>「{one.k}」, 지금 <span style={{ color: '#7CF0BE' }}>{one.cases[0].rank}</span>에 있습니다</> : <>「{one.k}」, 지금 저희가 진행 중입니다</>) : autoTitle)}</div>
            <div style={{ fontSize: 14.5, color: '#C9D3EA', marginTop: 6 }}>{one?.v != null && show.vol ? `매달 ${one.v.toLocaleString('ko-KR')}번 검색되는 키워드입니다. 1페이지는 40자리, 그중 10위 안은 10자리뿐입니다.` : '1페이지는 40자리, 그중 10위 안은 10자리뿐입니다.'}</div>
          </div>
          {one && <div style={{ padding: '22px 30px 6px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.03em', color: C.ink }}>{one.k}</div>
              {one.v != null && show.vol && <div style={{ fontSize: 15, color: C.sub }}>월 검색량 <b style={{ color: C.ink, fontSize: 18 }}>{one.v.toLocaleString('ko-KR')}</b>회</div>}</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${one.cases[0]?.trend ? 3 : 2}, 1fr)`, gap: 10, marginTop: 14 }}>
              {([['진행 규모', oneSlot || '—', C.ink, C.bg], ['현재 순위', one.cases[0]?.rank ?? '—', rankTone(one.ro)[0], rankTone(one.ro)[1]], ...(one.cases[0]?.trend ? [['등록 대비', '상승·유지', C.green, C.greenSoft]] : [])] as [string, string, string, string][]).map(([l, v, fg, bg]) => <div key={l} style={{ background: bg, borderRadius: 14, padding: '14px 16px' }}><div style={{ fontSize: 12.5, fontWeight: 600, color: C.sub }}>{l}</div><div style={{ fontSize: 24, fontWeight: 800, color: fg, letterSpacing: '-.02em', marginTop: 2 }}>{v}</div></div>)}</div>
            <div style={{ fontSize: 15.5, lineHeight: 1.65, color: C.text, marginTop: 14 }}><div>「{one.k}」{josa(one.k, '은/는')} <b style={{ color: C.ink }}>지금 저희가 직접 진행하고 있는 키워드</b>입니다.</div><div>{hot ? <>이 키워드에서 <b style={{ color: C.ink }}>{one.cases[0]?.rank}</b> 자리를 잡는 방법을 이미 알고 있습니다.</> : <>현재 <b style={{ color: C.ink }}>{one.cases[0]?.rank}</b>에 있으며, 진행 규모는 <b style={{ color: C.ink }}>{oneSlot || '확인 후 안내'}</b> 구간입니다.</>}</div></div>
            {one.cases.length > 1 && <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>{one.cases.slice(1, 4).map((c, i) => <div key={i} style={{ display: 'flex', gap: 10, fontSize: 14, color: C.sub, padding: '8px 12px', background: C.bg, borderRadius: 10 }}><span style={{ minWidth: 150 }}>같은 키워드 다른 진행 건</span><b style={{ color: C.text, minWidth: 70 }}>{c.slot || '—'}</b><b style={{ color: C.text, minWidth: 84 }}>{c.rank}</b>{c.trend && <span style={{ color: C.green, fontWeight: 600 }}>▲ 상승·유지</span>}</div>)}</div>}
          </div>}
          
          {summary && (show.dist || show.keep || show.band || show.risers) && <div style={{ padding: one ? '12px 30px 18px' : '20px 30px 6px', display: 'grid', gap: 12, background: one ? '#fff' : C.bg }}>
            {(show.dist || show.keep) && <div style={{ background: C.navy, borderRadius: 16, padding: '20px 22px', color: '#fff' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#9FB2E8', letterSpacing: '.04em' }}>진행 중인 키워드 순위 분포</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${show.dist && show.keep && summary.keep != null ? 3 : show.dist ? 2 : 1}, 1fr)`, gap: 10, marginTop: 10 }}>
                {show.dist && <div style={hk}><div style={hkN}>{pc(top10)}</div><div style={hkL}>10위 이내</div></div>}
                {show.dist && <div style={hk}><div style={hkN}>{pc(page1)}</div><div style={hkL}>1페이지 (40위 이내)</div></div>}
                {show.keep && summary.keep != null && <div style={hk}><div style={hkN}>{pc(summary.keep)}</div><div style={hkL}>등록 후 상승·유지</div></div>}
              </div></div>}
            {show.band && one && (sameVol || sameSlot) && <div style={{ display: 'grid', gridTemplateColumns: sameVol && sameSlot ? '1fr 1fr' : '1fr', gap: 12 }}>
              {sameVol && <div style={{ ...box, borderColor: C.blue, borderWidth: 1.5 }}><div style={cap}>{show.vol ? `「${one.k}」처럼 월 검색량 ${sameVol.label} 키워드도` : `「${one.k}」${'와 비슷한 규모의 키워드도'}`}</div><div style={{ fontSize: 30, fontWeight: 800, color: C.blue, letterSpacing: '-.03em', marginTop: 4 }}>{pc(sameVol.pct)}<span style={{ fontSize: 15, fontWeight: 600, color: C.sub, marginLeft: 8 }}>가 1페이지</span></div></div>}
              {sameSlot && <div style={{ ...box, borderColor: C.green, borderWidth: 1.5 }}><div style={cap}>진행 규모 {sameSlot.label} 구간은</div><div style={{ fontSize: 30, fontWeight: 800, color: C.green, letterSpacing: '-.03em', marginTop: 4 }}>{pc(sameSlot.pct)}<span style={{ fontSize: 15, fontWeight: 600, color: C.sub, marginLeft: 8 }}>가 1페이지</span></div></div>}
            </div>}
            {show.band && !one && (summary.byVol.length > 0 || summary.bySlot.length > 0) && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {summary.byVol.length > 0 && <div style={box}><div style={cap}>월 검색량별 1페이지 비율</div><Bars items={summary.byVol.filter(x => x.pct >= GOOD_PCT)} /></div>}
              {summary.bySlot.length > 0 && <div style={box}><div style={cap}>진행 규모별 1페이지 비율</div><Bars items={summary.bySlot.filter(x => x.pct >= GOOD_PCT)} /></div>}
            </div>}
            {show.risers && wins.length >= 3 && <div style={box}><div style={cap}>검색량 높은 키워드도 이렇게 올라왔습니다 (등록 후 상승폭)</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wins.length}, 1fr)`, gap: 8, marginTop: 10 }}>{wins.map((x, i) => <div key={i} style={{ background: C.bg, borderRadius: 12, padding: '12px 8px', textAlign: 'center', minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.sub }}>월 검색량 {x.vol}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.green, marginTop: 2 }}>▲ {x.up}<span style={{ fontSize: 13 }}>위</span></div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginTop: 2 }}>지금 {x.rank}</div></div>)}</div></div>}
          </div>}
          <div style={{ padding: '16px 30px 18px', background: C.bg, display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.ink, lineHeight: 1.5 }}>상품 URL만 보내 주세요. {one ? `「${one.k}」 기준으로 ` : ''}대표님 상품 분석부터 해 드립니다.</div>
            {who.trim() && <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{who.trim()}</div>}
            <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.6 }}>비율과 구간으로 표기했습니다 · 1페이지는 40위 이내 · 상승·유지는 등록 시점 대비 · 순위는 매일 바뀔 수 있습니다</div></div>
        </div>
      </div>
    </div>
  </div>;
}
