'use client';
// 고객 순위 리포트 — 위: 직원용 조작(기간·저장·PNG·PDF·카톡 문구), 아래: 흰 시트(그대로 이미지/PDF로 나감). 시트 색은 고정(다크모드 무관)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { PageHeader, Empty } from '@/components/ui';
import { fmtMD } from '@/lib/date/kst';
import { saveReportSetting, savePhone, reportExtras } from './actions';
import type { Extras, KwExtra, Pair } from '@/lib/reportExtras';

export type KwReport = { id: string; keyword: string; title: string | null; store: string | null; image_url: string | null; url: string | null; series: (number | null | undefined)[]; startRank: number | null; curRank: number | null; prevRank: number | null; best: number | null; avg: number | null; up: number; measured: number };
export type ReportData = { group: string; owner: string; phone: string; isMe: boolean; uid: string; start: string; end: string; pre: number; today: string; days: string[]; kws: KwReport[]; note: string; saved: boolean };

const C = { ink: '#15192B', muted: '#6B7280', line: '#E4E7EE', soft: '#F7F8FB', accent: '#2F4FC8', accentSoft: '#EEF2FD', ok: '#1E7A43', okSoft: '#E6F5EC', bad: '#B02E2E', badSoft: '#FBE9E9' };
const rk = (v: number | null | undefined) => v === undefined ? '-' : v === null ? '미노출' : `${v}위`;
const proxied = (u: string | null) => u ? `/api/img?u=${encodeURIComponent(u)}` : '';
const won = (n: number) => Math.round(n).toLocaleString('ko-KR');
const PER_PAGE = 40;   /* 네이버쇼핑 PC 한 페이지 상품 수 */
const pagePos = (r: number | null) => r === null ? '' : `${Math.ceil(r / PER_PAGE)}페이지 ${r - (Math.ceil(r / PER_PAGE) - 1) * PER_PAGE}번째`;
type Show = { vol: boolean; rival: boolean; idx: boolean; sug: boolean };

