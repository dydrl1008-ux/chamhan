'use client';
import { holidayName, isWeekend } from '@/lib/date/holidays';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { addPlan, togglePlan, removePlan, updatePlan } from './actions';
import type { Profile } from '@/lib/auth/session';
import type { Slot } from '@/lib/slots';
type P = { id: number; user_id: string; type: string; title: string; detail: string | null; start_date: string; end_date: string; is_done: boolean; miss_reason: string | null };
const COLOR: Record<string, string> = { daily: '#3D5AFE', weekly: '#12B981', monthly: '#F97316' };
const NAME: Record<string, string> = { daily: '일일', weekly: '주간', monthly: '월' };
export default function PlansClient({ me, month, today, plans, people, target, slots }: { me: Profile; month: string; today: string; plans: P[]; people: { id: string; name: string; team_id: number | null; role: string }[]; target: string; slots: Slot[] }) {
  const r = useRouter(); const mine = target === me.id; const [edit, setEdit] = useState<P | null>(null);
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const first = new Date(Date.UTC(y, m - 1, 1)); const off = (first.getUTCDay() + 6) % 7; const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((off + days) / 7) * 7 }, (_, i) => { const d = i - off + 1; return d >= 1 && d <= days ? `${month}-${String(d).padStart(2, '0')}` : null; });
  const inR = (d: string, p: P) => d >= p.start_date && d <= p.end_date;
  const [showSlots, setShowSlots] = useState(true); const [popDay, setPopDay] = useState<string | null>(null);
  const slotsOn = (d: string) => slots.filter(x => d >= x.date_from && d <= x.date_to);
  const endingThisMonth = slots.filter(x => x.date_to.slice(0, 7) === month && x.date_to >= today).sort((a, b) => a.date_to.localeCompare(b.date_to));
  const rate = (t: string) => { const a = plans.filter(p => p.type === t && p.start_date <= today); return a.length ? Math.round(a.filter(p => p.is_done).length / a.length * 100) : null; };
  const goals = plans.filter(p => p.type !== 'daily');
  const misses = plans.filter(p => !p.is_done && p.end_date < today);
  const nav = (mm: string, u: string) => r.push(`/plans?m=${mm}&u=${u}`);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7), next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const toggle = async (p: P) => { let reason: string | undefined; if (p.is_done === false && p.end_date < today) { /* 완료 처리 */ } if (p.is_done === false && false) {} const done = !p.is_done; if (!done && p.end_date < today) { reason = prompt('미이행 사유') ?? undefined; } const x = await togglePlan(p.id, done, reason); notify(x.msg); r.refresh(); };
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>계획 캘린더</h1>
        <button className="btn ghost" style={{ padding: '5px 10px' }} onClick={() => nav(prev, target)}>‹</button><b>{y}년 {m}월</b><button className="btn ghost" style={{ padding: '5px 10px' }} onClick={() => nav(next, target)}>›</button>
        {me.role !== 'staff' && <select value={target} onChange={e => nav(month, e.target.value)} style={{ width: 180 }}>{[{ id: me.id, name: me.name + ' (나)' }, ...people.filter(p => p.id !== me.id)].map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12 }}>{Object.entries(NAME).map(([k, v]) => <span key={k}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLOR[k], marginRight: 5 }} />{v}</span>)}<span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#FFD2D2', marginRight: 5 }} />공휴일·일요일</span><span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#D9E2FF', marginRight: 5 }} />토요일</span><label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={showSlots} onChange={e => setShowSlots(e.target.checked)} style={{ width: 14, height: 14 }} /><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#E9EDF5', border: '1px solid #B9C3DD', marginRight: 2 }} />진행 중 슬롯 {slots.length}건 <span style={{ color: '#C8302F' }}>■</span> 종료일</label></span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>{(['daily', 'weekly', 'monthly'] as const).map(t => <div key={t} className="card" style={{ padding: '14px 18px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{NAME[t]} 달성률 <span style={{ color: 'var(--muted)' }}>· 오늘까지</span></div><div style={{ fontSize: 24, fontWeight: 800, color: COLOR[t] }}>{rate(t) === null ? '-' : rate(t) + '%'}</div></div>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <div className="card">
          {goals.length > 0 && <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>{goals.map(p => <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)' }}><i style={{ width: 6, height: 24, borderRadius: 3, background: COLOR[p.type] }} /><div style={{ flex: 1 }}><div style={{ textDecoration: p.is_done ? 'line-through' : 'none', opacity: p.is_done ? .5 : 1 }}>{p.title}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{NAME[p.type]} · {p.start_date.slice(5)} ~ {p.end_date.slice(5)}{p.detail ? ' · ' + p.detail : ''}</div></div>{mine && <input type="checkbox" checked={p.is_done} onChange={() => toggle(p)} style={{ width: 18, height: 18 }} />}{mine && <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setEdit(p)}>수정</button>}{mine && <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={async () => { if (confirm('삭제할까요?')) { const x = await removePlan(p.id); notify(x.msg); r.refresh(); } }}>삭제</button>}</div>)}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }} onClick={() => setPopDay(null)}>
            {['월', '화', '수', '목', '금', '토', '일'].map(d => <div key={d} style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', fontWeight: 600 }}>{d}</div>)}
            {cells.map((d, i) => { const hol = d ? holidayName(d) : null; const off = !!d && (hol != null || isWeekend(d)); const sun = !!d && new Date(d + 'T00:00:00Z').getUTCDay() === 0; return <div key={i} style={{ minHeight: 88, border: '1px solid var(--line)', borderRadius: 8, padding: 5, fontSize: 11.5, background: !d ? 'transparent' : hol || sun ? '#FFF1F1' : isWeekend(d) ? '#F3F6FF' : 'var(--panel)', opacity: d ? 1 : .3, boxShadow: d === today ? '0 0 0 2px var(--accent-soft)' : undefined, borderColor: d === today ? 'var(--accent)' : undefined }}>
              {d && <><div style={{ color: d === today ? 'var(--accent)' : hol || sun ? '#B91C1C' : off ? '#2F4BDB' : 'var(--muted)', fontWeight: 600, marginBottom: 3, display: 'flex', justifyContent: 'space-between', gap: 4 }}><span>{Number(d.slice(8))}</span>{hol && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#B91C1C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={hol}>{hol}</span>}</div>
                {plans.filter(p => p.type === 'daily' && inR(d, p)).map(p => <div key={p.id} title={(p.detail || '') + (p.miss_reason ? ' / 미이행: ' + p.miss_reason : '')} onClick={() => mine && toggle(p)} onContextMenu={e => { if (mine) { e.preventDefault(); setEdit(p); } }} onDoubleClick={() => mine && setEdit(p)} style={{ background: COLOR.daily, color: '#fff', borderRadius: 5, padding: '2px 6px', marginBottom: 2, cursor: mine ? 'pointer' : 'default', opacity: p.is_done ? .4 : 1, textDecoration: p.is_done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.is_done ? '✓ ' : ''}{p.title}</div>)}
                {showSlots && slotsOn(d).slice(0, 4).map(x => { const end = x.date_to === d, start = x.date_from === d; return <div key={x.settle_no} title={`${x.cust_name} · ${x.prod_name} · ${x.date_from} ~ ${x.date_to}${x.inflow_cnt ? ` · 유입 ${x.inflow_cnt}` : ''} · ${x.status}`} style={{ background: end ? '#FDE2E2' : 'var(--bg)', color: end ? '#B91C1C' : 'var(--muted)', border: '1px solid ' + (end ? '#F3B4B4' : 'var(--line)'), borderLeft: start ? '3px solid var(--accent)' : undefined, borderRadius: 4, padding: '1px 5px', marginBottom: 2, fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: end ? 700 : 500 }}>{end ? '종료 ' : ''}{x.cust_name}</div>; })}
                {showSlots && slotsOn(d).length > 4 && <div onMouseEnter={() => setPopDay(d)} onMouseLeave={() => setPopDay(null)} onClick={e => { e.stopPropagation(); setPopDay(popDay === d ? null : d); }} style={{ position: 'relative', fontSize: 10.5, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', padding: '1px 4px', borderRadius: 4, background: popDay === d ? 'var(--accent-soft)' : undefined }}>+{slotsOn(d).length - 4}건 더보기
                  {popDay === d && <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, minWidth: 280, maxWidth: 360, maxHeight: 320, overflow: 'auto', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(17,26,51,.15)', padding: 8, cursor: 'default', fontWeight: 400, color: 'var(--ink)' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>{Number(d.slice(5, 7))}/{Number(d.slice(8))} 진행 중 슬롯 {slotsOn(d).length}건</div>
                    {slotsOn(d).map(x => { const end = x.date_to === d; return <div key={x.settle_no} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, padding: '4px 0', borderTop: '1px solid var(--line)', color: end ? '#B91C1C' : 'inherit' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{x.cust_name}</b> <span style={{ color: 'var(--muted)' }}>{x.prod_name}</span></span><span style={{ whiteSpace: 'nowrap', color: end ? '#B91C1C' : 'var(--muted)' }}>{end ? '오늘 종료' : `~${x.date_to.slice(5).replace('-', '/')}`}</span></div>; })}
                  </div>}</div>}</>}
            </div>; })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{mine ? '일정 클릭 = 완료/미완료 전환 · 더블클릭 또는 우클릭 = 수정. 기한 지난 계획을 미완료로 돌리면 사유를 묻습니다.' : '열람 전용'}</div>
        </div>
        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          {endingThisMonth.length > 0 && <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>이달 종료 슬롯 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{endingThisMonth.length}건 · 종료 전 재계약 연락</span></h3>
            <div style={{ display: 'grid', gap: 4, maxHeight: 260, overflow: 'auto' }}>{endingThisMonth.map(x => { const dd = Math.round((new Date(x.date_to + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 864e5); return <div key={x.settle_no} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '5px 0', borderTop: '1px solid var(--line)' }}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{x.cust_name}</b> <span style={{ color: 'var(--muted)' }}>{x.prod_name}</span></span><span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: dd <= 3 ? '#B91C1C' : 'var(--muted)' }}>{x.date_to.slice(5).replace('-', '/')} {dd === 0 ? '오늘' : `D-${dd}`}</span></div>; })}</div></div>}
          {mine && <div className="card" style={edit ? { borderColor: 'var(--accent)' } : undefined}><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? '계획 수정' : '계획 추가'}</h3>
            <form key={edit?.id ?? 'new'} action={async fd => { const x = edit ? await updatePlan(fd) : await addPlan(fd); notify(x.msg); if (x.ok) { setEdit(null); r.refresh(); (document.getElementById('planForm') as HTMLFormElement)?.reset(); } }} id="planForm" style={{ display: 'grid', gap: 10 }}>
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <select name="type" defaultValue={edit?.type ?? 'daily'}><option value="daily">일일</option><option value="weekly">주간</option><option value="monthly">월</option></select>
              <input name="title" placeholder="내용 (예: 신규 미팅 5건)" defaultValue={edit?.title ?? ''} required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input type="date" name="start_date" defaultValue={edit?.start_date ?? today} required /><input type="date" name="end_date" defaultValue={edit?.end_date ?? today} /></div>
              <input name="detail" placeholder="상세 (선택)" defaultValue={edit?.detail ?? ''} />
              <div style={{ display: 'flex', gap: 8 }}><button className="btn">{edit ? '저장' : '추가'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>취소</button>}</div>
            </form></div>}
          <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>미이행 <span className="pill" style={misses.length ? { background: 'var(--bad-soft)', color: 'var(--bad)' } : undefined}>{misses.length}건</span></h3>
            {misses.map(p => <div key={p.id} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 6, fontSize: 13 }}><b>{p.title}</b><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{NAME[p.type]} · {p.end_date} 까지 · {p.miss_reason || '사유 미입력'}</div></div>)}
            {misses.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>없음</div>}</div>
        </div>
      </div>
    </div>
  );
}
