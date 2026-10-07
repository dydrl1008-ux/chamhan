import Link from 'next/link';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, won, man, weekStartOf, addDays, fmtMD, fmtKST } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, bizLabel, prevBizMonth } from '@/lib/date/period';
import { evaluatePeople, type PersonEval } from '@/lib/eval';
import { PageHeader, Stat, Section, Cell, Money, Status, Empty } from '@/components/ui';
export const dynamic = 'force-dynamic';

const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
const leaveName: Record<string, string> = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', monthly: '월차', sick: '병가', absent: '무단결근', late: '지각' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 (${DOW[new Date(d + 'T00:00:00Z').getUTCDay()]})`;
const Bar = ({ p }: { p: number }) => <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, p))}%`, background: p >= 100 ? 'var(--ok)' : p >= 70 ? 'var(--wait)' : p > 0 && p < 40 ? 'var(--bad)' : undefined }} /></div>;
const Row = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--line-soft)', fontSize: 14, flexWrap: 'wrap' }}>{children}</div>;
/** 처리할 것 카드: 건수 0 이면 회색, 있으면 빨강/주황 */
const Todo = ({ label, n, unit = '건', desc, href, tone = 'bad' }: { label: string; n: number | string; unit?: string; desc?: React.ReactNode; href: string; tone?: 'bad' | 'wait' }) => {
  const zero = n === 0 || n === '0'; const c = zero ? '#A1A8BD' : tone === 'bad' ? 'var(--bad)' : 'var(--wait)'; const ink = zero ? 'var(--muted)' : tone === 'bad' ? 'var(--bad-ink)' : 'var(--wait-ink)';
  return <Link href={href} className="card" style={{ textDecoration: 'none', color: 'inherit', padding: '14px 16px', borderLeft: `4px solid ${c}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{label}</span><span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{n}{typeof n === 'number' ? <span style={{ fontSize: 15 }}>{unit}</span> : null}</span>{desc && <span className="cell-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</span>}</Link>;
};