export default function ReportClient({ data, err }: { data: ReportData; err: string }) {
  const r = useRouter(); const d = data;
  const [start, setStart] = useState(d.start); const [end, setEnd] = useState(d.end); const [pre, setPre] = useState(String(d.pre)); const [note, setNote] = useState(d.note); const [phone, setPhone] = useState(d.phone);
  const [busy, setBusy] = useState(''); const sheet = useRef<HTMLDivElement>(null);
  const [ex, setEx] = useState<Extras | null>(null); const [exMsg, setExMsg] = useState('불러오는 중…'); const [show, setShow] = useState<Show>({ vol: true, rival: true, idx: true, sug: true }); const [cut, setCut] = useState<string[]>([]);
  useEffect(() => { let on = true; setEx(null); setExMsg('불러오는 중…'); reportExtras({ uid: d.uid, group: d.group, start: d.start, end: d.end }).then(x => { if (!on) return; if (x.ok && x.data) { setEx(x.data); setExMsg(''); } else setExMsg('추가 내용을 불러오지 못했습니다: ' + x.msg); }).catch(e => { if (on) setExMsg('추가 내용을 불러오지 못했습니다: ' + (e?.message ?? e)); }); return () => { on = false; }; }, [d.uid, d.group, d.start, d.end]);
  const qs = (p: Record<string, string>) => { const u = new URLSearchParams({ u: d.uid, g: d.group || '(미분류)', from: start, to: end, pre, ...p }); r.push(`/rank-watch/report?${u}`); };
  const cDays = useMemo(() => d.days.filter(x => x >= d.start && x <= d.end), [d.days, d.start, d.end]);
  const nDays = Math.round((new Date(d.end).getTime() - new Date(d.start).getTime()) / 864e5) + 1;
  const withStart = d.kws.filter(k => k.startRank !== null && k.curRank !== null);
  const avgStart = withStart.length ? Math.round(withStart.reduce((a, k) => a + (k.startRank as number), 0) / withStart.length) : null;
  const avgCur = withStart.length ? Math.round(withStart.reduce((a, k) => a + (k.curRank as number), 0) / withStart.length) : null;
  const nUp = withStart.filter(k => (k.curRank as number) < (k.startRank as number)).length;
  const gain = withStart.length ? Math.round(withStart.reduce((a, k) => a + ((k.startRank as number) - (k.curRank as number)), 0) / withStart.length) : null;
  const bestKw = d.kws.filter(k => k.best !== null).sort((a, b) => (a.best as number) - (b.best as number))[0];
  const name = d.group || '업체';
  const fname = `${name}_순위리포트_${d.start.replace(/-/g, '')}-${d.end.replace(/-/g, '')}`;

  const draft = () => {
    const L: string[] = []; const moved = withStart.map(k => ({ k, g: (k.startRank as number) - (k.curRank as number) })).sort((a, b) => b.g - a.g);
    if (!withStart.length) return '';
    L.push(`이번 기간 ${withStart.length}개 키워드 중 ${nUp}개가 시작보다 올랐습니다${avgStart !== null && avgCur !== null ? ` (평균 ${avgStart}위 → ${avgCur}위)` : ''}.`);
    if (moved[0] && moved[0].g > 0) L.push(`가장 많이 오른 키워드는 '${moved[0].k.keyword}'(${moved[0].k.startRank}위 → ${moved[0].k.curRank}위)입니다.`);
    const hold = moved.filter(m => m.g === 0).map(m => `'${m.k.keyword}'`); if (hold.length) L.push(`${hold.join(', ')}는 순위를 유지하고 있습니다.`);
    const down = moved.filter(m => m.g < 0).map(m => `'${m.k.keyword}'`); if (down.length) L.push(`${down.join(', ')}는 시작보다 내려가 있어 우선해서 살펴보겠습니다.`);
    const peak = ex ? d.kws.filter(k => ex.byId[k.id]?.season?.peak.includes(Number(d.today.slice(5, 7)) % 12 + 1)).map(k => `'${k.keyword}'`) : [];
    if (peak.length) L.push(`${peak.join(', ')}는 다음 달이 검색이 늘어나는 시기라, 지금 순위를 지켜 두는 것이 중요합니다.`);
    L.push('다음 기간에도 현재 순위 유지와 상위권 안착을 목표로 관리하겠습니다.');
    return L.join(' ');
  };
  const save = async () => { setBusy('save'); const x = await saveReportSetting({ uid: d.uid, group: d.group, start, end, note }); setBusy(''); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) qs({}); };
  const png = async (): Promise<string | null> => {
    if (!sheet.current) return null;
    const { toPng } = await import('html-to-image');
    const el = sheet.current;
    // 화면에서는 가운데 정렬(margin auto)이라, 그대로 캡처하면 왼쪽 여백만큼 밀려서 오른쪽이 잘림 → 저장할 때만 여백·그림자 제거, 크기 고정
    return toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true, width: el.offsetWidth, height: el.scrollHeight, canvasWidth: el.offsetWidth, canvasHeight: el.scrollHeight, style: { margin: '0', boxShadow: 'none', borderRadius: '0', transform: 'none' }, filter: n => !(n instanceof HTMLElement && n.dataset.noexport) });
  };
  const savePng = async () => { setBusy('png'); try { const u = await png(); if (!u) return; const a = document.createElement('a'); a.href = u; a.download = fname + '.png'; a.click(); notify('PNG 저장 — 카톡에 바로 붙이세요', 'ok'); } catch (e: any) { notify('PNG 실패: ' + (e?.message ?? e), 'bad'); } finally { setBusy(''); } };
  const savePdf = async () => {
    setBusy('pdf');
    try {
      const u = await png(); if (!u || !sheet.current) return;
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const W = 210, H = 297, m = 8; const w = W - m * 2; const ratio = sheet.current.scrollHeight / sheet.current.offsetWidth; const h = w * ratio;
      let y = 0; let page = 0;
      while (y < h) { if (page) pdf.addPage(); pdf.addImage(u, 'PNG', m, m - y, w, h); y += H - m * 2; page++; }  // 긴 리포트는 여러 장으로
      pdf.save(fname + '.pdf'); notify('PDF 저장', 'ok');
    } catch (e: any) { notify('PDF 실패: ' + (e?.message ?? e), 'bad'); } finally { setBusy(''); }
  };
  const kakao = async () => {
    const lines = d.kws.map(k => `· ${k.keyword} ${rk(k.startRank)} → ${rk(k.curRank)}${k.best !== null && k.best !== k.curRank ? ` (최고 ${k.best}위)` : ''}`);
    const txt = `${name} 님, ${fmtMD(d.start)}~${fmtMD(d.end)} 순위 리포트입니다.\n${lines.join('\n')}\n자세한 내용은 첨부 이미지 확인 부탁드립니다.\n${d.owner}${phone ? ' ' + phone : ''}`;
    try { await navigator.clipboard.writeText(txt); notify('카톡 문구 복사됨 — 이미지와 같이 보내세요', 'ok'); } catch { notify('복사 실패 — 아래 문구를 직접 복사하세요\n' + txt, 'bad', 8000); }
  };

  return <div style={{ display: 'grid', gap: 14 }}>
    <PageHeader title={`고객 리포트 · ${name}`} desc="순위 체크 기록으로 만든 고객용 리포트. 아래 흰 시트가 그대로 PNG/PDF로 저장됩니다. 외부 링크 없음 — 이미지·PDF로만 전달." actions={<a className="btn ghost" href="/rank-watch">← 순위 체크</a>} />
    {err && <div className="card" style={{ padding: 14, color: 'var(--bad-ink)' }}>{err}</div>}
    <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>계약 시작<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>계약 종료<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>시작 전 표시<select value={pre} onChange={e => setPre(e.target.value)}><option value="0">안 함</option><option value="3">3일</option><option value="7">7일</option><option value="14">14일</option></select></label>
      <button type="button" className="btn ghost" onClick={() => qs({})}>적용</button>
      {(d.isMe) && <button type="button" className="btn" disabled={busy === 'save'} onClick={save}>기간 저장</button>}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={!!busy || !d.kws.length} onClick={savePng}>{busy === 'png' ? '만드는 중…' : 'PNG 저장'}</button>
        <button type="button" className="btn" disabled={!!busy || !d.kws.length} onClick={savePdf}>{busy === 'pdf' ? '만드는 중…' : 'PDF 저장'}</button>
        <button type="button" className="btn" style={{ background: 'var(--ok)', borderColor: 'var(--ok)' }} disabled={!d.kws.length} onClick={kakao}>카톡 문구 복사</button>
      </span>
    </div>
    <div className="card" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}><b>리포트에 넣을 내용</b>
        {([['vol', '검색수 · 늘어나는 달'], ['rival', '경쟁 상품 비교'], ['idx', '상품 지수 변화'], ['sug', '추가 키워드 제안']] as [keyof Show, string][]).map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={show[k]} onChange={e => setShow({ ...show, [k]: e.target.checked })} />{l}</label>)}
        {exMsg && <span className="cell-sub">{exMsg}</span>}
      </div>
      {ex?.notes.map(n => <div key={n} className="cell-sub">· {n}</div>)}
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>담당자 코멘트 (리포트 아래에 들어갑니다 · 「기간 저장」을 누르면 같이 저장)
        <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 600))} rows={3} placeholder="이번 기간에 본 것과 다음 기간 계획을 2~3줄로" style={{ width: '100%', fontWeight: 400 }} /></label>
      <div><button type="button" className="btn ghost" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => { const t = draft(); if (t) setNote(t); else notify('순위 기록이 없어 초안을 만들 수 없습니다', 'bad'); }}>숫자로 초안 채우기</button></div>
    </div>
    {d.isMe && <div className="cell-sub" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0 4px' }}>리포트에 찍히는 내 연락처: <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" style={{ padding: '3px 8px', width: 150 }} /><button type="button" className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }} onClick={async () => { const x = await savePhone(phone); notify(x.msg, x.ok ? 'ok' : 'bad'); }}>저장</button>{!d.saved && <span>· 아직 계약 기간이 저장 안 됨 — 기본값(최근 10일)으로 보여줌</span>}</div>}

    {!d.kws.length ? <div className="card"><Empty>이 업체에 등록된 순위 체크 상품이 없습니다.</Empty></div> :
    <div style={{ overflowX: 'auto' }}>
    <div ref={sheet} style={{ width: 860, margin: '0 auto', background: '#fff', color: C.ink, padding: '34px 38px', borderRadius: 4, boxShadow: '0 2px 14px rgba(0,0,0,.12)', fontFamily: "'IBM Plex Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif", fontSize: 14, lineHeight: 1.5 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, borderBottom: `2px solid ${C.ink}`, paddingBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted }}>네이버쇼핑 상위노출 리포트 · {d.today.replace(/-/g, '.')} 기준</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, letterSpacing: '-.01em' }}>{name}</h1>
          <div style={{ fontSize: 12, color: C.muted }}>계약 기간 {d.start.replace(/-/g, '.')} ~ {d.end.replace(/-/g, '.')} ({nDays}일) · 키워드 {d.kws.length}개</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: C.muted }}><b style={{ display: 'block', color: C.ink, fontSize: 14 }}>참한기획</b>담당 {d.owner}{phone && <><br />{phone}</>}</div>
      </div>
      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 16 }}>
        <Kpi l="평균 순위 변화" v={avgStart !== null ? <><span>{avgStart}</span><small style={{ fontSize: 12 }}> → </small><span style={{ color: avgCur !== null && avgCur < avgStart ? C.ok : avgCur !== null && avgCur > avgStart ? C.bad : C.ink }}>{avgCur}</span><small style={{ fontSize: 12 }}>위</small></> : '-'} />
        <Kpi l="상승한 키워드" v={<>{nUp}<small style={{ fontSize: 12 }}>/{d.kws.length}개</small></>} />
        <Kpi l="평균 상승폭" v={gain === null ? '-' : <span style={{ color: gain > 0 ? C.ok : gain < 0 ? C.bad : C.ink }}>{gain > 0 ? '▲' : gain < 0 ? '▼' : ''}{Math.abs(gain)}<small style={{ fontSize: 12 }}>계단</small></span>} />
        <Kpi l="최고 순위" v={bestKw ? <>{bestKw.best}<small style={{ fontSize: 12 }}>위 · {bestKw.keyword}</small></> : '-'} />
      </div>
      {/* 키워드별 */}
      {d.kws.map(k => <KwCard key={k.id} k={k} d={d} cDays={cDays} e={ex?.byId[k.id] ?? null} show={show} />)}
      {/* 요약 */}
      <div style={{ marginTop: 22, padding: '14px 16px', background: C.soft, borderRadius: 10 }}>
        <b style={{ display: 'block', marginBottom: 6 }}>요약</b>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{d.kws.map(k => <li key={k.id} style={{ margin: '3px 0' }}><b>{k.keyword}</b> — {k.startRank === null && k.curRank === null ? '계약 기간 수집 기록 없음' : <>시작 {rk(k.startRank)} → 현재 {rk(k.curRank)}{k.best !== null ? ` (최고 ${k.best}위)` : ''}. {k.startRank !== null && k.curRank !== null ? (k.curRank < k.startRank ? `${k.startRank - k.curRank}계단 상승` : k.curRank > k.startRank ? `${k.curRank - k.startRank}계단 하락` : '순위 유지') : ''}{k.avg !== null ? ` · 기간 평균 ${k.avg}위` : ''}.</>}</li>)}</ul>
      </div>
      {show.sug && ex && ex.suggest.filter(x => !cut.includes(x.keyword)).length > 0 && <div style={{ marginTop: 14, padding: '14px 16px', border: `1px solid ${C.line}`, borderRadius: 10 }}>
        <b style={{ display: 'block', marginBottom: 2 }}>함께 보시면 좋은 키워드</b>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>지금 상품명에 이미 들어 있는 단어로 이뤄진 검색어입니다</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{ex.suggest.filter(x => !cut.includes(x.keyword)).map(x => <span key={x.keyword} style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline', padding: '6px 12px', borderRadius: 8, background: C.accentSoft, fontSize: 13 }}><b>{x.keyword}</b><span style={{ color: C.muted, fontSize: 12 }}>월 {won(x.total)}회 검색</span><button type="button" data-noexport="1" title="리포트에서 빼기" onClick={() => setCut([...cut, x.keyword])} style={{ border: 0, background: 'none', color: C.muted, cursor: 'pointer', padding: 0 }}>✕</button></span>)}</div>
      </div>}
      {note.trim() && <div style={{ marginTop: 14, padding: '14px 16px', background: C.soft, borderRadius: 10 }}><b style={{ display: 'block', marginBottom: 6 }}>담당자 코멘트</b><div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{note.trim()}</div></div>}
      <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: C.muted }}><span>순위는 네이버쇼핑 통합검색 기준, 매일 자동 수집 · 네이버 로직 변동에 따라 당일 순위는 달라질 수 있습니다 · 페이지 위치는 PC 화면(한 페이지 40개) 기준 · 월 검색수는 최근 한 달 네이버 검색 기준</span><span>참한기획</span></div>
    </div></div>}
  </div>;
}

