import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, addDays, fmtMD } from '@/lib/date/kst';
import CheckCard from './CheckCard';
export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const me = (await getProfile())!;
  const sb = supabaseServer();
  const today = todayKST();
  const from = addDays(today, -6);
  const [{ data: rows }, { data: people }, { data: leaves }, { data: lateSetting }] = await Promise.all([
    sb.from('attendance').select('user_id,work_date,check_in,check_out,is_late').gte('work_date', from).lte('work_date', today),
    sb.from('profiles').select('id,name,team_id,role,position').eq('is_active', true).neq('role', 'admin').order('team_id').order('name'),
    sb.from('leave_requests').select('user_id,type,start_date,end_date,status,reason').lte('start_date', today).gte('end_date', today).neq('status', 'rejected').neq('status', 'cancelled'),
    me.role === 'admin' ? sb.from('app_settings').select('value').eq('key', 'late_after').maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const mine = rows?.find(r => r.user_id === me.id && r.work_date === today) ?? null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const leaveName: Record<string, string> = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', monthly: '월차', sick: '병가', absent: '무단결근', late: '지각' };
  const scope = (people ?? []).filter(u => u.role !== 'head');
  const todayLv = (leaves ?? []).filter(l => scope.some(u => u.id === l.user_id));
  const noCheck = scope.filter(u => !rows?.find(r => r.user_id === u.id && r.work_date === today) && !todayLv.find(l => l.user_id === u.id && l.type !== 'late'));
  const nm = (id: string) => scope.find(u => u.id === id)?.name ?? '-';
  const cnt = (t: string[]) => todayLv.filter(l => t.includes(l.type)).length;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>출퇴근 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>{today} · 지각 기준 {lateSetting?.value ?? '10:00'}</span></h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <CheckCard today={today} checkIn={mine?.check_in?.slice(0, 5) ?? null} checkOut={mine?.check_out?.slice(0, 5) ?? null} isLate={!!mine?.is_late} />
        <div className="card">
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>당일 근태 이슈 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{me.role === 'staff' ? '본인' : '보이는 범위'}</span></h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            {[['지각', cnt(['late']), 'var(--bad)'], ['병가', cnt(['sick']), 'var(--bad)'], ['월차', cnt(['monthly']), 'var(--ink)'], ['연차·반차', cnt(['annual', 'half_am', 'half_pm']), 'var(--ink)']].map(([l, n, c]) => (
              <div key={String(l)} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{l}</div><div style={{ fontSize: 20, fontWeight: 800, color: String(c) }}>{n}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>명</span></div></div>))}
          </div>
          {todayLv.map((l, i) => <div key={i} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 6, fontSize: 13 }}><b>{nm(l.user_id)}</b> <span className="pill" style={{ marginLeft: 6 }}>{leaveName[l.type]}</span>{l.status === 'pending' && <span style={{ color: 'var(--muted)', fontSize: 12 }}> · 확정 대기</span>}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.reason}</div></div>)}
          {me.role !== 'staff' && noCheck.length > 0 && <div style={{ padding: '8px 10px', background: 'var(--bad-soft)', borderRadius: 8, fontSize: 13, color: 'var(--bad)' }}><b>출근 미체크 {noCheck.length}명</b> — {noCheck.map(u => u.name).join(', ')}</div>}
          {todayLv.length === 0 && noCheck.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>오늘 근태 이슈 없음</div>}
        </div>
      </div>
      <div className="card">
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{me.role === 'staff' ? '내 최근 7일' : '출퇴근 현황 · 최근 7일'}</h3>
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>이름</th>{days.map(d => <th key={d} style={{ textAlign: 'center' }}>{fmtMD(d)}</th>)}</tr></thead>
          <tbody>{(me.role === 'staff' ? scope.filter(u => u.id === me.id) : scope).map(u => (
            <tr key={u.id}><td><b>{u.name}</b>{u.position && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.position}</div>}</td>
              {days.map(d => { const r = rows?.find(x => x.user_id === u.id && x.work_date === d); const lv = (leaves ?? []).find(l => l.user_id === u.id && l.start_date <= d && l.end_date >= d && l.type !== 'late');
                return <td key={d} style={{ textAlign: 'center', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{r ? <><span style={{ color: r.is_late ? 'var(--bad)' : 'inherit', fontWeight: r.is_late ? 700 : 400 }}>{r.check_in?.slice(0, 5)}</span><span style={{ color: 'var(--muted)' }}> / {r.check_out?.slice(0, 5) ?? '–'}</span></> : lv ? <span className="pill" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>{leaveName[lv.type]}</span> : <span style={{ color: 'var(--line)' }}>·</span>}</td>; })}
            </tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}
