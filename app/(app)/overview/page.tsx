import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, weekStartOf, addDays, won, man } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, bizLabel } from '@/lib/date/period';
import { evaluatePeople } from '@/lib/eval';
export const dynamic = 'force-dynamic';
export default async function OverviewPage({ searchParams }: { searchParams: { team?: string } }) {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.role === 'manager')) redirect('/');
  const sb = supabaseServer(); const today = todayKST(); const bm = bizMonthOf(today); const [ms, meD] = bizMonthRange(bm); const ws = weekStartOf(today), we = addDays(ws, 6), lastWs = addDays(ws, -7);
  const teamFilter = me.role === 'manager' ? (me.team_id ?? 0) : Number(searchParams.team) || 0;
  const [{ people, teams }, { data: att }, { data: kpiToday }, { data: leavesPending }, { data: leavesToday }, { data: targets }, { data: wr }, { data: pipe }, { data: plans }, { data: kpiMonth }] = await Promise.all([
    evaluatePeople(today),
    sb.from('attendance').select('user_id,check_in,check_out,is_late').eq('work_date', today),
    sb.from('kpi_daily').select('user_id,margin').eq('work_date', today),
    sb.from('leave_requests').select('user_id,type,team_approved_at').eq('status', 'pending'),
    sb.from('leave_requests').select('user_id,type').eq('status', 'approved').lte('start_date', today).gte('end_date', today),
    sb.from('monthly_targets').select('user_id,margin').eq('month', bm + '-01'),
    sb.from('weekly_reports').select('team_id,week_start,status').in('week_start', [ws, lastWs]),
    sb.from('pipeline').select('owner_id,stage').eq('is_active', true),
    sb.from('v_plan_rate').select('user_id,type,total,done').eq('month', bm + '-01'),
    sb.from('v_margin_monthly').select('user_id,days,calls,new_cnt').eq('month', bm + '-01'),
  ]);
  const leaveName: Record<string, string> = { annual: '연차', half_am: '반차', half_pm: '반차', monthly: '월차', sick: '병가', absent: '결근', late: '지각' };
  const rows = people.filter(p => !teamFilter || p.team_id === teamFilter);
  const tn = (id: number | null) => teams.find(t => t.id === id)?.name ?? '-';
  const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
  const Pill = ({ t, c }: { t: string; c: 'ok' | 'warn' | 'bad' | 'gray' }) => <span className="pill" style={{ background: c === 'ok' ? 'var(--ok-soft)' : c === 'warn' ? '#FDF1DD' : c === 'bad' ? 'var(--bad-soft)' : 'var(--bg)', color: c === 'ok' ? 'var(--ok)' : c === 'warn' ? '#D97706' : c === 'bad' ? 'var(--bad)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{t}</span>;
  const teamWr = (teamId: number | null) => { const cur = wr?.find(w => w.team_id === teamId && w.week_start === ws); const last = wr?.find(w => w.team_id === teamId && w.week_start === lastWs); return { cur: cur?.status, last: last?.status }; };
  const sum = { margin: rows.reduce((a, p) => a + (p.role === 'staff' ? p.monthMargin : 0), 0), target: rows.reduce((a, p) => a + Number(targets?.find(t => t.user_id === p.id)?.margin ?? 0), 0), inc: rows.reduce((a, p) => a + p.inc.total, 0), att: rows.filter(p => att?.some(a => a.user_id === p.id)).length, kpi: rows.filter(p => kpiToday?.some(k => k.user_id === p.id)).length, promo: rows.filter(p => p.promo?.ok).length };
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><h1 style={{ fontSize: 20, margin: 0 }}>직원 현황</h1><span style={{ fontSize: 13, color: 'var(--muted)' }}>{today} · {bizLabel(bm)}</span>
        {me.role !== 'manager' && <div style={{ display: 'flex', gap: 4 }}><a href="/overview" className="btn ghost" style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none', background: !teamFilter ? 'var(--accent-soft)' : undefined }}>전체</a>{teams.filter(t => people.some(p => p.team_id === t.id)).map(t => <a key={t.id} href={`/overview?team=${t.id}`} className="btn ghost" style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none', background: teamFilter === t.id ? 'var(--accent-soft)' : undefined }}>{t.name}</a>)}</div>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
        {[['출근', `${sum.att}/${rows.length}`], ['오늘 KPI 제출', `${sum.kpi}/${rows.length}`], [`${Number(bm.slice(5))}월 마진`, won(sum.margin)], ['목표 달성', sum.target ? pct(sum.margin, sum.target) + '%' : '-'], ['진급 기준 도달', `${sum.promo}명`], ['예상 인센티브 합', won(sum.inc)]].map(([l, v]) => <div key={l} className="card" style={{ padding: '12px 16px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{l}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div></div>)}
      </div>
      <div className="card"><div style={{ overflowX: 'auto' }}><table style={{ fontSize: 13 }}>
        <thead><tr><th>이름</th><th>팀·직급</th><th>오늘 출근</th><th>오늘 KPI</th><th style={{ textAlign: 'right' }}>{Number(bm.slice(5))}월 마진</th><th>목표</th><th style={{ textAlign: 'right' }}>콜/신규</th><th>근태</th><th>계획</th><th>주간보고</th><th>가망건</th><th>진급</th><th style={{ textAlign: 'right' }}>예상 인센</th></tr></thead>
        <tbody>{rows.map(p => {
          const a = att?.find(x => x.user_id === p.id); const lv = leavesToday?.find(x => x.user_id === p.id); const k = kpiToday?.find(x => x.user_id === p.id);
          const tg = Number(targets?.find(t => t.user_id === p.id)?.margin ?? 0); const pend = leavesPending?.filter(x => x.user_id === p.id) ?? [];
          const km = kpiMonth?.find(x => x.user_id === p.id); const pl = plans?.filter(x => x.user_id === p.id) ?? []; const plT = pl.reduce((s, x) => s + Number(x.total), 0), plD = pl.reduce((s, x) => s + Number(x.done), 0);
          const pc = pipe?.filter(x => x.owner_id === p.id) ?? []; const w = p.role === 'manager' ? teamWr(p.team_id) : null;
          const r = tg ? p.monthMargin / tg : 0;
          return <tr key={p.id}>
            <td><b>{p.name}</b></td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{tn(p.team_id)} · {p.position ?? '-'}</td>
            <td>{lv ? <Pill t={leaveName[lv.type]} c="gray" /> : a ? <Pill t={`${a.check_in?.slice(0, 5)}${a.is_late ? ' 지각' : ''}${a.check_out ? ' → ' + a.check_out.slice(0, 5) : ''}`} c={a.is_late ? 'warn' : 'ok'} /> : <Pill t="미체크" c="bad" />}</td>
            <td>{p.role === 'manager' ? <span style={{ color: 'var(--muted)' }}>-</span> : k ? <Pill t={`제출 ${won(k.margin)}`} c="ok" /> : <Pill t="미제출" c="bad" />}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: p.monthMargin < 0 ? 'var(--bad)' : 'inherit' }}>{won(p.monthMargin)}{p.role === 'manager' && <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>팀 합계</div>}</td>
            <td style={{ minWidth: 110 }}>{tg ? <><div style={{ fontSize: 12 }}>{pct(p.monthMargin, tg)}% <span style={{ color: 'var(--muted)' }}>/ {man(tg)}</span></div><div style={{ height: 6, background: 'var(--line)', borderRadius: 4 }}><div style={{ width: `${Math.min(100, Math.max(0, r * 100))}%`, height: '100%', background: r >= 1 ? 'var(--ok)' : r >= .7 ? '#D97706' : 'var(--accent)', borderRadius: 4 }} /></div></> : <span style={{ fontSize: 12, color: 'var(--muted)' }}>미설정</span>}</td>
            <td style={{ textAlign: 'right', fontSize: 12 }}>{km ? `${Number(km.calls).toLocaleString()} / ${km.new_cnt}` : '-'}<div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{km ? `${km.days}일 입력` : ''}</div></td>
            <td style={{ fontSize: 12 }}>{pend.length ? <Pill t={`대기 ${pend.length}`} c="warn" /> : <span style={{ color: 'var(--muted)' }}>-</span>} <span style={{ color: p.late > 0 || p.absent > 0 ? 'var(--bad)' : 'var(--muted)' }}>지각{p.late} 결근{p.absent}</span></td>
            <td style={{ fontSize: 12 }}>{plT ? `${plD}/${plT} (${pct(plD, plT)}%)` : <span style={{ color: 'var(--muted)' }}>-</span>}</td>
            <td>{w ? <><Pill t={`이번주 ${w.cur === 'submitted' ? '제출' : w.cur === 'draft' ? '작성중' : '없음'}`} c={w.cur === 'submitted' ? 'ok' : w.cur ? 'warn' : 'bad'} /><div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>지난주 {w.last === 'submitted' ? '제출' : '미제출'}</div></> : <span style={{ color: 'var(--muted)' }}>-</span>}</td>
            <td style={{ fontSize: 12 }}>{pc.length ? `${pc.length}건 (협상 ${pc.filter(x => x.stage === '협상').length})` : <span style={{ color: 'var(--muted)' }}>-</span>}</td>
            <td>{p.promo ? <Pill t={p.promo.ok ? `도달 → ${p.promo.c.to_position}` : `미도달 (${p.promo.fails.join('·')})`} c={p.promo.ok ? 'ok' : 'gray'} /> : <span style={{ fontSize: 12, color: 'var(--muted)' }}>기준 없음</span>}</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(p.inc.total)}<div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>{p.inc.tier?.label}</div></td>
          </tr>; })}
        {rows.length === 0 && <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>인원 없음</td></tr>}</tbody></table></div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>마진·목표·계획·진급·인센티브는 {bizLabel(bm)} 기준. 지각·결근은 진급 판정 기준(지각 이달, 결근 올해). 팀장 행의 마진은 팀 합계.</div></div>
    </div>
  );
}
