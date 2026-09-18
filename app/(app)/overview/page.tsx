import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, weekStartOf, addDays, won, man } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, bizLabel, prevBizMonth } from '@/lib/date/period';
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
  const sixStart = (() => { const y = Number(bm.slice(0, 4)), m = Number(bm.slice(5, 7)); const d = new Date(Date.UTC(y, m - 6, 1)); return d.toISOString().slice(0, 10); })();
  const pbm = prevBizMonth(bm); const [pms, pme] = bizMonthRange(pbm);
  const dayIdx = Math.round((new Date(today + 'T00:00:00Z').getTime() - new Date(ms + 'T00:00:00Z').getTime()) / 864e5);   // 이달 경과 일수(0부터)
  const pSame = addDays(pms, dayIdx) > pme ? pme : addDays(pms, dayIdx);                                                   // 지난달 같은 시점
  const totalDays = Math.round((new Date(meD + 'T00:00:00Z').getTime() - new Date(ms + 'T00:00:00Z').getTime()) / 864e5) + 1;
  const [{ data: daily }, { data: sixM }, { data: prevDaily }] = await Promise.all([
    sb.from('kpi_daily').select('user_id,team_id,work_date,margin').gte('work_date', ms).lte('work_date', meD).limit(5000),
    sb.from('v_margin_monthly').select('team_id,month,margin').gte('month', sixStart),
    sb.from('kpi_daily').select('user_id,team_id,work_date,margin').gte('work_date', pms).lte('work_date', pme).limit(5000),
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
      {(() => {
        const staff = rows.filter(p => p.role === 'staff');
        const teamsShown = teams.filter(t => rows.some(p => p.team_id === t.id));
        const teamAgg = teamsShown.map(t => { const ids = rows.filter(p => p.team_id === t.id && p.role === 'staff').map(p => p.id); return { t, m: staff.filter(p => ids.includes(p.id)).reduce((a, p) => a + p.monthMargin, 0), tg: ids.reduce((a, id) => a + Number(targets?.find(x => x.user_id === id)?.margin ?? 0), 0) }; });
        const rank = [...staff].sort((a, b) => b.monthMargin - a.monthMargin).slice(0, 10); const mxR = Math.max(1, ...rank.map(p => Math.abs(p.monthMargin)));
        const dScope = (daily ?? []).filter(d => rows.some(p => p.id === d.user_id));
        const days = [...new Set(dScope.map(d => d.work_date))].sort().map(d => ({ d, m: dScope.filter(x => x.work_date === d).reduce((a, x) => a + Number(x.margin), 0) })); const mxD = Math.max(1, ...days.map(x => Math.abs(x.m)));
        const months = [...new Set((sixM ?? []).map(x => x.month))].sort().slice(-6);
        const byTM = (t: number, mo: string) => (sixM ?? []).filter(x => x.team_id === t && x.month === mo).reduce((a, x) => a + Number(x.margin), 0);
        const mxM = Math.max(1, ...months.flatMap(mo => teamsShown.map(t => Math.abs(byTM(t.id, mo)))));
        const colors = ['#3D5AFE', '#12B981', '#F97316', '#8B5CF6', '#EC4899', '#0EA5E9'];
        const dot = (ok: boolean | null, c: string) => <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: ok === null ? 'var(--line)' : ok ? c : 'var(--bad)', marginRight: 3 }} />;
        const inScope = (d: { user_id: string }) => rows.some(p => p.id === d.user_id && p.role === 'staff');
        const cur = (daily ?? []).filter(inScope); const prv = (prevDaily ?? []).filter(inScope);
        const sumM = (arr: { margin: number }[]) => arr.reduce((a, x) => a + Number(x.margin), 0);
        const curSoFar = sumM(cur.filter(x => x.work_date <= today)); const prvSame = sumM(prv.filter(x => x.work_date <= pSame)); const prvTotal = sumM(prv);
        const elapsed = dayIdx + 1; const pace = elapsed ? Math.round(curSoFar / elapsed * totalDays) : 0;
        const diffPct = prvSame ? Math.round((curSoFar - prvSame) / Math.abs(prvSame) * 100) : null;
        const cmpRows = [
          ...teamsShown.map(t => { const ids = rows.filter(p => p.team_id === t.id && p.role === 'staff').map(p => p.id); return { name: t.name, bold: true, c: sumM(cur.filter(x => ids.includes(x.user_id) && x.work_date <= today)), p: sumM(prv.filter(x => ids.includes(x.user_id) && x.work_date <= pSame)), pt: sumM(prv.filter(x => ids.includes(x.user_id))) }; }),
          ...staff.map(p => ({ name: p.name, bold: false, c: sumM(cur.filter(x => x.user_id === p.id && x.work_date <= today)), p: sumM(prv.filter(x => x.user_id === p.id && x.work_date <= pSame)), pt: sumM(prv.filter(x => x.user_id === p.id)) })),
        ];
        const arrow = (c: number, p: number) => { const d = c - p; const col = d > 0 ? 'var(--ok)' : d < 0 ? 'var(--bad)' : 'var(--muted)'; return <span style={{ color: col, fontWeight: 700 }}>{d > 0 ? '▲' : d < 0 ? '▼' : '–'} {man(Math.abs(d))}{p ? ` (${d >= 0 ? '+' : ''}${Math.round(d / Math.abs(p) * 100)}%)` : ''}</span>; };
        return <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18 }}>
            <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>지난달 대비 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>같은 시점(경과 {elapsed}일/{totalDays}일) 기준</span></h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{Number(bm.slice(5))}월 누계 (오늘까지)</div><div style={{ fontSize: 22, fontWeight: 800, color: curSoFar < 0 ? 'var(--bad)' : 'inherit' }}>{won(curSoFar)}</div></div>
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{Number(pbm.slice(5))}월 같은 시점 ({pSame.slice(5).replace('-', '/')})</div><div style={{ fontSize: 22, fontWeight: 800 }}>{won(prvSame)}</div></div>
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>증감</div><div style={{ fontSize: 20 }}>{arrow(curSoFar, prvSame)}</div></div>
                <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>이 속도면 월말 예상 / {Number(pbm.slice(5))}월 총합</div><div style={{ fontSize: 16, fontWeight: 700 }}>{won(pace)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/ {won(prvTotal)}</span> <span style={{ fontSize: 12, color: pace >= prvTotal ? 'var(--ok)' : 'var(--bad)' }}>{prvTotal ? `${pace >= prvTotal ? '+' : ''}${Math.round((pace - prvTotal) / Math.abs(prvTotal) * 100)}%` : ''}</span></div></div>
              </div></div>
            <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>팀·개인별 지난달 대비 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>같은 시점 누계</span></h3>
              <div style={{ overflowX: 'auto', maxHeight: 300 }}><table style={{ fontSize: 12.5 }}><thead><tr><th>이름</th><th style={{ textAlign: 'right' }}>{Number(bm.slice(5))}월 누계</th><th style={{ textAlign: 'right' }}>{Number(pbm.slice(5))}월 같은 시점</th><th style={{ textAlign: 'right' }}>증감</th><th style={{ textAlign: 'right' }}>{Number(pbm.slice(5))}월 총합</th></tr></thead>
                <tbody>{cmpRows.map((r, i) => <tr key={i} style={{ background: r.bold ? 'var(--bg)' : undefined }}><td style={{ fontWeight: r.bold ? 700 : 400 }}>{r.name}</td><td style={{ textAlign: 'right', color: r.c < 0 ? 'var(--bad)' : 'inherit' }}>{won(r.c)}</td><td style={{ textAlign: 'right', color: 'var(--muted)' }}>{won(r.p)}</td><td style={{ textAlign: 'right' }}>{arrow(r.c, r.p)}</td><td style={{ textAlign: 'right', color: 'var(--muted)' }}>{won(r.pt)}</td></tr>)}</tbody></table></div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18 }}>
            <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>오늘 상태 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>● 출근 · ● KPI 제출 · ● 근태 대기 없음 — 빨강 = 미체크/미제출/대기 있음</span></h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>{rows.map(p => { const a = !!att?.some(x => x.user_id === p.id); const lv = !!leavesToday?.some(x => x.user_id === p.id); const k = !!kpiToday?.some(x => x.user_id === p.id); const pend = (leavesPending?.filter(x => x.user_id === p.id) ?? []).length; const bad = (!a && !lv) || (p.role === 'staff' && !k) || pend > 0;
                return <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', background: bad ? 'var(--bad-soft)' : 'var(--ok-soft)' }}><div style={{ fontWeight: 700, fontSize: 13 }}>{p.name} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{tn(p.team_id)}</span></div><div style={{ fontSize: 11, marginTop: 4 }}>{dot(lv ? null : a, '#3D5AFE')}{lv ? '휴가' : a ? '출근' : '미체크'} {dot(p.role === 'manager' ? null : k, '#12B981')}{p.role === 'manager' ? '-' : k ? 'KPI' : 'KPI 미제출'} {dot(pend === 0, '#F97316')}{pend ? `대기 ${pend}` : '근태 OK'}</div></div>; })}</div></div>
            <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>팀별 목표 달성 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{bizLabel(bm)}</span></h3>
              {teamAgg.map((x, i) => { const r = x.tg ? x.m / x.tg : 0; return <div key={x.t.id} style={{ marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>{x.t.name}</b><span>{won(x.m)} <span style={{ color: 'var(--muted)' }}>/ {x.tg ? man(x.tg) : '목표 미설정'}</span> <b style={{ color: r >= 1 ? 'var(--ok)' : r >= .7 ? '#D97706' : 'var(--bad)' }}>{x.tg ? Math.round(r * 100) + '%' : ''}</b></span></div><div style={{ height: 12, background: 'var(--line)', borderRadius: 6, marginTop: 4 }}><div style={{ width: `${Math.min(100, Math.max(0, r * 100))}%`, height: '100%', background: colors[i % colors.length], borderRadius: 6 }} /></div></div>; })}
              {teamAgg.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>팀 없음</div>}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>
            <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>개인 마진 랭킹 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{Number(bm.slice(5))}월 · 상위 10</span></h3>
              {rank.map((p, i) => { const tg = Number(targets?.find(t => t.user_id === p.id)?.margin ?? 0); return <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '22px 80px 1fr 110px', gap: 8, alignItems: 'center', marginBottom: 7, fontSize: 12.5 }}><span style={{ color: 'var(--muted)', fontWeight: 700 }}>{i + 1}</span><span><b>{p.name}</b></span><div style={{ height: 10, background: 'var(--line)', borderRadius: 5 }}><div style={{ width: `${Math.abs(p.monthMargin) / mxR * 100}%`, height: '100%', background: p.monthMargin < 0 ? 'var(--bad)' : i < 3 ? '#3D5AFE' : '#93A5FF', borderRadius: 5 }} /></div><span style={{ textAlign: 'right', fontWeight: 600, color: p.monthMargin < 0 ? 'var(--bad)' : 'inherit' }}>{won(p.monthMargin)}{tg ? <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}> {pct(p.monthMargin, tg)}%</span> : ''}</span></div>; })}
              {rank.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>데이터 없음</div>}</div>
            <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>일별 마진 추이 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{bizLabel(bm)}</span></h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 150 }}>{days.map(x => <div key={x.d} title={`${x.d} ${won(x.m)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--muted)' }}><div style={{ display: 'flex', alignItems: 'flex-end', width: '100%', height: 125 }}><div style={{ width: '100%', height: `${Math.abs(x.m) / mxD * 100}%`, background: x.m < 0 ? 'var(--bad)' : '#3D5AFE', borderRadius: '3px 3px 0 0' }} /></div>{Number(x.d.slice(8))}</div>)}{days.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>데이터 없음</div>}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>합계 {won(days.reduce((a, x) => a + x.m, 0))} · 일평균 {won(days.length ? days.reduce((a, x) => a + x.m, 0) / days.length : 0)}</div></div>
            <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>최근 6개월 팀별 마진</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150 }}>{months.map(mo => <div key={mo} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--muted)' }}><div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, width: '100%', height: 125 }}>{teamsShown.map((t, i) => { const v = byTM(t.id, mo); return <div key={t.id} title={`${t.name} ${won(v)}`} style={{ flex: 1, height: `${Math.abs(v) / mxM * 100}%`, background: v < 0 ? 'var(--bad)' : colors[i % colors.length], borderRadius: '3px 3px 0 0' }} />; })}</div>{Number(String(mo).slice(5, 7))}월</div>)}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 11.5, color: 'var(--muted)' }}>{teamsShown.map((t, i) => <span key={t.id}><span style={{ display: 'inline-block', width: 9, height: 9, background: colors[i % colors.length], borderRadius: 2, marginRight: 4 }} />{t.name}</span>)}</div></div>
          </div>
        </>; })()}
      <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>인원별 상세 표</summary>
      <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ fontSize: 13 }}>
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
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>마진·목표·계획·진급·인센티브는 {bizLabel(bm)} 기준. 지각·결근은 진급 판정 기준(지각 이달, 결근 올해). 팀장 행의 마진은 팀 합계.</div></details>
    </div>
  );
}
