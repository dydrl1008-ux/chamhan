'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { normKw, type BriefKw, type BriefRow, type Buckets, type BriefSummary, type Pct } from '@/lib/brief';
import { saveBrief, saveBuckets } from './actions';

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2';
const FONT_CSS = [['Regular', 400], ['SemiBold', 600], ['ExtraBold', 800]].map(([n, w]) => `@font-face{font-family:'BriefPretendard';font-weight:${w};font-style:normal;font-display:swap;src:url('${FONT_BASE}/Pretendard-${n}.woff2') format('woff2')}`).join('');
const C = { ink: '#0B1220', text: '#28303F', sub: '#5B6577', mute: '#8A93A3', line: '#E3E8F0', bg: '#F5F7FB', navy: '#111C3A', blue: '#2F5BFF', blueSoft: '#EEF3FF', green: '#0F9D6B', greenSoft: '#E8F7F0', amber: '#B7791F', amberSoft: '#FFF6E3', red: '#D8453B' };
const int = (t: string) => { const m = String(t ?? '').replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : null; };
const delta = (t: string) => { const n = int(t); if (n == null) return /-|—|0/.test(String(t ?? '')) ? 0 : null; return /▼|-\s*\d/.test(t) ? -n : n; };

/** 셀팜 「슬롯 운영」 화면의 MID·키워드 표를 찾아 행으로 — HTML(파일·복사한 서식)과 일반 텍스트(탭 구분) 모두 */
export function parseTable(cells: string[][]): BriefRow[] {
  const hi = cells.findIndex(r => r.includes('키워드') && r.some(c => c.replace(/\s/g, '') === '슬롯수') && r.some(c => c.replace(/\s/g, '') === '현재순위'));
  if (hi < 0) return [];
  const h = cells[hi].map(c => c.replace(/\s/g, '')); const ix = (n: string) => h.indexOf(n);
  const ik = ix('키워드'), iv = ix('검색량'), is = ix('슬롯수'), ir = ix('현재순위'), ib = ix('라이브최고'), id = ix('등록대비'), ip = ix('전일대비');
  const out: BriefRow[] = [];
  for (const r of cells.slice(hi + 1)) {
    if (r.length < h.length - 2) { if (out.length) break; continue; }
    const k = (r[ik] ?? '').trim(); if (!k || k === '키워드') continue;
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

export default function BriefClient({ list, buckets, at, n, err, initKws, summary }: { list: BriefKw[]; buckets: Buckets; at: string | null; n: number; err: string; initKws?: string; summary: BriefSummary | null }) {
  const router = useRouter(); const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(''); const [kwText, setKwText] = useState(initKws ?? ''); const [q, setQ] = useState('');
  const [slots, setSlots] = useState(buckets.slots.join(', ')); const [ranks, setRanks] = useState(buckets.ranks.join(', '));
  const [title, setTitle] = useState('키워드 진행 브리핑'); const [who, setWho] = useState('');
  const [show, setShow] = useState({ dist: true, keep: true, band: true, risers: true });
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
    if (!parsed.length) return notify('표를 찾지 못했습니다 — 셀팜 「슬롯 운영」 화면에서 Ctrl+A → Ctrl+C 한 뒤 여기에 붙여넣어 주세요', 'bad');
    setBusy('up'); const r = await saveBrief(parsed); setBusy(''); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) router.refresh();
  };
  const onPaste = (e: React.ClipboardEvent) => { e.preventDefault(); upload(e.clipboardData.getData('text/html'), e.clipboardData.getData('text/plain')); };
  const onFile = async (f?: File | null) => { if (!f) return; const t = await f.text(); upload(/<table/i.test(t) ? t : '', t); };
  const nums = (t: string) => t.split(/[,\s]+/).map(Number).filter(x => x > 0);
  const saveBk = async () => { setBusy('bk'); const r = await saveBuckets({ slots: nums(slots), ranks: nums(ranks) }); setBusy(''); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) router.refresh(); };

  const png = async () => { if (!sheet.current) return null; const { toPng } = await import('html-to-image'); return toPng(sheet.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true }); };
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const copy = async () => { setBusy('copy'); try { const u = await png(); if (!u) return; const blob = await (await fetch(u)).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); notify('이미지 복사됨 — 카톡 창에 Ctrl+V', 'ok'); } catch (e: any) { notify('복사 실패 — 「PNG 저장」을 써 주세요 (' + (e?.message ?? '') + ')', 'bad'); } finally { setBusy(''); } };
  const save = async () => { setBusy('png'); try { const u = await png(); if (!u) return; const a = document.createElement('a'); a.href = u; a.download = `영업브리핑_${today}.png`; a.click(); notify('PNG 저장됨', 'ok'); } catch (e: any) { notify('저장 실패: ' + (e?.message ?? ''), 'bad'); } finally { setBusy(''); } };

  const rankTone = (ro: number) => ro === 1 ? [C.green, C.greenSoft] : ro === 2 ? [C.blue, C.blueSoft] : ro <= 3 ? [C.amber, C.amberSoft] : [C.sub, C.bg];
  const trend = (t: string) => t === '상승' || t === '유지' ? <b style={{ color: C.green }}>▲ 상승·유지</b> : t === '하락' ? <span style={{ color: C.mute }}>조정</span> : <span style={{ color: C.mute }}>―</span>;   // 상승·유지는 묶어서 표기
  const DIST = [C.green, C.blue, '#8FA5F5', '#D5DBE8']; const pc = (v: number) => `${Math.round(v)}%`;
  const box: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', background: '#fff' };
  const cap: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: C.sub, letterSpacing: '.02em' };
  const Bars = ({ items }: { items: Pct[] }) => <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>{items.map(x => <div key={x.label} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 44px', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
    <span style={{ color: C.text, fontWeight: 600 }}>{x.label}</span>
    <div style={{ height: 8, borderRadius: 99, background: C.bg, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, x.pct)}%`, height: '100%', borderRadius: 99, background: C.green }} /></div>
    <b style={{ textAlign: 'right', color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{pc(x.pct)}</b></div>)}</div>;
  const th: React.CSSProperties = { padding: '11px 14px', fontSize: 12.5, fontWeight: 600, color: '#C9D3EA', textAlign: 'left', letterSpacing: '.02em', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '13px 14px', fontSize: 15, color: C.text, borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' };

  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 18, alignItems: 'start' }}>
    <style dangerouslySetInnerHTML={{ __html: FONT_CSS }} />
    <div style={{ display: 'grid', gap: 14 }}>
      {err && <div className="card" style={{ padding: 14, color: '#B42318' }}>{err}</div>}
      <div className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
        <b>① 진행 현황 넣기</b>
        <div className="cell-sub">셀팜 「슬롯 운영」 화면에서 <b>Ctrl+A → Ctrl+C</b> 한 뒤 아래 칸을 누르고 <b>Ctrl+V</b>. (또는 Ctrl+S 로 저장한 .html 파일 올리기)</div>
        <textarea rows={2} readOnly value="" placeholder={busy === 'up' ? '읽는 중…' : '여기를 누르고 Ctrl+V'} onPaste={onPaste} style={{ resize: 'none' }} />
        <input type="file" accept=".html,.htm,.txt" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="cell-sub">{at ? `마지막 반영: ${new Date(at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${n.toLocaleString()}건 · 키워드 ${list.length.toLocaleString()}개` : '아직 넣은 데이터가 없습니다'}</div>
      </div>
      <div className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
        <b>② 오늘 영업할 키워드</b>
        <div className="cell-sub">줄바꿈이나 쉼표로 여러 개. 진행 현황에 있는 키워드만 표에 나옵니다.</div>
        <textarea rows={6} value={kwText} onChange={e => { setKwText(e.target.value); keep('wh.brief.kws', e.target.value); }} placeholder={'가습기\n제모기\n식전영상'} />
        {missing.length > 0 && <div className="cell-sub">진행 현황에 없음 (표에 안 나옴): {missing.slice(0, 12).join(', ')}{missing.length > 12 ? ` 외 ${missing.length - 12}` : ''}</div>}
        <label>키워드 검색<input value={q} onChange={e => setQ(e.target.value)} placeholder="일부만 입력해도 찾습니다" /></label>
        {q.trim() && <div style={{ display: 'grid', gap: 4, maxHeight: 260, overflow: 'auto' }}>
          {found.length === 0 && <div className="cell-sub">진행 현황에 없는 키워드입니다</div>}
          {found.map(x => <div key={x.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', border: `1px solid ${C.line}`, borderRadius: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}><b>{x.k}</b><div className="cell-sub">{[x.vol, x.cases[0]?.slot, x.cases[0]?.rank, x.cases[0]?.trend].filter(Boolean).join(' · ')}</div></div>
            {rows.some(r => r.key === x.key) ? <span className="cell-sub">추가됨</span> : <button type="button" className="btn ghost xs" onClick={() => add(x.k)}>추가</button>}</div>)}
        </div>}
      </div>
      <div className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
        <b>③ 표 설정</b>
        <label>제목<input value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>받는 쪽 표시 (선택)<input value={who} onChange={e => { setWho(e.target.value); keep('wh.brief.who', e.target.value); }} placeholder="예: 리워드 1팀" /></label>
        <label>슬롯 구간 경계<input value={slots} onChange={e => setSlots(e.target.value)} placeholder="5, 10, 20, 30, 50" /></label>
        <label>순위 구간 경계<input value={ranks} onChange={e => setRanks(e.target.value)} placeholder="5, 10, 20, 40, 100" /></label>
        <div className="cell-sub">예) 슬롯 경계 5, 10 → 10개는 「5~10개」 · 순위 경계 5, 10 → 3위·5위는 「5위 이내」</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>{([['dist', '순위 분포'], ['keep', '상승·유지 비율'], ['band', '구간별 비율'], ['risers', '급상승']] as const).map(([k, l]) => <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><input type="checkbox" style={{ width: 'auto' }} checked={show[k]} onChange={e => setShow(v => ({ ...v, [k]: e.target.checked }))} />{l}</label>)}</div>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={saveBk}>{busy === 'bk' ? '저장 중…' : '구간 저장'}</button>
      </div>
    </div>

    <div style={{ display: 'grid', gap: 10, justifyItems: 'start', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" disabled={!!busy || (!rows.length && !summary)} onClick={copy}>{busy === 'copy' ? '복사 중…' : '이미지 복사'}</button>
        <button type="button" className="btn ghost" disabled={!!busy || (!rows.length && !summary)} onClick={save}>{busy === 'png' ? '저장 중…' : 'PNG 저장'}</button>
        <span className="cell-sub" style={{ alignSelf: 'center' }}>{rows.length ? `${rows.length}개 키워드` : '왼쪽에서 키워드를 넣으면 표가 만들어집니다'}</span>
      </div>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <div ref={sheet} style={{ width: 760, background: '#fff', fontFamily: "'BriefPretendard','Pretendard',system-ui,sans-serif", color: C.ink, border: `1px solid ${C.line}` }}>
          <div style={{ background: C.navy, color: '#fff', padding: '26px 30px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#9FB2E8', letterSpacing: '.08em' }}>DAILY BRIEFING{who.trim() ? ` · ${who.trim()}` : ''}</div>
              <div style={{ fontSize: 13, color: '#9FB2E8' }}>{today.replace(/-/g, '.')} 기준</div></div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', marginTop: 8 }}>{title || '키워드 진행 브리핑'}</div>
            <div style={{ fontSize: 14.5, color: '#C9D3EA', marginTop: 6 }}>지금 진행 중인 키워드가 어디에 있는지, 수량 없이 비율과 구간으로 정리했습니다.</div>
          </div>
          {summary && (show.dist || show.keep || show.band || show.risers) && <div style={{ padding: '20px 30px 6px', display: 'grid', gap: 12, background: C.bg }}>
            {(show.dist || show.keep) && <div style={{ display: 'grid', gridTemplateColumns: show.dist && show.keep && summary.keep != null ? '1fr 220px' : '1fr', gap: 12 }}>
              {show.dist && <div style={box}><div style={cap}>순위 분포</div>
                <div style={{ display: 'flex', height: 22, borderRadius: 8, overflow: 'hidden', marginTop: 10 }}>{summary.dist.map((x, i) => x.pct > 0 && <div key={x.label} style={{ width: `${x.pct}%`, background: DIST[i] }} />)}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 10 }}>{summary.dist.map((x, i) => <div key={x.label}><div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: C.sub }}><span style={{ width: 9, height: 9, borderRadius: 3, background: DIST[i], display: 'inline-block' }} />{x.label}</div><div style={{ fontSize: 21, fontWeight: 800, color: C.ink, letterSpacing: '-.02em' }}>{pc(x.pct)}</div></div>)}</div></div>}
              {show.keep && summary.keep != null && <div style={{ ...box, background: C.greenSoft, borderColor: '#BFE8D6', display: 'grid', alignContent: 'center' }}><div style={{ ...cap, color: C.green }}>등록 대비 상승·유지</div><div style={{ fontSize: 44, fontWeight: 800, color: C.green, letterSpacing: '-.03em', lineHeight: 1.1, marginTop: 4 }}>{pc(summary.keep)}</div><div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>진행 중인 키워드 기준</div></div>}
            </div>}
            {show.band && (summary.byVol.length > 0 || summary.bySlot.length > 0) && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {summary.byVol.length > 0 && <div style={box}><div style={cap}>월 검색량별 상승·유지</div><Bars items={summary.byVol} /></div>}
              {summary.bySlot.length > 0 && <div style={box}><div style={cap}>진행 규모별 상승·유지</div><Bars items={summary.bySlot} /></div>}
            </div>}
            {show.risers && summary.risers.length > 0 && <div style={box}><div style={cap}>오늘의 급상승</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${summary.risers.length}, 1fr)`, gap: 8, marginTop: 10 }}>{summary.risers.map(x => <div key={x.k} style={{ background: C.bg, borderRadius: 10, padding: '10px 10px', textAlign: 'center', minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 800, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.k}</div><div style={{ fontSize: 16, fontWeight: 800, color: C.green, marginTop: 2 }}>▲ {x.up}</div><div style={{ fontSize: 11.5, color: C.mute }}>전일 대비</div></div>)}</div></div>}
          </div>}
          {rows.length > 0 && summary && <div style={{ padding: '14px 30px 10px', background: C.bg, fontSize: 13, fontWeight: 800, color: C.ink }}>오늘 영업 키워드</div>}
          {(rows.length > 0 || !summary) && <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: 44 }} /><col /><col style={{ width: 116 }} /><col style={{ width: 104 }} /><col style={{ width: 124 }} /><col style={{ width: 132 }} /></colgroup>
            <thead><tr style={{ background: '#1B2A55' }}><th style={th}></th><th style={th}>키워드</th><th style={{ ...th, textAlign: 'right' }}>월 검색량</th><th style={{ ...th, textAlign: 'center' }}>진행 규모</th><th style={{ ...th, textAlign: 'center' }}>현재 순위</th><th style={{ ...th, textAlign: 'center' }}>흐름</th></tr></thead>
            <tbody>
              {rows.length === 0 && !summary && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.mute, padding: '40px 14px' }}>표시할 키워드가 없습니다</td></tr>}
              {rows.map((x, i) => { const c = x.cases[0]; const [fg, bg] = rankTone(x.ro); return <tr key={x.key} style={{ background: i % 2 ? '#FAFBFD' : '#fff' }}>
                <td style={{ ...td, color: C.mute, fontSize: 13, textAlign: 'center' }}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 800, fontSize: 16.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.k}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.sub }}>{x.v != null ? x.v.toLocaleString('ko-KR') : '—'}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{c?.slot || '—'}</td>
                <td style={{ ...td, textAlign: 'center' }}><span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 999, background: bg, color: fg, fontWeight: 800, fontSize: 14 }}>{c?.rank ?? '—'}</span></td>
                <td style={{ ...td, textAlign: 'center', fontSize: 14 }}>{trend(c?.trend ?? '')}</td></tr>; })}
            </tbody>
          </table>}
          <div style={{ padding: '14px 30px 18px', fontSize: 12.5, color: C.mute, lineHeight: 1.6, background: C.bg }}>비율과 구간으로만 표기했습니다 · 상승·유지는 등록 시점 대비 · 순위는 매일 바뀔 수 있습니다</div>
        </div>
      </div>
    </div>
  </div>;
}
