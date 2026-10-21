import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, weekStartOf, addDays, won, man } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, bizLabel, prevBizMonth, nextBizMonth } from '@/lib/date/period';
import { evaluatePeople } from '@/lib/eval';
import { peopleStatus } from '@/lib/peopleStatus';
import { PageHeader, Stat, Section, Cell, Money, Status, Empty } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function OverviewPage({ searchParams }: { searchParams: { team?: string; m?: string } }) {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.role === 'manager')) redirect('/');
  const sb = supabaseServer(); const today = todayKST(); const curBm = bizMonthOf(today); const bm = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') && searchParams.m! <= curBm ? searchParams.m! : curBm; const isCur = bm === curBm; const [ms, meD] = bizMonthRange(bm); const asOf = isCur ? today : meD;
  const teamFilter = me.role === 'manager' ? (me.team_id ?? 0) : Number(searchParams.team) || 0;
  const [{ people, teams }, { data: att }, { data: kpiToday }, { data: leavesPending }, { data: leavesToday }, { data: targets }, { data: wr }, { data: pipe }, { data: plans }, { data: kpiMonth }] = await Promise.all([
    evaluatePeople(asOf),
    sb.from('attendance').select('user_id,check_in,check_out,is_late').eq('work_date', today),
    sb.from('kpi_daily').select('user_id,margin').eq('work_date', today),
    sb.from('leave_requests').select('user_id,type,team_approved_at').eq('status', 'pending'),
    sb.from('leave_requests').select('user_id,type').eq('status', 'approved').lte('start_date', today).gte('end_date', today),
    sb.from('monthly_targets').select('user_id,margin').eq('month', bm + '-01'),
    Promise.resolve({ data: [] as { team_id: number | null; week_start: string; status: string }[] }),
    sb.from('pipeline').select('owner_id,stage').eq('is_active', true),
    sb.from('v_plan_rate').select('user_id,type,total,done').eq('month', bm + '-01'),
    sb.from('v_margin_monthly').select('user_id,days,calls,new_cnt').eq('month', bm + '-01'),
  ]);
  const sixStart = (() => { const y = Number(bm.slice(0, 4)), m = Number(bm.slice(5, 7)); const d = new Date(Date.UTC(y, m - 6, 1)); return d.toISOString().slice(0, 10); })();
  const pbm = prevBizMonth(bm); const [pms, pme] = bizMonthRange(pbm);
  const dayIdx = Math.round((new Date(asOf + 'T00:00:00Z').getTime() - new Date(ms + 'T00:00:00Z').getTime()) / 864e5);   // 이달 경과 일수(0부터) — 지난달은 마감일 기준
  const pSame = addDays(pms, dayIdx) > pme ? pme : addDays(pms, dayIdx);                                                   // 지난달 같은 시점
  const totalDays = Math.round((new Date(meD + 'T00:00:00Z').getTime() - new Date(ms + 'T00:00:00Z').getTime()) / 864e5) + 1;
  const [{ data: daily }, { data: sixM }, { data: prevDaily }] = await Promise.all([
    sb.from('kpi_daily').select('user_id,team_id,work_date,margin').gte('work_date', ms).lte('work_date', meD).limit(5000),
    sb.from('v_margin_monthly').select('team_id,month,margin').gte('month', sixStart),
    sb.from('kpi_daily').select('user_id,team_id,work_date,margin').gte('work_date', pms).lte('work_date', pme).limit(5000),
  ]);
  const leaveName: Record<string, string> = { annual: '연차', half_am: '반차', half_pm: '반차', monthly: '월차', sick: '병가', absent: '결근', late: '지각' };
  const st = await peopleStatus({ teamId: teamFilter || undefined, month: bm });
  const rows = people.filter(p => !teamFilter || p.team_id === teamFilter);
  const tn = (id: number | null) => teams.find(t => t.id === id)?.name ?? '-';
  const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
  const csvHref = `/overview/export?${[teamFilter ? `team=${teamFilter}` : '', isCur ? '' : `m=${bm}`].filter(Boolean).join('&')}`;
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <PageHeader title="직원 현황" desc={`${isCur ? today : `${bizLabel(bm)} 마감 기준`} · ${bizLabel(bm)} · ${me.role === 'manager' ? '우리 팀' : teamFilter ? tn(teamFilter) : '전사'} ${st.rows.length}명 — ${isCur ? '근태·KPI·목표·계획·보고·진급을 한 줄로' : '지난 달 실적 · 근태·KPI 오늘 열은 표시 안 함'}`}
        actions={<><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><a href={`/overview?m=${prevBizMonth(bm)}${teamFilter ? `&team=${teamFilter}` : ''}`} className="btn ghost">‹</a><b style={{ minWidth: 150, textAlign: 'center' }}>{bizLabel(bm)}</b>{!isCur && <a href={`/overview?m=${nextBizMonth(bm)}${teamFilter ? `&team=${teamFilter}` : ''}`} className="btn ghost">›</a>}{!isCur && <a href={`/overview${teamFilter ? `?team=${teamFilter}` : ''}`} className="btn ghost">이번 달</a>}</div>{me.role !== 'manager' && <div style={{ display: 'flex', gap: 4 }}><a href={`/overview${isCur ? '' : `?m=${bm}`}`} className={'btn ghost' + (!teamFilter ? ' on' : '')} style={{ background: !teamFilter ? 'var(--accent-soft)' : undefined }}>전체</a>{teams.filter(t => people.some(p => p.team_id === t.id)).map(t => <a key={t.id} href={`/overview?team=${t.id}${isCur ? '' : `&m=${bm}`}`} className="btn ghost" style={{ background: teamFilter === t.id ? 'var(--accent-soft)' : undefined }}>{t.name}</a>)}</div>}<a href={csvHref} className="btn ghost">현황 내보내기 (CSV)</a></>} />
      <div className="grid4">
        {isCur ? <><Stat label="오늘 출근" value={`${st.sums.att}/${st.sums.all}명`} desc={st.sums.all - st.sums.att ? `미체크 ${st.rows.filter(p => p.att.kind === 'none').map(p => p.name).join(', ')}` : '전원 체크'} tone={st.sums.att < st.sums.all ? 'wait' : 'ok'} />
        <Stat label="오늘 KPI 제출" value={`${st.sums.kpi}/${st.sums.staff}명`} desc={st.sums.staff - st.sums.kpi ? `미제출 ${st.rows.filter(p => p.role === 'staff' && !p.kpi.submitted).map(p => p.name).join(', ')}` : '전원 제출'} tone={st.sums.kpi < st.sums.staff ? 'wait' : 'ok'} /></>
        : <><Stat label="KPI 입력일 합" value={`${st.rows.reduce((a, p) => a + p.kpi.days, 0)}일`} desc={`직원 ${st.sums.staff}명 · 1인 평균 ${st.sums.staff ? Math.round(st.rows.reduce((a, p) => a + p.kpi.days, 0) / st.sums.staff) : 0}일`} />
        <Stat label="콜 · 신규 합" value={st.rows.reduce((a, p) => a + p.kpi.calls, 0).toLocaleString()} desc={`신규 ${st.rows.reduce((a, p) => a + p.kpi.newCnt, 0)}건`} /></>}
        <Stat label={`${Number(bm.slice(5))}월 마진`} value={won(st.sums.margin)} pending={st.sums.pending ? won(st.sums.pending) : undefined} desc={`예상 인센티브 합 ${won(st.sums.inc)}`} />
        <Stat label="목표 달성" value={st.sums.target ? pct(st.sums.margin, st.sums.target) + '%' : '목표 없음'} pct={st.sums.target ? pct(st.sums.margin, st.sums.target) : undefined} desc={st.sums.target ? `목표 ${man(st.sums.target)} · 진급 기준 도달 ${st.sums.promo}명` : `진급 기준 도달 ${st.sums.promo}명`} />
      </div>
      <Section title="인원별 업무 현황" sub={me.role === 'manager' ? '우리 팀' : undefined} flush right={<span className="cell-sub">이름을 누르면 직원 상세</span>}>
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>직원</th>{isCur ? <><th>근태</th><th>KPI</th></> : <th>KPI 입력 · 콜 · 신규</th>}<th style={{ textAlign: 'right' }}>{Number(bm.slice(5))}월 마진</th><th>목표</th><th>계획</th><th>보고 · 가망</th><th>진급</th><th style={{ textAlign: 'right' }}>예상 인센</th></tr></thead>
          <tbody>{st.rows.map(p => <tr key={p.id}>
            <td><a href={`/employees/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}><Cell main={p.name} sub={`${p.teamName} · ${p.position ?? '-'}`} /></a></td>
            {isCur ? <><td>{p.att.kind === 'leave' ? <Status kind="off">{p.att.text}</Status> : p.att.kind === 'in' ? <Status kind={p.att.late ? 'wait' : 'ok'}>{p.att.late ? '지각 ' : '근무중 '}{p.att.text}{p.att.out ? ' → ' + p.att.out : ''}</Status> : <Status kind="bad">미체크</Status>}
              {(p.pendingLeaves > 0 || p.late > 0 || p.absent > 0) && <div className="cell-sub">{p.pendingLeaves ? `근태 승인 대기 ${p.pendingLeaves} · ` : ''}<span style={{ color: p.late > 0 || p.absent > 0 ? 'var(--bad-ink)' : undefined }}>지각 {p.late} · 결근 {p.absent}</span></div>}</td>
            <td>{p.role === 'manager' ? <span className="cell-sub">-</span> : p.kpi.submitted ? <Cell main={<Status kind="ok">제출 · {won(p.kpi.margin)}</Status>} sub={p.kpi.days ? `콜 ${p.kpi.calls.toLocaleString()} · 신규 ${p.kpi.newCnt} · ${p.kpi.days}일 입력` : ''} /> : <Cell main={<Status kind="bad">미제출</Status>} sub={p.kpi.days ? `콜 ${p.kpi.calls.toLocaleString()} · 신규 ${p.kpi.newCnt} · ${p.kpi.days}일 입력` : ''} />}</td></> : <td>{p.kpi.days ? <Cell main={`${p.kpi.days}일 입력`} sub={`콜 ${p.kpi.calls.toLocaleString()} · 신규 ${p.kpi.newCnt}`} /> : <span className="cell-sub">입력 없음</span>}</td>}
            <td><Money v={p.monthMargin} big sub={p.monthPending ? <span style={{ color: 'var(--wait-ink)' }}>대기 {won(p.monthPending)}</span> : p.role === 'manager' ? '팀 합계' : undefined} /></td>
            <td style={{ minWidth: 120 }}>{p.target ? <div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>{p.targetPct}%</b><span className="cell-sub" style={{ marginTop: 0 }}>{man(p.target)}</span></div><div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, p.targetPct ?? 0))}%`, background: (p.targetPct ?? 0) >= 100 ? 'var(--ok)' : (p.targetPct ?? 0) >= 70 ? 'var(--wait)' : undefined }} /></div></div> : <span className="cell-sub">미설정</span>}</td>
            <td>{p.plan ? <Cell main={`${p.plan.done}/${p.plan.total}`} sub={`${pct(p.plan.done, p.plan.total)}%`} /> : <span className="cell-sub">-</span>}</td>
            <td>{p.report ? <Cell main={<Status kind={p.report.cur === 'submitted' ? 'ok' : p.report.cur ? 'wait' : 'bad'}>{p.report.cur === 'submitted' ? '주간보고 제출' : p.report.cur === 'draft' ? '작성 중' : '미작성'}</Status>} sub={`지난주 ${p.report.last === 'submitted' ? '제출' : '미제출'}`} /> : p.pipe.total ? <Cell main={`가망 ${p.pipe.total}건`} sub={p.pipe.nego ? `협상 중 ${p.pipe.nego}` : ''} /> : <span className="cell-sub">-</span>}</td>
            <td>{p.promo ? <Status kind={p.promo.ok ? 'ok' : 'off'}>{p.promo.ok ? `승급 검토 → ${p.promo.c.to_position}` : `기준 ${p.promo.fails.length}개 미충족`}</Status> : <span className="cell-sub">기준 없음</span>}{p.promo && !p.promo.ok && <div className="cell-sub">{p.promo.fails.join(' · ')}</div>}</td>
            <td><Money v={p.inc.total} sub={p.inc.tier?.label} /></td>
          </tr>)}
          {st.rows.length === 0 && <tr><td colSpan={9}><Empty>인원 없음</Empty></td></tr>}</tbody></table></div>
        <div className="cell-sub" style={{ padding: '10px 22px' }}>마진·목표·계획·진급·인센티브는 {bizLabel(bm)} 기준 · 지각은 이달, 결근은 올해 누계 · 팀장 행의 마진은 팀 합계</div>
      </Section>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
            <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>팀별 목표 달성 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{bizLabel(bm)}</span></h3>
              {teamAgg.map((x, i) => { const r = x.tg ? x.m / x.tg : 0; return <div key={x.t.id} style={{ marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>{x.t.name}</b><span>{won(x.m)} <span style={{ color: 'var(--muted)' }}>/ {x.tg ? man(x.tg) : '목표 미설정'}</span> <b style={{ color: r >= 1 ? 'var(--ok)' : r >= .7 ? '#D97706' : 'var(--bad)' }}>{x.tg ? Math.round(r * 100) + '%' : ''}</b></span></div><div style={{ height: 12, background: 'var(--line)', borderRadius: 6, marginTop: 4 }}><div style={{ width: `${Math.min(100, Math.max(0, r * 100))}%`, height: '100%', background: colors[i % colors.length], borderRadius: 6 }} /></div></div>; })}
              {teamAgg.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>팀 없음</div>}</div>
          </div>
          <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>차트 더보기 <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 400 }}>개인 랭킹 · 일별 추이 · 최근 6개월 팀별</span></summary><div style={{ marginTop: 14 }}>
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
          </div></details>
        </>; })()}
    </div>
  );
}
