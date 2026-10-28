'use client';
// 고객 순위 리포트 — 위: 직원용 조작(기간·저장·PNG·PDF·카톡 문구), 아래: 흰 시트(그대로 이미지/PDF로 나감). 시트 색은 고정(다크모드 무관)
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { PageHeader, Empty } from '@/components/ui';
import { fmtMD } from '@/lib/date/kst';
import { saveReportSetting, savePhone } from './actions';

export type KwReport = { id: string; keyword: string; title: string | null; store: string | null; image_url: string | null; url: string | null; series: (number | null | undefined)[]; startRank: number | null; curRank: number | null; prevRank: number | null; best: number | null; avg: number | null; up: number; measured: number };
export type ReportData = { group: string; owner: string; phone: string; isMe: boolean; uid: string; start: string; end: string; pre: number; today: string; days: string[]; kws: KwReport[]; note: string; saved: boolean };

const C = { ink: '#15192B', muted: '#6B7280', line: '#E4E7EE', soft: '#F7F8FB', accent: '#2F4FC8', accentSoft: '#EEF2FD', ok: '#1E7A43', okSoft: '#E6F5EC', bad: '#B02E2E', badSoft: '#FBE9E9' };
const rk = (v: number | null | undefined) => v === undefined ? '-' : v === null ? '미노출' : `${v}위`;
const proxied = (u: string | null) => u ? `/api/img?u=${encodeURIComponent(u)}` : '';

export default function ReportClient({ data, err }: { data: ReportData; err: string }) {
  const r = useRouter(); const d = data;
  const [start, setStart] = useState(d.start); const [end, setEnd] = useState(d.end); const [pre, setPre] = useState(String(d.pre)); const [note, setNote] = useState(d.note); const [phone, setPhone] = useState(d.phone);
  const [busy, setBusy] = useState(''); const sheet = useRef<HTMLDivElement>(null);
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

  const save = async () => { setBusy('save'); const x = await saveReportSetting({ uid: d.uid, group: d.group, start, end, note }); setBusy(''); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) qs({}); };
  const png = async (): Promise<string | null> => {
    if (!sheet.current) return null;
    const { toPng } = await import('html-to-image');
    return toPng(sheet.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
  };
  const savePng = async () => { setBusy('png'); try { const u = await png(); if (!u) return; const a = document.createElement('a'); a.href = u; a.download = fname + '.png'; a.click(); notify('PNG 저장 — 카톡에 바로 붙이세요', 'ok'); } catch (e: any) { notify('PNG 실패: ' + (e?.message ?? e), 'bad'); } finally { setBusy(''); } };
  const savePdf = async () => {
    setBusy('pdf');
    try {
      const u = await png(); if (!u || !sheet.current) return;
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const W = 210, H = 297, m = 8; const w = W - m * 2; const ratio = sheet.current.offsetHeight / sheet.current.offsetWidth; const h = w * ratio;
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
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3, flex: 1, minWidth: 180 }}>하단 메모 (선택)<input value={note} onChange={e => setNote(e.target.value)} placeholder="예: 11월 연장 시 동일 조건" /></label>
      <button type="button" className="btn ghost" onClick={() => qs({})}>적용</button>
      {(d.isMe) && <button type="button" className="btn" disabled={busy === 'save'} onClick={save}>기간 저장</button>}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={!!busy || !d.kws.length} onClick={savePng}>{busy === 'png' ? '만드는 중…' : 'PNG 저장'}</button>
        <button type="button" className="btn" disabled={!!busy || !d.kws.length} onClick={savePdf}>{busy === 'pdf' ? '만드는 중…' : 'PDF 저장'}</button>
        <button type="button" className="btn" style={{ background: 'var(--ok)', borderColor: 'var(--ok)' }} disabled={!d.kws.length} onClick={kakao}>카톡 문구 복사</button>
      </span>
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
      {d.kws.map(k => <KwCard key={k.id} k={k} d={d} cDays={cDays} />)}
      {/* 요약 */}
      <div style={{ marginTop: 22, padding: '14px 16px', background: C.soft, borderRadius: 10 }}>
        <b style={{ display: 'block', marginBottom: 6 }}>요약</b>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{d.kws.map(k => <li key={k.id} style={{ margin: '3px 0' }}><b>{k.keyword}</b> — {k.startRank === null && k.curRank === null ? '계약 기간 수집 기록 없음' : <>시작 {rk(k.startRank)} → 현재 {rk(k.curRank)}{k.best !== null ? ` (최고 ${k.best}위)` : ''}. {k.startRank !== null && k.curRank !== null ? (k.curRank < k.startRank ? `${k.startRank - k.curRank}계단 상승` : k.curRank > k.startRank ? `${k.curRank - k.startRank}계단 하락` : '순위 유지') : ''}{k.avg !== null ? ` · 기간 평균 ${k.avg}위` : ''}.</>}</li>)}</ul>
        {d.note && <div style={{ marginTop: 8, fontSize: 13 }}>{d.note}</div>}
      </div>
      <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: C.muted }}><span>순위는 네이버쇼핑 통합검색 기준, 매일 자동 수집 · 네이버 로직 변동에 따라 당일 순위는 달라질 수 있습니다</span><span>참한기획</span></div>
    </div></div>}
  </div>;
}

function Kpi({ l, v }: { l: string; v: React.ReactNode }) {
  return <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '.04em' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{v}</div></div>;
}

function KwCard({ k, d, cDays }: { k: KwReport; d: ReportData; cDays: string[] }) {
  const cur = k.curRank, prev = k.prevRank;
  const diff = cur !== null && prev !== null ? prev - cur : null;
  return <div style={{ marginTop: 22, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 14, alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${C.line}`, background: C.soft }}>
      {k.image_url ? <img src={proxied(k.image_url)} alt="" width={64} height={64} crossOrigin="anonymous" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.line}`, display: 'block' }} /> : <div style={{ width: 64, height: 64, borderRadius: 8, background: '#DDE3F3' }} />}
      <div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: 16 }}>{k.keyword}</h2><div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 520 }}>{k.title ?? ''}{k.store ? ` · ${k.store}` : ''}</div></div>
      <div style={{ textAlign: 'right' }}><div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{cur === null ? <span style={{ fontSize: 18, color: C.bad }}>미노출</span> : <>{cur}<small style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>위</small></>}</div><div style={{ fontSize: 12, color: C.muted }}>이전 {rk(prev)} {diff !== null && diff !== 0 && <span style={{ color: diff > 0 ? C.ok : C.bad }}>{diff > 0 ? `▲${diff}` : `▼${-diff}`}</span>}</div></div>
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
    </div>
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
