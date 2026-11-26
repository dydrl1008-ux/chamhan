'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { DAILY_FIELDS, WEEKLY_FIELDS, type DailyAuto, type WeeklyAuto } from '@/lib/metaReportShared';
import { mrDaily, mrWeekly } from './actions';
type Rep = { id: number; user_id: string; kind: string; period_key: string; auto: any; data: Record<string, string>; submitted_at: string };
const won = (n: number) => '₩' + Math.round(n || 0).toLocaleString('ko-KR'); const pct = (a: number, b: number) => b ? (a / b * 100).toFixed(1) + '%' : '—';
const md = (d: string) => d.slice(5).replace('-', '/'); const addD = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const box: React.CSSProperties = { border: '1px solid #D0D5DD', borderRadius: 6, padding: '8px 10px', fontSize: 13.5, width: '100%', fontFamily: 'inherit', lineHeight: 1.6, minHeight: 64 };
function Nums({ a }: { a: DailyAuto }) {
  const cell = (l: string, v: string, sub?: string, c?: string) => <div style={{ flex: '1 1 120px', minWidth: 120, padding: '8px 10px', background: '#F9FAFB', borderRadius: 8 }}><div style={{ fontSize: 12, color: '#667085' }}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>{sub && <div style={{ fontSize: 11.5, color: '#98A2B3' }}>{sub}</div>}</div>;
  const by = ['부재', '상담중', '결제', '허수', '중복', '종료'].filter(k => a.by?.[k]).map(k => `${k} ${a.by[k]}`).join(' · ');
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {cell('오늘 배정', String(a.assigned))}{cell('오늘 처리', String(a.handled), by || undefined)}{cell('결제', `${a.paid}건`)}{cell('결제 금액', won(a.paidAmt))}{cell('상품비', won(a.costAmt), a.noCost ? `상품비 미입력 ${a.noCost}건` : undefined, a.noCost ? '#B42318' : undefined)}{cell('마진', won(a.margin), '결제 금액 - 상품비', '#067647')}{cell('남은 미연락', String(a.waiting), undefined, a.waiting ? '#B54708' : undefined)}{cell('내일 연락 예정', String(a.tomorrow))}
  </div>;
}
function Texts({ fields, data }: { fields: readonly { key: string; label: string }[]; data: Record<string, string> }) {
  return <>{fields.filter(f => data?.[f.key]).map(f => <div key={f.key} style={{ marginTop: 8 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: '#475467' }}>{f.label}</div><div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{data[f.key]}</div></div>)}</>;
}
function WeekTable({ w }: { w: WeeklyAuto }) {
  const td: React.CSSProperties = { padding: '7px 9px', textAlign: 'right', whiteSpace: 'nowrap' }; const t = w.lines.reduce((s, l) => ({ n: s.n + l.n, valid: s.valid + l.valid, reached: s.reached + l.reached, paid: s.paid + l.paid, amt: s.amt + l.amt, cost: s.cost + l.cost, stale: s.stale + l.stale }), { n: 0, valid: 0, reached: 0, paid: 0, amt: 0, cost: 0, stale: 0 });
  const row = (name: string, l: typeof t, key: string, b = false) => <tr key={key} style={{ borderTop: '1px solid #EAECF0', fontWeight: b ? 700 : 400, background: b ? '#F9FAFB' : undefined }}><td style={{ ...td, textAlign: 'left' }}>{name}</td><td style={td}>{l.n}</td><td style={td}>{l.valid}</td><td style={td}>{pct(l.reached, l.valid)}</td><td style={td}>{l.paid}</td><td style={{ ...td, color: '#B42318', fontWeight: 700 }}>{pct(l.paid, l.valid)}</td><td style={td}>{won(l.amt)}</td><td style={{ ...td, color: '#067647' }}>{won(l.amt - l.cost)}</td><td style={{ ...td, color: l.stale ? '#B54708' : '#98A2B3' }}>{l.stale}</td></tr>;
  return <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
    <thead><tr style={{ background: '#F9FAFB', color: '#475467', fontSize: 12.5 }}><th style={{ ...td, textAlign: 'left' }}>담당자</th>{['받은 DB', '유효 DB', '연결률', '결제', '결제율', '결제 금액', '마진', '미연락 방치(지금)'].map(h => <th key={h} style={td}>{h}</th>)}</tr></thead>
    <tbody>{w.lines.map(l => row(l.name, l, l.id))}{row('합계', t, 'tot', true)}</tbody></table>
    <div style={{ fontSize: 12.5, color: '#667085', marginTop: 6 }}>허수 · 중복 {w.junk}건 ({pct(w.junk, w.total)}){w.src.map(s => ` · ${s.name} 결제율 ${pct(s.paid, s.valid)}`).join('')} · 미연락 방치 = 배정 후 하루 넘게 미연락</div></div>;
}
export default function MetaReportClient({ lead, boss, meId, today, day, week, thisWeek, myAuto, mineToday, wAuto, reports, names, staff }: { lead: boolean; boss: boolean; meId: string; today: string; day: string; week: string; thisWeek: string; myAuto: DailyAuto | null; mineToday: Rep | null; wAuto: WeeklyAuto | null; reports: Rep[]; names: Record<string, string>; staff: { id: string; name: string }[] }) {
  const router = useRouter(); const [d, setD] = useState<Record<string, string>>(mineToday?.data ?? {}); const wk = reports.find(r => r.kind === 'weekly' && r.period_key === week) ?? null; const [w, setW] = useState<Record<string, string>>(wk?.data ?? {}); const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<{ ok: boolean; msg: string }>) => { setBusy(true); const r = await f(); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) router.refresh(); };
  const dayReps = reports.filter(r => r.kind === 'daily' && r.period_key === day); const missing = staff.filter(s => !dayReps.some(r => r.user_id === s.id)); const weeklies = reports.filter(r => r.kind === 'weekly');
  const go = (k: string, v: string) => { const u = new URLSearchParams(window.location.search); u.set(k, v); router.push('/meta-report?' + u.toString()); };
  return <div style={{ maxWidth: 980 }}>
    {!boss && myAuto && <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><b style={{ fontSize: 15 }}>일일 보고 — {md(today)}</b>{mineToday && <span style={{ fontSize: 12.5, color: '#067647', fontWeight: 700 }}>제출됨 (다시 내면 덮어씁니다)</span>}</div>
      <Nums a={myAuto} />
      {myAuto.noCost > 0 && <div style={{ fontSize: 12.5, color: '#B42318', marginTop: 6 }}>오늘 결제 건 중 상품비가 비어 있는 건이 있습니다 — 인바운드 DB 에서 상품비를 넣어야 마진이 맞습니다.</div>}
      {DAILY_FIELDS.map(f => <div key={f.key} style={{ marginTop: 10 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{f.label}{f.hint && <span style={{ fontWeight: 400, color: '#98A2B3', marginLeft: 6, fontSize: 12 }}>{f.hint}</span>}</div><textarea style={{ ...box, marginTop: 4 }} value={d[f.key] ?? ''} onChange={e => setD(s => ({ ...s, [f.key]: e.target.value }))} /></div>)}
      <div style={{ marginTop: 10 }}><button className="btn" disabled={busy} onClick={() => run(() => mrDaily(d))}>{mineToday ? '다시 제출' : '제출'}</button></div>
    </div>}
    {lead && <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}><b style={{ fontSize: 15 }}>팀 일일 보고</b>
        <button className="btn ghost" style={{ padding: '3px 9px' }} onClick={() => go('d', addD(day, -1))}>←</button><b>{md(day)}</b>{day < today && <button className="btn ghost" style={{ padding: '3px 9px' }} onClick={() => go('d', addD(day, 1))}>→</button>}
        <span style={{ fontSize: 12.5, color: missing.length ? '#B42318' : '#067647', fontWeight: 700 }}>{missing.length ? `미제출: ${missing.map(m => m.name).join(', ')}` : staff.length ? '전원 제출' : ''}</span></div>
      {dayReps.length ? dayReps.map(r => <div key={r.id} style={{ borderTop: '1px solid #EAECF0', padding: '12px 0' }}><div style={{ fontWeight: 700, marginBottom: 8 }}>{names[r.user_id] ?? '(팀 밖)'}</div><Nums a={r.auto as DailyAuto} /><Texts fields={DAILY_FIELDS} data={r.data} /></div>) : <div style={{ fontSize: 13, color: '#98A2B3' }}>이 날 제출된 보고가 없습니다</div>}
    </div>}
    {lead && wAuto && <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}><b style={{ fontSize: 15 }}>주간 보고</b>
        <button className="btn ghost" style={{ padding: '3px 9px' }} onClick={() => go('w', addD(week, -7))}>←</button><b>{md(week)} ~ {md(addD(week, 6))}</b>{week < thisWeek && <button className="btn ghost" style={{ padding: '3px 9px' }} onClick={() => go('w', addD(week, 7))}>→</button>}
        {wk && <span style={{ fontSize: 12.5, color: '#067647', fontWeight: 700 }}>제출됨 — {names[wk.user_id] ?? ''}</span>}</div>
      <WeekTable w={wk && wk.user_id !== meId ? wk.auto as WeeklyAuto : wAuto} />
      {wk && wk.user_id !== meId ? <Texts fields={WEEKLY_FIELDS} data={wk.data} /> : <>
        {WEEKLY_FIELDS.map(f => <div key={f.key} style={{ marginTop: 10 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</div><textarea key={week + f.key} style={{ ...box, marginTop: 4 }} value={w[f.key] ?? ''} onChange={e => setW(s => ({ ...s, [f.key]: e.target.value }))} /></div>)}
        <div style={{ marginTop: 10 }}><button className="btn" disabled={busy} onClick={() => run(() => mrWeekly(week, w))}>{wk ? '다시 제출' : '주간 보고 제출'}</button></div></>}
      {weeklies.length > 0 && <div style={{ marginTop: 12, fontSize: 12.5, color: '#667085' }}>제출된 주간 보고: {weeklies.slice(0, 8).map(r => <a key={r.id} onClick={() => go('w', r.period_key)} style={{ marginRight: 10, color: '#175CD3', cursor: 'pointer' }}>{md(r.period_key)} 주 ({names[r.user_id] ?? ''})</a>)}</div>}
    </div>}
    {!lead && <div className="card"><b style={{ fontSize: 15 }}>내 지난 보고</b>
      {reports.filter(r => r.kind === 'daily' && r.period_key !== today).length ? reports.filter(r => r.kind === 'daily' && r.period_key !== today).map(r => <details key={r.id} style={{ borderTop: '1px solid #EAECF0', padding: '10px 0' }}><summary style={{ cursor: 'pointer', fontSize: 13.5 }}><b>{md(r.period_key)}</b> · 처리 {r.auto?.handled ?? 0} · 결제 {r.auto?.paid ?? 0}건 · 마진 {won(r.auto?.margin ?? 0)}</summary><div style={{ marginTop: 8 }}><Nums a={r.auto as DailyAuto} /><Texts fields={DAILY_FIELDS} data={r.data} /></div></details>) : <div style={{ fontSize: 13, color: '#98A2B3', marginTop: 6 }}>아직 없습니다</div>}
    </div>}
  </div>;
}