export default async function Home() {
  const p = (await getProfile())!; const sb = supabaseServer(); const today = todayKST(); const bm = bizMonthOf(today); const [ms] = bizMonthRange(bm); const ws = weekStartOf(today);
  const [{ data: issue }, { data: reads }, { data: promos }] = await Promise.all([
    sb.from('issues').select('id,title,body,issue_date').eq('is_active', true).order('issue_date', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
    sb.from('issue_reads').select('issue_id').eq('user_id', p.id),
    sb.from('promotions').select('title,body,starts_at,ends_at').eq('is_active', true).or(`ends_at.is.null,ends_at.gte.${today}`).order('sort_order').limit(1),
  ]);
  const unread = !!(issue && !reads?.some(x => x.issue_id === issue.id));
  const notices = (issue || (promos ?? []).length > 0) && (
    <Section title="공지 · 이슈" right={<Link href="/issues" className="help">모두 보기 →</Link>}>
      <div style={{ display: 'grid', gap: 8 }}>
        {issue && <div className={'note ' + (unread ? 'warn' : 'info')}><Status kind={unread ? 'wait' : 'off'}>{unread ? '미확인' : '확인'}</Status><div><div style={{ fontWeight: 700 }}>{issue.title} <span className="cell-sub" style={{ display: 'inline' }}>· {fmtMD(issue.issue_date)}</span></div><div className="cell-sub" style={{ fontSize: 14, color: 'var(--ink)' }}>{issue.body}</div></div></div>}
        {(promos ?? []).map((x, i) => <div key={i} className="note info"><span className="tag" style={{ background: 'var(--accent)' }}>프로모션</span><div><div style={{ fontWeight: 700 }}>{x.title} <span className="cell-sub" style={{ display: 'inline' }}>{x.starts_at ? `· ${fmtMD(x.starts_at)} ~ ${x.ends_at ? fmtMD(x.ends_at) : ''}` : ''}</span></div>{x.body && <div className="cell-sub" style={{ fontSize: 14, color: 'var(--ink)' }}>{x.body}</div>}</div></div>)}
      </div>
    </Section>);

  // =============== 직원 · 관리팀(개인 영역) 공통 데이터 ===============
  if (p.role === 'staff') {
    const [{ people }, { data: att }, { data: kpi }, { data: tgt }, { data: pend }, { data: plans }, { data: dir }] = await Promise.all([
      evaluatePeople(today, p.id),
      sb.from('attendance').select('check_in,check_out,is_late').eq('user_id', p.id).eq('work_date', today).maybeSingle(),
      sb.from('kpi_daily').select('margin,margin_auto,margin_manual,margin_pending').eq('user_id', p.id).eq('work_date', today).maybeSingle(),
      sb.from('monthly_targets').select('margin').eq('user_id', p.id).eq('month', bm + '-01').maybeSingle(),
      sb.from('leave_requests').select('type,start_date,status,team_approved_at').eq('user_id', p.id).eq('status', 'pending'),
      sb.from('plans').select('id,title,is_done').eq('user_id', p.id).eq('is_active', true).eq('type', 'daily').lte('start_date', today).gte('end_date', today),
      sb.rpc('my_directives', { p_limit: 1 }),
    ]);
    const me = people[0]; const tg = Number(tgt?.margin ?? 0); const mm = me?.monthMargin ?? 0; const d = (dir as any[])?.[0];
    const todo = [!att?.check_in && ['출근 기록', '/attendance'], !kpi && ['오늘 KPI 보고', '/kpi'], unread && ['금일 이슈 확인', '/issues']].filter(Boolean) as [string, string][];
    const myCards = (
      <div className="grid4">
        <Stat label="오늘 출근" value={att?.check_in ? att.check_in.slice(0, 5) : '미체크'} tone={att?.check_in ? (att.is_late ? 'wait' : 'ok') : 'bad'} desc={att?.check_in ? (att.is_late ? '지각' : '정상') + (att.check_out ? ` · 퇴근 ${att.check_out.slice(0, 5)}` : '') : '자리에 앉으면 기록'} href="/attendance" />
        <Stat label="오늘 KPI" value={kpi ? won(kpi.margin) : '미제출'} tone={kpi ? undefined : 'bad'} pending={kpi?.margin_pending ? won(kpi.margin_pending) : undefined} desc={kpi ? `정산 ${won(kpi.margin_auto)} + 추가 ${won(kpi.margin_manual)}` : '퇴근 전 제출'} href="/kpi" />
        <Stat label={`${bizLabel(bm)} 누계 마진`} value={won(mm)} tone={mm < 0 ? 'bad' : undefined} pending={me?.monthPending ? won(me.monthPending) : undefined} pct={tg ? pct(mm, tg) : undefined} desc={tg ? `목표 ${man(tg)} · ${pct(mm, tg)}%` : '목표 미배정'} href="/margin" />
        <Stat label="예상 인센티브" value={won(me?.inc.total ?? 0)} desc={me?.inc.tier ? `${me.inc.scope} · ${me.inc.tier.label}${me.inc.next ? ` · 다음 구간까지 ${man(Number(me.inc.next.min_margin) - mm)}` : ''}` : '기준 없음'} href="/me" />
      </div>);
    const myLists = (
      <div className="grid3">
        <Section title="오늘 계획" right={<Link href="/plans" className="help">캘린더 →</Link>}>
          {(plans ?? []).length ? (plans ?? []).map(x => <Row key={x.id}><Status kind={x.is_done ? 'ok' : 'off'}>{x.is_done ? '완료' : '예정'}</Status><span style={{ textDecoration: x.is_done ? 'line-through' : 'none', color: x.is_done ? 'var(--muted)' : 'inherit' }}>{x.title}</span></Row>) : <Empty>등록된 오늘 계획 없음</Empty>}
        </Section>
        <Section title="내 근태 신청" right={<Link href="/leave" className="help">근태 →</Link>}>
          {(pend ?? []).length ? (pend ?? []).map((x, i) => <Row key={i}><Status kind="wait">{x.team_approved_at ? '총괄 최종 대기' : '팀장 승인 대기'}</Status><span>{leaveName[x.type]} · {fmtMD(x.start_date)}</span></Row>) : <Empty>대기 중인 신청 없음</Empty>}
        </Section>
        <Section title="팀장 지시" right={<Link href="/me" className="help">전체 →</Link>}>
          {d ? <div style={{ fontSize: 14, display: 'grid', gap: 6 }}><div className="cell-sub">{fmtMD(d.week_start)} 주</div>{d.common_directive && <div><b>공통</b> {d.common_directive}</div>}{d.directive && <div><b>지시</b> {d.directive}</div>}{d.feedback && <div style={{ color: 'var(--muted)' }}><b>피드백</b> {d.feedback}</div>}</div> : <Empty>아직 없음</Empty>}
        </Section>
      </div>);

    // ---------- 관리팀 홈: 처리할 일 먼저, 내 개인 영역은 아래 ----------
    if (p.is_mgmt) {
      const [{ data: open }, { data: emplIds }, { data: maps }, { data: run }, { data: duties }, { data: profs }] = await Promise.all([
        sb.from('settlement_pending').select('item_key,settle_no,empl_name,cust_name,prod_name,req_gubun,amount,req_date,first_seen,refund_sale_total').is('resolved_at', null).is('dismissed_at', null).order('amount', { ascending: false }),
        sb.rpc('settlement_empl_ids'), sb.from('settlement_empl_map').select('empl_id,user_id,hidden'),
        sb.from('settlement_sync_runs').select('finished_at,ok,message,rows_fetched').order('id', { ascending: false }).limit(1).maybeSingle(),
        sb.from('mgmt_duties').select('id,title,cycle,systems,owner_id,backup_id').eq('is_active', true).order('sort_order'),
        sb.from('profiles').select('id,name,email,is_active'),
      ]);
      const rows = open ?? []; const sum = rows.reduce((a, x) => a + Number(x.amount), 0); const oldest = rows.length ? rows.reduce((a, x) => x.first_seen < a ? x.first_seen : a, rows[0].first_seen) : null;
      const active = (profs ?? []).filter(x => x.is_active);
      const unmapped = ((emplIds ?? []) as any[]).filter(e => !e.hidden && !(maps ?? []).some(m => m.empl_id === e.empl_id && m.user_id) && !active.some(u => String(u.email ?? '').split('@')[0] === e.empl_id));
      const myDuties = (duties ?? []).filter(x => x.owner_id === p.id || x.backup_id === p.id);
      return (
        <div className="page">
          <PageHeader title={`처리할 일 — ${dayLabel(today)}`} desc={`${p.name}님 · 관리팀 · ${bizLabel(bm)} 기준 · 정산 승인 → 고객 배정 → 정리 순서`} actions={<><Link href="/settle-customers" className="btn ghost">고객 등록 · 배정</Link><Link href="/pending" className="btn">승인 대기 {rows.length}건 처리 →</Link></>} />
          <div className="grid4">
            <Todo label="정산 승인 대기" n={rows.length} desc={rows.length ? `${won(sum)} · 가장 오래된 건 ${oldest ? fmtKST(oldest) : ''}` : '모두 처리됨'} href="/pending" />
            <Todo label="정산 담당자 미매핑" n={unmapped.length} unit="개" desc={unmapped.length ? unmapped.slice(0, 3).map(e => e.empl_id).join(' · ') : '전부 매핑됨'} href="/settlement" tone="wait" />
            <Todo label="내 담당업무" n={myDuties.length} desc={myDuties.length ? myDuties.slice(0, 3).map(x => x.title).join(' · ') : '배정된 담당업무 없음'} href="/admin/duties" tone="wait" />
            <Stat label="정산 동기화" value={run ? (run.ok ? '정상' : '실패') : '기록 없음'} tone={run ? (run.ok ? 'ok' : 'bad') : undefined} desc={run ? `${run.finished_at ? fmtKST(run.finished_at) : ''} · ${run.rows_fetched ?? 0}건` : '아직 동기화 전'} href="/settlement" />
          </div>
          <Section title="정산 승인 대기" sub="금액 큰 순 · 상위 8건" flush right={<Link href="/pending" className="help">전체 {rows.length}건 · 승인/반려 →</Link>}>
            {rows.length === 0 ? <Empty>승인 대기 건이 없습니다</Empty> : <div className="tbl-wrap"><table>
              <thead><tr><th>업체 · 상품</th><th>담당자</th><th>요청일</th><th>구분</th><th className="num">영업이익</th></tr></thead>
              <tbody>{rows.slice(0, 8).map(x => <tr key={x.item_key}><td><Cell main={x.cust_name} sub={`${x.prod_name ?? ''} · ${x.settle_no ?? ''}`} mono /></td><td>{x.empl_name}</td><td>{x.req_date ? fmtMD(x.req_date) : '-'}</td><td>{x.refund_sale_total != null ? <span className="tag">환불</span> : <span className="cell-sub">{x.req_gubun ?? '-'}</span>}</td><td><Money v={x.amount} big signed={x.refund_sale_total != null} /></td></tr>)}</tbody>
            </table></div>}
          </Section>
          {notices}
          <h2 style={{ marginTop: 4 }}>내 영역</h2>
          {myCards}
          {myLists}
        </div>);
    }

    // ---------- 직원 홈 ----------
    return (
      <div className="page">
        <PageHeader title={`${p.name}님, ${dayLabel(today)}`} desc={`${bizLabel(bm)} 기준`} actions={todo.length ? todo.map(([t, h]) => <Link key={h} href={h} className="btn ghost"><Status kind="bad">{t}</Status></Link>) : <span className="status ok">오늘 할 일 완료</span>} />
        {myCards}
        {myLists}
        {notices}
      </div>);
  }

  // =============== 팀장 / 총괄 / 어드민 ===============
  const isMgr = p.role === 'manager';
  const [{ people, teams }, { data: att }, { data: kpiT }, { data: lvToday }, { data: pend }, { data: targets }, { data: wr }, { data: prv }, { data: open }, { data: run }, { data: emplIds }, { data: maps }, { data: profs }] = await Promise.all([
    evaluatePeople(today),
    sb.from('attendance').select('user_id,check_in,is_late').eq('work_date', today),
    sb.from('kpi_daily').select('user_id,margin,margin_pending').eq('work_date', today),
    sb.from('leave_requests').select('user_id,type').eq('status', 'approved').lte('start_date', today).gte('end_date', today),
    sb.from('leave_requests').select('user_id,type,team_approved_at,start_date').eq('status', 'pending'),
    sb.from('monthly_targets').select('user_id,margin').eq('month', bm + '-01'),
    sb.from('weekly_reports').select('team_id,status').eq('week_start', ws),
    (() => { const [pms, pme] = bizMonthRange(prevBizMonth(bm)); return sb.from('kpi_daily').select('user_id,work_date,margin').gte('work_date', pms).lte('work_date', pme).limit(5000); })(),
    isMgr ? Promise.resolve({ data: [] as any[] }) : sb.from('settlement_pending').select('item_key,amount,first_seen').is('resolved_at', null).is('dismissed_at', null),
    isMgr ? Promise.resolve({ data: null as any }) : sb.from('settlement_sync_runs').select('finished_at,ok,rows_fetched').order('id', { ascending: false }).limit(1).maybeSingle(),
    isMgr ? Promise.resolve({ data: [] as any[] }) : sb.rpc('settlement_empl_ids'),
    isMgr ? Promise.resolve({ data: [] as any[] }) : sb.from('settlement_empl_map').select('empl_id,user_id,hidden'),
    isMgr ? Promise.resolve({ data: [] as any[] }) : sb.from('profiles').select('id,email,is_active'),
  ]);
  const rows = people.filter(x => !isMgr || x.team_id === p.team_id); const staff = rows.filter(x => x.role === 'staff'); const ids = staff.map(x => x.id);
  const sumM = (arr: { margin: number; user_id: string }[]) => arr.filter(x => ids.includes(x.user_id)).reduce((a, x) => a + Number(x.margin), 0);
  const mm = staff.reduce((a, x) => a + x.monthMargin, 0); const mp = staff.reduce((a, x) => a + x.monthPending, 0); const tg = ids.reduce((a, id) => a + Number(targets?.find(t => t.user_id === id)?.margin ?? 0), 0);
  const dayIdx = Math.round((new Date(today + 'T00:00:00Z').getTime() - new Date(ms + 'T00:00:00Z').getTime()) / 864e5); const [pms] = bizMonthRange(prevBizMonth(bm)); const pSame = addDays(pms, dayIdx);
  const prvSame = sumM((prv ?? []).filter(x => x.work_date <= pSame)); const diff = mm - prvSame; const diffPct = prvSame ? Math.round(diff / Math.abs(prvSame) * 100) : null;
  const pendMine = (pend ?? []).filter(x => rows.some(y => y.id === x.user_id)).filter(x => isMgr ? (!x.team_approved_at && !['late', 'absent'].includes(x.type)) : (x.team_approved_at || ['late', 'absent'].includes(x.type)));
  const nm = (id: string) => rows.find(x => x.id === id)?.name ?? '';
  const noAtt = rows.filter(x => !att?.some(a => a.user_id === x.id) && !lvToday?.some(l => l.user_id === x.id)); const noKpi = staff.filter(x => !kpiT?.some(k => k.user_id === x.id));
  const tn = (id: number | null) => teams.find(t => t.id === id)?.name ?? '-';
  const teamsShown = teams.filter(t => rows.some(x => x.team_id === t.id));
  const wrMissing = teamsShown.filter(t => wr?.find(x => x.team_id === t.id)?.status !== 'submitted');
  const tgOf = (id: string) => Number(targets?.find(t => t.user_id === id)?.margin ?? 0);
  const todayM = (id: string) => Number(kpiT?.find(k => k.user_id === id)?.margin ?? 0);
  const attOf = (x: PersonEval) => { const l = lvToday?.find(y => y.user_id === x.id); const a = att?.find(y => y.user_id === x.id); return l ? <Status kind="off">{leaveName[l.type] ?? '휴가'}</Status> : a ? <Status kind={a.is_late ? 'wait' : 'ok'}>{a.check_in?.slice(0, 5)}{a.is_late ? ' 지각' : ''}</Status> : <Status kind="bad">미출근</Status>; };
  const kpiOf = (x: PersonEval) => kpiT?.some(k => k.user_id === x.id) ? <Status kind="ok">제출</Status> : <Status kind="bad">미제출</Status>;
  const risk = staff.map(x => { const t = tgOf(x.id); const r = t ? pct(x.monthMargin, t) : null; const items: { kind: 'ok' | 'wait' | 'bad'; text: string }[] = [];
    if (x.promo?.ok) items.push({ kind: 'ok', text: `진급 기준 도달 (${x.promo.c.from_position} → ${x.promo.c.to_position})` });
    if (r != null && dayIdx >= 10 && r < 40) items.push({ kind: 'bad', text: `목표 ${r}% — 이달 ${dayIdx + 1}일째` });
    if (!x.consecutiveOk && x.promo) items.push({ kind: 'wait', text: '직전 개월 마진 기준 미달 (연속 조건)' });
    if (x.absent >= 1) items.push({ kind: 'bad', text: `무단결근 ${x.absent}회` }); else if (x.late >= 3) items.push({ kind: 'wait', text: `지각 ${x.late}회` });
    return items.map(i => ({ ...i, name: x.name, team: tn(x.team_id) })); }).flat().sort((a, b) => (a.kind === 'bad' ? 0 : a.kind === 'wait' ? 1 : 2) - (b.kind === 'bad' ? 0 : b.kind === 'wait' ? 1 : 2)).slice(0, 8);
  const openRows = open ?? []; const openSum = openRows.reduce((a, x) => a + Number(x.amount), 0);
  const active = (profs ?? []).filter((x: any) => x.is_active);
  const unmapped = ((emplIds ?? []) as any[]).filter(e => !e.hidden && !(maps ?? []).some((m: any) => m.empl_id === e.empl_id && m.user_id) && !active.some((u: any) => String(u.email ?? '').split('@')[0] === e.empl_id));

  // ---------- 팀장 홈 ----------
  if (isMgr) {
    const w = wr?.find(x => x.team_id === p.team_id);
    return (
      <div className="page">
        <PageHeader title={`${tn(p.team_id)} — ${dayLabel(today)}`} desc={`팀원 ${staff.length}명 · ${bizLabel(bm)} 기준 · 주간보고 ${w?.status === 'submitted' ? '제출 완료' : w ? '작성 중' : '미작성'}`} actions={<><Link href="/kpi" className="btn ghost">내 KPI 제출</Link><Link href="/weekly" className="btn">주간보고 {w?.status === 'submitted' ? '보기' : '작성'} →</Link></>} />
        <div className="grid4">
          <Stat label="팀 누계 마진" value={won(mm)} tone={mm < 0 ? 'bad' : undefined} pending={mp ? won(mp) : undefined} pct={tg ? pct(mm, tg) : undefined} desc={tg ? `목표 ${man(tg)} · ${pct(mm, tg)}% · 전월 같은 시점 대비 ${diff >= 0 ? '+' : '−'}${man(Math.abs(diff))}` : '목표 미배정'} href="/margin" />
          <Todo label="근태 승인 대기 (팀장)" n={pendMine.length} desc={pendMine.length ? pendMine.slice(0, 3).map(x => `${nm(x.user_id)} ${leaveName[x.type]} ${fmtMD(x.start_date)}`).join(' · ') : '없음'} href="/leave" tone="wait" />
          <Todo label="오늘 미출근" n={noAtt.length} unit="명" desc={noAtt.length ? noAtt.map(x => x.name).join(' · ') : '전원 출근'} href="/attendance" />
          <Todo label="오늘 KPI 미제출" n={noKpi.length} unit="명" desc={noKpi.length ? noKpi.map(x => x.name).join(' · ') : '전원 제출'} href="/kpi" />
        </div>
        <Section title="팀원별 오늘 · 이달" sub="출근 · KPI · 오늘 마진 · 누계 · 목표를 한 줄에" flush right={<Link href="/overview" className="help">직원 현황 →</Link>}>
          <div className="tbl-wrap"><table>
            <thead><tr><th>팀원</th><th>출근</th><th>오늘 KPI</th><th className="num">오늘 마진</th><th className="num">이달 누계</th><th style={{ width: '26%' }}>목표 달성</th><th className="num">예상 인센</th></tr></thead>
            <tbody>
              {staff.map(x => { const t = tgOf(x.id); return <tr key={x.id}><td><Cell main={x.name} sub={x.position ?? ''} /></td><td>{attOf(x)}</td><td>{kpiOf(x)}</td><td><Money v={todayM(x.id)} dash /></td><td><Money v={x.monthMargin} big sub={x.monthPending ? <span style={{ color: 'var(--wait-ink)' }}>대기 {won(x.monthPending)}</span> : undefined} /></td><td>{t ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><Bar p={pct(x.monthMargin, t)} /></div><span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{pct(x.monthMargin, t)}%</span></div> : <span className="cell-sub">목표 없음</span>}</td><td><Money v={x.inc.total} /></td></tr>; })}
              <tr className="total"><td colSpan={3}>팀 합계 <span className="cell-sub" style={{ display: 'inline', fontWeight: 500 }}>출근 {rows.length - noAtt.length}/{rows.length} · KPI {staff.length - noKpi.length}/{staff.length}</span></td><td><Money v={staff.reduce((a, x) => a + todayM(x.id), 0)} /></td><td><Money v={mm} big /></td><td>{tg ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><Bar p={pct(mm, tg)} /></div><span style={{ fontSize: 13, minWidth: 36, textAlign: 'right' }}>{pct(mm, tg)}%</span></div> : null}</td><td><Money v={staff.reduce((a, x) => a + x.inc.total, 0)} /></td></tr>
            </tbody>
          </table></div>
        </Section>
        {notices}
      </div>);
  }

  // ---------- 대표 · 총괄 홈 ----------
  const oldest = openRows.length ? openRows.reduce((a, x) => x.first_seen < a ? x.first_seen : a, openRows[0].first_seen) : null;
  return (
    <div className="page">
      <PageHeader title={`오늘 — ${dayLabel(today)}`} desc={`${p.name}님 · 전사 ${rows.length}명 · ${bizLabel(bm)} 기준 · 처리할 것 → 숫자 → 팀 → 사람 순`} actions={<><Link href="/overview" className="btn ghost">직원 현황</Link><Link href="/pending" className="btn">정산 승인 대기 {openRows.length}건 →</Link></>} />
      <div className="grid4">
        <Todo label="정산 승인 대기" n={openRows.length} desc={openRows.length ? `${won(openSum)} · 가장 오래된 건 ${oldest ? fmtKST(oldest) : ''}` : '모두 처리됨'} href="/pending" />
        <Todo label="근태 최종 승인 대기" n={pendMine.length} desc={pendMine.length ? pendMine.slice(0, 3).map(x => `${nm(x.user_id)} ${leaveName[x.type]}`).join(' · ') : '없음'} href="/leave" tone="wait" />
        <Todo label="오늘 KPI 미제출" n={noKpi.length} unit="명" desc={noKpi.length ? noKpi.map(x => x.name).join(' · ') : '전원 제출'} href="/kpi" tone="wait" />
        <Todo label="주간보고 미제출 (이번 주)" n={wrMissing.length} unit="팀" desc={wrMissing.length ? wrMissing.map(t => t.name).join(' · ') : '전 팀 제출'} href="/weekly" tone="wait" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16 }}>
        <Section title={`${bizLabel(bm)} 마진`} sub="확정 기준 · 대기분은 주황" right={<Link href="/margin" className="help">영업 마진 →</Link>}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <div><div className="cell-sub" style={{ fontWeight: 600 }}>전사 누계</div><div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -.5, lineHeight: 1.15 }} className="num">{won(mm)}</div><div className="cell-sub">{mp ? <span style={{ color: 'var(--wait-ink)', fontWeight: 600 }}>대기 +{won(mp)}</span> : null}{mp ? ' · ' : ''}전월 같은 시점({fmtMD(pSame)}) 대비 <b style={{ color: diff >= 0 ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>{diff >= 0 ? '+' : '−'}{man(Math.abs(diff))}{diffPct != null ? ` (${diffPct >= 0 ? '+' : ''}${diffPct}%)` : ''}</b></div></div>
            <div style={{ flex: 1, minWidth: 200 }}>{tg ? <><div style={{ display: 'flex', justifyContent: 'space-between' }} className="cell-sub"><span>목표 {man(tg)}</span><span><b style={{ color: 'var(--ink)' }}>{pct(mm, tg)}%</b> · 이달 {dayIdx + 1}일째</span></div><Bar p={pct(mm, tg)} /></> : <span className="cell-sub">월 목표 미배정 — 설정 › 월 목표 마진</span>}</div>
          </div>
          <div className="tbl-wrap"><table>
            <thead><tr><th>팀</th><th className="num">누계</th><th style={{ width: '34%' }}>목표 달성</th><th className="num">대기</th><th>주간보고</th></tr></thead>
            <tbody>{teamsShown.map(t => { const tm = staff.filter(x => x.team_id === t.id); const m = tm.reduce((a, x) => a + x.monthMargin, 0); const pd = tm.reduce((a, x) => a + x.monthPending, 0); const tt = tm.reduce((a, x) => a + tgOf(x.id), 0); const w = wr?.find(x => x.team_id === t.id); const lead = rows.find(x => x.team_id === t.id && x.role === 'manager');
              return <tr key={t.id}><td><Cell main={t.name} sub={`${lead?.name ?? '팀장 없음'} · ${tm.length}명`} /></td><td><Money v={m} big /></td><td>{tt ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><Bar p={pct(m, tt)} /></div><span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{pct(m, tt)}%</span></div> : <span className="cell-sub">목표 없음</span>}</td><td>{pd ? <div style={{ textAlign: 'right', color: 'var(--wait-ink)' }} className="num">{won(pd)}</div> : <div style={{ textAlign: 'right', color: 'var(--line)' }}>·</div>}</td><td>{w?.status === 'submitted' ? <Status kind="ok">제출</Status> : w ? <Status kind="wait">작성 중</Status> : <Status kind="bad">미작성</Status>}</td></tr>; })}</tbody>
          </table></div>
        </Section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section title="오늘 출근" sub={`${rows.length - noAtt.length} / ${rows.length}`} right={<Link href="/attendance" className="help">출퇴근 →</Link>}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {noAtt.length > 0 && <span className="status bad" style={{ background: 'var(--bad-soft)', borderRadius: 8, padding: '5px 10px' }}>미출근 {noAtt.length} · {noAtt.map(x => x.name).join(' · ')}</span>}
              {(att ?? []).filter(a => a.is_late && rows.some(x => x.id === a.user_id)).map(a => <span key={a.user_id} className="status wait" style={{ background: 'var(--wait-soft)', borderRadius: 8, padding: '5px 10px' }}>지각 · {nm(a.user_id)} {a.check_in?.slice(0, 5)}</span>)}
              {(lvToday ?? []).filter(l => rows.some(x => x.id === l.user_id)).map(l => <span key={l.user_id} className="status off" style={{ background: '#EEF1F7', borderRadius: 8, padding: '5px 10px' }}>{leaveName[l.type] ?? '휴가'} · {nm(l.user_id)}</span>)}
              {noAtt.length === 0 && !(att ?? []).some(a => a.is_late) && <span className="status ok">전원 정상 출근</span>}
            </div>
          </Section>
          <Section title="이번 달 눈여겨볼 사람" sub="목표 · 진급 · 근태 기준" right={<Link href="/overview" className="help">직원 현황 →</Link>}>
            {risk.length ? risk.map((r, i) => <Row key={i}><Status kind={r.kind}>{r.name}</Status><span className="cell-sub" style={{ marginTop: 0 }}>{r.team}</span><span>{r.text}</span></Row>) : <Empty>특이사항 없음</Empty>}
          </Section>
          <Section title="시스템" right={<Link href="/settlement" className="help">정산 연동 →</Link>}>
            <Row><Status kind={run ? (run.ok ? 'ok' : 'bad') : 'off'}>정산 동기화</Status><span className="cell-sub" style={{ marginTop: 0 }}>{run ? `${run.finished_at ? fmtKST(run.finished_at) : ''} · ${run.rows_fetched ?? 0}건${run.ok ? '' : ' · 실패'}` : '기록 없음'}</span></Row>
            <Row><Status kind={unmapped.length ? 'wait' : 'ok'}>정산 담당자 매핑</Status><span className="cell-sub" style={{ marginTop: 0 }}>{unmapped.length ? `미매핑 ${unmapped.length}개 · ${unmapped.slice(0, 3).map((e: any) => e.empl_id).join(' · ')}` : '전부 매핑됨'}</span></Row>
            <Row><Status kind={openRows.length ? 'wait' : 'ok'}>승인 대기 감시</Status><span className="cell-sub" style={{ marginTop: 0 }}>{openRows.length ? `대기 ${openRows.length}건` : '대기 없음'} · 2분마다 자동 확인</span></Row>
          </Section>
        </div>
      </div>
      {notices}
    </div>);
}
