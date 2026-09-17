'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestLeave, decideLeave } from './actions';
import type { Profile } from '@/lib/auth/session';
type P = { id: string; name: string; team_id: number | null; role: string; position: string | null; annual_leave_granted: number; monthly_leave_granted: number; hired_at: string | null };
type L = { id: number; user_id: string; type: string; start_date: string; end_date: string; days: number; reason: string | null; status: string; source: string };
type Agg = { user_id: string; month?: string; year?: number; late_cnt: number; absent_cnt: number; sick_cnt: number; annual_cnt: number; half_cnt: number; monthly_cnt: number; annual_used: number; monthly_used: number };
const leaveName: Record<string, string> = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', monthly: '월차', sick: '병가', absent: '무단결근', late: '지각' };
const stName: Record<string, [string, React.CSSProperties]> = { pending: ['대기', { background: '#FDF1DD', color: '#D97706' }], approved: ['승인', { background: 'var(--ok-soft, #E7F7EC)', color: 'var(--ok)' }], rejected: ['반려', { background: 'var(--bad-soft)', color: 'var(--bad)' }], cancelled: ['취소', { background: 'var(--bg)', color: 'var(--muted)' }] };

export default function LeaveClient({ me, people, leaves, monthly, yearly, teams, month, today, selUser }: { me: Profile; people: P[]; leaves: L[]; monthly: Agg[]; yearly: Agg[]; teams: { id: number; name: string }[]; month: string; today: string; selUser: string }) {
  const r = useRouter(); const [msg, setMsg] = useState('');
  const canManage = me.role !== 'staff';
  const canSeeAll = me.role === 'admin' || me.role === 'head';
  const pool = people.filter(p => p.role !== 'head');
  const one = selUser !== 'all' ? pool.find(p => p.id === selUser) ?? null : null;
  const us = one ? [one] : pool;
  const M = (u: string) => monthly.find(a => a.user_id === u && a.month === month + '-01');
  const Y = (u: string) => yearly.find(a => a.user_id === u);
  const z = (a?: Agg) => a ?? { late_cnt: 0, absent_cnt: 0, sick_cnt: 0, annual_cnt: 0, half_cnt: 0, monthly_cnt: 0, annual_used: 0, monthly_used: 0 } as Agg;
  const rows = leaves.filter(l => us.some(u => u.id === l.user_id) && (one ? true : l.status === 'pending' || l.start_date.startsWith(month)));
  const nav = (m: string, u: string) => r.push(`/leave?m=${m}&u=${u}`);
  const months = Array.from({ length: Number(today.slice(5, 7)) }, (_, i) => `${today.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`);
  const tgt = one ?? people.find(p => p.id === me.id) ?? pool[0];
  const tm = z(tgt && M(tgt.id)), ty = z(tgt && Y(tgt.id));
  const cell = (a: number, b: number, warn?: string) => <td className="num" style={{ textAlign: 'right', color: warn }}><b>{a}</b><span style={{ color: 'var(--muted)', fontSize: 12 }}> / {b}</span></td>;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>근태</h1>
        <select value={month} onChange={e => nav(e.target.value, selUser)} style={{ width: 130 }}>{months.map(m => <option key={m} value={m}>{Number(m.slice(5))}월</option>)}</select>
        {canManage && <select value={selUser} onChange={e => nav(month, e.target.value)} style={{ width: 200 }}><option value="all">{canSeeAll ? '전체 인원' : '팀 전체'}</option>{pool.map(p => <option key={p.id} value={p.id}>{p.name} · {teams.find(t => t.id === p.team_id)?.name ?? '-'}</option>)}</select>}
        {msg && <span style={{ fontSize: 13, color: msg.includes('실패') || msg.includes('부족') || msg.includes('권한') ? 'var(--bad)' : 'var(--ok)' }}>{msg}</span>}
      </div>
      {tgt && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[[`${one ? tgt.name : '내'} 잔여 연차`, `${tgt.annual_leave_granted - ty.annual_used}일`, `부여 ${tgt.annual_leave_granted} · 사용 ${ty.annual_used} (연)`], [`${Number(month.slice(5))}월 지각`, `${tm.late_cnt}회`, `연 누계 ${ty.late_cnt}회`], [`${Number(month.slice(5))}월 연차·반차·병가`, `${tm.annual_cnt} · ${tm.half_cnt} · ${tm.sick_cnt}회`, `연 누계 ${ty.annual_cnt} · ${ty.half_cnt} · ${ty.sick_cnt}회`], [canManage ? '승인 대기' : '내 신청 대기', `${rows.filter(l => l.status === 'pending' && (canManage || l.user_id === me.id)).length}건`, '']].map(([l, v, d]) => (
          <div key={l} className="card" style={{ padding: '14px 18px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{l}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{d}</div></div>))}
      </div>}
      {!one && <div className="card">
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>근태 누계 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>각 칸 <b>{Number(month.slice(5))}월</b> / {today.slice(0, 4)}년 · 승인 건만</span></h3>
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>이름</th><th style={{ textAlign: 'right' }}>연차</th><th style={{ textAlign: 'right' }}>반차</th><th style={{ textAlign: 'right' }}>월차</th><th style={{ textAlign: 'right' }}>병가</th><th style={{ textAlign: 'right' }}>무단결근</th><th style={{ textAlign: 'right' }}>지각</th><th style={{ textAlign: 'right' }}>연차 사용/부여</th></tr></thead>
          <tbody>{(me.role === 'staff' ? pool.filter(p => p.id === me.id) : pool).map(u => { const m = z(M(u.id)), y = z(Y(u.id)); return (
            <tr key={u.id} style={{ cursor: canManage ? 'pointer' : 'default' }} onClick={() => canManage && nav(month, u.id)}><td><b>{u.name}</b><div style={{ fontSize: 11, color: 'var(--muted)' }}>{teams.find(t => t.id === u.team_id)?.name ?? ''} {u.position ?? ''}</div></td>
              {cell(m.annual_cnt, y.annual_cnt)}{cell(m.half_cnt, y.half_cnt)}{cell(m.monthly_cnt, y.monthly_cnt)}{cell(m.sick_cnt, y.sick_cnt, y.sick_cnt > 2 ? '#D97706' : undefined)}{cell(m.absent_cnt, y.absent_cnt, y.absent_cnt ? 'var(--bad)' : undefined)}{cell(m.late_cnt, y.late_cnt, y.late_cnt >= 3 ? 'var(--bad)' : y.late_cnt ? '#D97706' : undefined)}
              <td style={{ textAlign: 'right' }}>{y.annual_used} / {u.annual_leave_granted}</td></tr>); })}</tbody>
        </table></div>
      </div>}
      {one && <div className="card">
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{one.name} {today.slice(0, 4)}년 월별 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{one.position ?? ''} · 입사 {one.hired_at ?? '-'}</span> <button className="btn ghost" style={{ float: 'right', padding: '4px 10px', fontSize: 12 }} onClick={() => nav(month, 'all')}>전체로</button></h3>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>유형</th>{months.map(m => <th key={m} style={{ textAlign: 'right', color: m === month ? 'var(--accent)' : undefined }}>{Number(m.slice(5))}월</th>)}<th style={{ textAlign: 'right', background: 'var(--accent-soft)' }}>연</th></tr></thead>
          <tbody>{([['annual_cnt', '연차'], ['half_cnt', '반차'], ['monthly_cnt', '월차'], ['sick_cnt', '병가'], ['absent_cnt', '무단결근'], ['late_cnt', '지각']] as const).map(([k, l]) => <tr key={k}><td><b>{l}</b></td>{months.map(m => { const v = (monthly.find(a => a.user_id === one.id && a.month === m + '-01') as any)?.[k] ?? 0; return <td key={m} style={{ textAlign: 'right', fontWeight: v ? 700 : 400, color: v ? (k === 'late_cnt' || k === 'absent_cnt' ? 'var(--bad)' : k === 'sick_cnt' ? '#D97706' : 'inherit') : 'var(--line)', background: m === month ? 'var(--bg)' : undefined }}>{v || '·'}</td>; })}<td style={{ textAlign: 'right', fontWeight: 800, background: 'var(--accent-soft)' }}>{(z(Y(one.id)) as any)[k]}</td></tr>)}</tbody></table></div>
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <div className="card">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{one ? `${one.name} 근태 내역 · ${today.slice(0, 4)}년` : `근태 내역 · ${Number(month.slice(5))}월 (대기 건 포함)`} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{rows.length}건</span></h3>
          <table><thead><tr><th>이름</th><th>유형</th><th>기간</th><th>일수</th><th>사유</th><th>상태</th><th></th></tr></thead>
            <tbody>{rows.map(l => <tr key={l.id}><td>{pool.find(p => p.id === l.user_id)?.name ?? '-'}</td><td>{leaveName[l.type]}</td><td style={{ whiteSpace: 'nowrap' }}>{l.start_date}{l.end_date !== l.start_date && ` ~ ${l.end_date}`}</td><td>{l.days || '-'}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{l.reason}{l.source === 'auto_late' && ' · 자동'}</td><td><span className="pill" style={stName[l.status][1]}>{stName[l.status][0]}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>{l.status === 'pending' && (canManage ? <><button className="btn" style={{ padding: '4px 10px', fontSize: 12, background: 'var(--ok)' }} onClick={async () => { const x = await decideLeave(l.id, 'approved'); setMsg(x.msg); r.refresh(); }}>승인</button> <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={async () => { const x = await decideLeave(l.id, 'rejected'); setMsg(x.msg); r.refresh(); }}>반려</button></> : l.user_id === me.id && <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={async () => { const x = await decideLeave(l.id, 'cancelled'); setMsg(x.msg); r.refresh(); }}>취소</button>)}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>없음</td></tr>}</tbody></table>
        </div>
        <div className="card">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{canManage ? '근태 등록' : '휴가 신청'}</h3>
          <form action={async fd => { const x = await requestLeave(fd); setMsg(x.msg); if (x.ok) r.refresh(); }} style={{ display: 'grid', gap: 10 }}>
            {canManage && <select name="user_id" defaultValue={one?.id ?? pool[0]?.id}>{pool.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            <select name="type">{Object.entries(leaveName).filter(([k]) => canManage || !['absent', 'late'].includes(k)).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input type="date" name="start_date" defaultValue={today} required /><input type="date" name="end_date" defaultValue={today} /></div>
            <input name="reason" placeholder="사유" />
            <button className="btn">{canManage ? '등록 (즉시 승인)' : '신청'}</button>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{canManage ? '팀장·총괄·어드민 등록은 바로 승인 처리됩니다. 무단결근·지각은 여기서만 등록.' : '팀장 승인 후 반영. 잔여 연차를 넘으면 신청이 막힙니다.'}</div>
          </form>
        </div>
      </div>
    </div>
  );
}