function Kpi({ l, v }: { l: string; v: React.ReactNode }) {
  return <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '.04em' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{v}</div></div>;
}

function KwCard({ k, d, cDays, e, show }: { k: KwReport; d: ReportData; cDays: string[]; e: KwExtra | null; show: Show }) {
  const cur = k.curRank, prev = k.prevRank;
  const diff = cur !== null && prev !== null ? prev - cur : null;
  return <div style={{ marginTop: 22, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 14, alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${C.line}`, background: C.soft }}>
      {k.image_url ? <img src={proxied(k.image_url)} alt="" width={64} height={64} crossOrigin="anonymous" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.line}`, display: 'block' }} /> : <div style={{ width: 64, height: 64, borderRadius: 8, background: '#DDE3F3' }} />}
      <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: 16 }}>{k.keyword}</h2><div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 520 }}>{k.title ?? ''}{k.store ? ` · ${k.store}` : ''}</div></div>
      <div style={{ textAlign: 'right' }}><div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{cur === null ? <span style={{ fontSize: 18, color: C.bad }}>미노출</span> : <>{cur}<small style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>위</small></>}</div><div style={{ fontSize: 12, color: C.muted }}>이전 {rk(prev)} {diff !== null && diff !== 0 && <span style={{ color: diff > 0 ? C.ok : C.bad }}>{diff > 0 ? `▲${diff}` : `▼${-diff}`}</span>}</div>{cur !== null && <div style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>{pagePos(cur)}</div>}</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr' }}>
      <div style={{ padding: '12px 14px', borderRight: `1px solid ${C.line}` }}><Chart k={k} d={d} /></div>
      <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', alignContent: 'start', fontSize: 13 }}>
        <F l="시작 순위" v={rk(k.startRank)} /><F l="현재 순위" v={rk(k.curRank)} />
        <F l="최고 순위" v={k.best !== null ? `${k.best}위` : '-'} /><F l="기간 평균" v={k.avg !== null ? `${k.avg}위` : '-'} />
        <F l="시작보다 상승한 날" v={`${k.up}/${k.measured}일`} /><F l="순위 변화" v={k.startRank !== null && k.curRank !== null ? <span style={{ color: k.curRank < k.startRank ? C.ok : k.curRank > k.startRank ? C.bad : C.ink }}>{k.curRank < k.startRank ? `▲${k.startRank - k.curRank}` : k.curRank > k.startRank ? `▼${k.curRank - k.startRank}` : '－'}</span> : '-'} />
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, fontSize: 11, color: C.muted, padding: '0 14px 6px' }}><span><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: C.accentSoft, verticalAlign: -2, marginRight: 4 }} />계약 기간</span><span><span style={{ color: C.ok, fontWeight: 700 }}>초록</span> 시작 순위보다 상승</span><span><span style={{ color: C.bad, fontWeight: 700 }}>빨강</span> 시작보다 하락·미노출</span></div>
      <div style={{ gridColumn: '1 / -1', padding: '0 14px 12px' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%', tableLayout: 'fixed' }}><tbody>
          <tr>{d.days.map(day => <th key={day} style={{ padding: '4px 1px', fontWeight: 600, color: C.muted, borderBottom: `1px solid ${C.line}`, background: cDays.includes(day) ? C.accentSoft : undefined, fontSize: 10 }}>{fmtMD(day)}</th>)}</tr>
          <tr>{d.days.map((day, i) => { const v = k.series[i]; return <td key={day} style={{ padding: '5px 1px', textAlign: 'center', borderBottom: `1px solid ${C.line}`, background: cDays.includes(day) ? C.accentSoft : undefined, fontVariantNumeric: 'tabular-nums', color: v === undefined ? C.muted : v === null ? C.bad : k.startRank === null ? C.ink : v < k.startRank ? C.ok : v > k.startRank ? C.bad : C.ink, fontWeight: typeof v === 'number' && k.startRank !== null && v < k.startRank ? 700 : 400 }}>{v === undefined ? '·' : v === null ? '✕' : v}</td>; })}</tr>
        </tbody></table>
      </div>
      {e && show.vol && (e.vol || e.season) && <div style={{ gridColumn: '1 / -1', padding: '12px 14px', borderTop: `1px solid ${C.line}`, display: 'grid', gridTemplateColumns: e.season ? '200px 1fr' : '1fr', gap: 16, alignItems: 'center' }}>
        <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>이 키워드 월 검색수</div>{e.vol ? <><div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{won(e.vol.total)}<small style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>회</small></div><div style={{ fontSize: 11, color: C.muted }}>모바일 {won(e.vol.mobile)} · PC {won(e.vol.pc)}</div></> : <div style={{ fontSize: 13, color: C.muted }}>-</div>}</div>
        {e.season && <Season s={e.season} month={Number(d.today.slice(5, 7))} />}
      </div>}
      {e && show.idx && e.idx && <div style={{ gridColumn: '1 / -1', padding: '10px 14px', borderTop: `1px solid ${C.line}`, display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 14, alignItems: 'center', fontSize: 13 }}>
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>상품 지수<br />시작 → 현재</span><Idx l="클릭 지수" p={e.idx.click} /><Idx l="판매 지수" p={e.idx.sale} /><Idx l="품질 지수" p={e.idx.quality} />
      </div>}
      {e && show.rival && e.rivals.length > 1 && <div style={{ gridColumn: '1 / -1', padding: '10px 14px 12px', borderTop: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>같은 키워드 위 순위 상품과 비교{e.rivalsAt ? ` · ${fmtMD(e.rivalsAt.slice(0, 10))} 기준` : ''}</div>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}><tbody>
          <tr>{['순위', '상품', '가격', '리뷰', '찜'].map((h, i) => <th key={h} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '4px 6px', color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.line}`, width: i === 0 ? 44 : i === 1 ? undefined : 90 }}>{h}</th>)}</tr>
          {e.rivals.map(v => <tr key={v.rank} style={{ background: v.me ? C.accentSoft : undefined, fontWeight: v.me ? 700 : 400 }}>
            <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.line}` }}>{v.rank}위</td>
            <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.line}`, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.me ? '우리 상품 · ' : ''}{v.title}{v.mall ? <span style={{ color: C.muted, fontWeight: 400 }}> · {v.mall}</span> : null}</td>
            <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.line}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v.price ? won(v.price) + '원' : '-'}</td>
            <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.line}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{won(v.review)}</td>
            <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.line}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{won(v.keep)}</td>
          </tr>)}
        </tbody></table>
      </div>}
    </div>
  </div>;
}
function Idx({ l, p }: { l: string; p: Pair }) {
  const [a, b] = p; const f = (v: number | null) => v === null ? '-' : (Math.round(v * 10) / 10).toFixed(1); const g = a !== null && b !== null ? Math.round((b - a) * 10) / 10 : 0;
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: `1px dashed ${C.line}`, padding: '4px 0' }}><span style={{ color: C.muted }}>{l}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{f(a)} → {f(b)}{g !== 0 && <span style={{ color: g > 0 ? C.ok : C.bad, marginLeft: 6 }}>{g > 0 ? '▲' : '▼'}{Math.abs(g).toFixed(1)}</span>}</b></div>;
}
/** 월별 검색 흐름(최근 2년 평균) — 검색이 늘어나는 달을 진하게, 이번 달은 테두리 */
function Season({ s, month }: { s: { months: number[]; peak: number[]; flat: boolean }; month: number }) {
  return <div>
    <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>월별 검색 흐름 (최근 2년 평균) — {s.peak.length ? <span style={{ color: C.ink }}>검색이 늘어나는 달: <b style={{ color: C.accent }}>{s.peak.map(m => m + '월').join(' · ')}</b>{s.peak.includes(month) ? ' · 지금이 그 시기입니다' : s.peak.includes(month % 12 + 1) ? ' · 다음 달부터 늘어납니다' : ''}</span> : <span style={{ color: C.ink }}>달마다 큰 차이 없이 꾸준히 검색됩니다</span>}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, alignItems: 'end', height: 46 }}>{s.months.map((v, i) => <div key={i} style={{ height: Math.max(3, Math.round(v * 0.46)), background: s.peak.includes(i + 1) ? C.accent : '#C9D2EC', borderRadius: 2, outline: i + 1 === month ? `2px solid ${C.ink}` : undefined, outlineOffset: 1 }} />)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 3 }}>{s.months.map((_, i) => <span key={i} style={{ fontWeight: i + 1 === month ? 700 : 400, color: i + 1 === month ? C.ink : C.muted }}>{i + 1}</span>)}</div>
  </div>;
}
function F({ l, v }: { l: string; v: React.ReactNode }) { return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: `1px dashed ${C.line}`, padding: '4px 0' }}><span style={{ color: C.muted }}>{l}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</b></div>; }

/** 추이 그래프 — 위가 1위. 계약 구간 음영, 1페이지 기준선, 미노출은 바닥 ✕ */
function Chart({ k, d }: { k: KwReport; d: ReportData }) {
  const W = 420, H = 150, pl = 30, pr = 8, pt = 14, pb = 22; const s = k.series; const n = s.length;
  const nums = s.filter((v): v is number => typeof v === 'number'); if (!nums.length) return <div style={{ fontSize: 12, color: C.muted, padding: 20, textAlign: 'center' }}>수집 기록 없음</div>;
  const max = Math.max(...nums, 10) + 3; const base = k.startRank; const x = (i: number) => n === 1 ? (pl + W - pr) / 2 : pl + (W - pl - pr) * i / (n - 1); const y = (v: number) => pt + (H - pt - pb) * (v - 1) / (max - 1);
  const si = d.days.findIndex(day => day >= d.start), ei = (() => { let j = -1; d.days.forEach((day, i) => { if (day <= d.end) j = i; }); return j; })();
  let path = ''; s.forEach((v, i) => { if (typeof v !== 'number') { path += ' '; return; } const prevNum = i > 0 && typeof s[i - 1] === 'number'; path += `${prevNum ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; });
  const lastIdx = (() => { let j = -1; s.forEach((v, i) => { if (typeof v === 'number') j = i; }); return j; })();
  const firstIdx = s.findIndex(v => typeof v === 'number');
  const ticks = [1, 5, 10, 20, 30, 50, 80, 100, 150, 200].filter(v => v <= max && v !== base);
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 150, display: 'block' }} aria-label="순위 추이">
    {si >= 0 && ei >= si && <rect x={x(si) - (n > 1 ? (W - pl - pr) / (n - 1) / 2 : 20)} y={0} width={(ei > si ? x(ei) - x(si) : 0) + (n > 1 ? (W - pl - pr) / (n - 1) : 40)} height={H - pb} fill={C.accentSoft} />}
    {base !== null && <><line x1={pl} x2={W - pr} y1={y(base)} y2={y(base)} stroke={C.muted} strokeDasharray="4 4" /><text x={W - pr} y={y(base) - 4} textAnchor="end" fontSize={10} fill={C.muted}>시작 {base}위</text></>}
    {ticks.map(v => <text key={v} x={pl - 4} y={y(v) + 4} textAnchor="end" fontSize={10} fill={C.muted}>{v}</text>)}
    <path d={path.trim()} fill="none" stroke={C.accent} strokeWidth={2.2} strokeLinejoin="round" />
    {s.map((v, i) => v === null ? <text key={i} x={x(i)} y={H - pb - 2} textAnchor="middle" fontSize={10} fill={C.bad}>✕</text> : null)}
    {[firstIdx, si >= 0 && typeof s[si] === 'number' ? si : -1, lastIdx].filter((v, i, a) => v >= 0 && a.indexOf(v) === i).map(i => <g key={i}><circle cx={x(i)} cy={y(s[i] as number)} r={3.5} fill={C.accent} /><text x={x(i)} y={y(s[i] as number) - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.ink}>{s[i]}위</text></g>)}
    <text x={x(0)} y={H - 6} fontSize={10} fill={C.muted}>{fmtMD(d.days[0])}</text>
    {si > 0 && <text x={x(si)} y={H - 6} fontSize={10} fill={C.accent} fontWeight={700} textAnchor="middle">{fmtMD(d.start)} 시작</text>}
    <text x={x(n - 1)} y={H - 6} textAnchor="end" fontSize={10} fill={C.muted}>{fmtMD(d.days[n - 1])}</text>
  </svg>;
}
