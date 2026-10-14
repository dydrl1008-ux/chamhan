// 직원 상세 — 사람 한 명을 한 화면에 (총괄·어드민: 전원, 팀장: 우리 팀, 본인: 자기 → 마이페이지)
import { redirect, notFound } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, won, man, fmtMD } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, bizLabel } from '@/lib/date/period';
import { peopleStatus } from '@/lib/peopleStatus';
import { PageHeader, Stat, Section, Cell, Money, Status, Empty } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function EmployeePage({ params }: { params: { id: string } }) {
  const me = await getProfile(); if (!me) redirect('/');
  if (me.id === params.id && me.role === 'staff') redirect('/me');
  if (!['admin', 'head', 'manager'].includes(me.role) && !me.is_mgmt) redirect('/');
  const st = await peopleStatus({ onlyUser: params.id }); const p = st.rows[0]; if (!p) notFound();
  if (me.role === 'manager' && p.team_id !== me.team_id) redirect('/overview');
  const sb = supabaseServer(); const today = st.today; const bm = st.bm; const [ms, meD] = bizMonthRange(bm); const year = Number(today.slice(0, 4));
  const [{ data: kpi }, { data: yl }, { data: ml }, { data: prof }, { data: notes }, { data: leaves }, { data: plans }] = await Promise.all([
    sb.from('kpi_daily').select('work_date,margin,calls,new_cnt,new_margin,work_report,feedback').eq('user_id', p.id).gte('work_date', ms).lte('work_date', meD).order('work_date', { ascending: false }),
    sb.from('v_leave_yearly').select('*').eq('user_id', p.id).eq('year', year).maybeSingle(),
    sb.from('v_leave_monthly').select('*').eq('user_id', p.id).eq('month', ms).maybeSingle(),
    sb.from('profiles').select('email,annual_leave_granted,hired_at').eq('id', p.id).maybeSingle(),
    sb.from('weekly_member_notes').select('directive,feedback,report_id,weekly_reports(week_start,status,common_directive)').eq('user_id', p.id).order('report_id', { ascending: false }).limit(6),
    sb.from('leave_requests').select('type,start_date,end_date,status').eq('user_id', p.id).gte('end_date', ms).order('start_date', { ascending: false }).limit(10),
    sb.from('plans').select('title,type,is_done,start_date,end_date').eq('user_id', p.id).eq('is_active', true).lte('start_date', meD).gte('end_date', ms).order('start_date', { ascending: false }).limit(12),
  ]);
  const granted = Number((prof as any)?.annual_leave_granted ?? 0), used = Number(yl?.annual_used ?? 0);
  const canEdit = me.role === 'admin' || me.role === 'head';
  const initial = p.name.slice(0, 1);
  const dirRows = (notes ?? []).map((n: any) => ({ week: n.weekly_reports?.week_start as string | undefined, status: n.weekly_reports?.status, common: n.weekly_reports?.common_directive, directive: n.directive, feedback: n.feedback })).filter(x => x.week);
  const leaveName: Record<string, string> = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', monthly: '월차', sick: '병가', absent: '무단결근', late: '지각' };
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <a href="/overview" className="help" style={{ fontSize: 13 }}>← 직원 현황</a>
      <PageHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}><span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{initial}</span>{p.name}</span>}
        desc={`${p.teamName} · ${p.position ?? '직급 미설정'} · ${p.role === 'manager' ? '팀장' : p.role === 'staff' ? '직원' : p.role}${p.hired_at ? ` · 입사 ${p.hired_at} (${p.tenure}개월)` : ''}${(prof as any)?.email ? ` · ${(prof as any).email}` : ''}`}
        actions={<>{canEdit && <a href="/users" className="btn ghost">정보 수정</a>}{(canEdit || me.is_mgmt) && <a href="/settle-customers" className="btn ghost">고객 배정</a>}<a href={`/leave?u=${p.id}`} className="btn ghost">근태 · 휴가</a></>} />
      <div className="grid4">
        <Stat label={`${bizLabel(bm)} ${p.role === 'manager' ? '팀' : ''} 마진`} value={won(p.monthMargin)} pending={p.monthPending ? won(p.monthPending) : undefined} desc={p.kpi.days ? `KPI ${p.kpi.days}일 입력 · 콜 ${p.kpi.calls.toLocaleString()} · 신규 ${p.kpi.newCnt}` : 'KPI 입력 없음'} />
        <Stat label="목표 달성" value={p.target ? `${p.targetPct}%` : '목표 없음'} pct={p.target ? p.targetPct ?? 0 : undefined} desc={p.target ? `목표 ${man(p.target)} · 남은 ${man(Math.max(0, p.target - p.monthMargin))}` : '월 목표를 배정하면 달성률이 표시됩니다'} />
        <Stat label="예상 인센티브" value={won(p.inc.total)} desc={p.inc.tier ? `${p.inc.scope} · ${p.inc.tier.label}${p.inc.next ? ` · 다음 구간까지 ${man(Number(p.inc.next.min_margin) - p.monthMargin)}` : ''}` : '기준 없음'} />
        <Stat label="진급" value={p.promo ? (p.promo.ok ? '승급 검토' : `${p.promo.fails.length}개 미충족`) : '기준 없음'} tone={p.promo ? (p.promo.ok ? 'ok' : 'wait') : undefined} desc={p.promo ? `${p.promo.c.from_position} → ${p.promo.c.to_position}${p.promo.ok ? '' : ' · ' + p.promo.fails.join(' · ')}` : `직급(${p.position ?? '미설정'}) 기준 없음`} />
      </div>
      <div className="grid3">
        <Section title="오늘 · 이달 근태">
          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">오늘</span>{p.att.kind === 'leave' ? <Status kind="off">{p.att.text}</Status> : p.att.kind === 'in' ? <Status kind={p.att.late ? 'wait' : 'ok'}>{p.att.late ? '지각 ' : '출근 '}{p.att.text}{p.att.out ? ' → ' + p.att.out : ''}</Status> : <Status kind="bad">미체크</Status>}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">이달 지각 · 병가</span><b style={{ color: Number(ml?.late_cnt ?? 0) ? 'var(--bad-ink)' : undefined }}>{Number(ml?.late_cnt ?? 0)}회 · {Number(ml?.sick_cnt ?? 0)}회</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">올해 결근 · 지각</span><b style={{ color: Number(yl?.absent_cnt ?? 0) ? 'var(--bad-ink)' : undefined }}>{Number(yl?.absent_cnt ?? 0)}회 · {Number(yl?.late_cnt ?? 0)}회</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">잔여 연차</span><b>{granted - used}일 <span className="cell-sub" style={{ display: 'inline' }}>(부여 {granted} · 사용 {used})</span></b></div>
            {p.pendingLeaves > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">근태 승인 대기</span><Status kind="wait">{p.pendingLeaves}건</Status></div>}
          </div>
          {(leaves ?? []).length > 0 && <div style={{ marginTop: 12 }}><div className="cell-sub" style={{ marginBottom: 4 }}>이달 근태 기록</div>{(leaves ?? []).map((l, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderTop: '1px solid var(--line)' }}><span>{leaveName[l.type] ?? l.type} <span className="cell-sub" style={{ display: 'inline' }}>{fmtMD(l.start_date)}{l.end_date !== l.start_date ? `~${fmtMD(l.end_date)}` : ''}</span></span><Status kind={l.status === 'approved' ? 'ok' : l.status === 'pending' ? 'wait' : 'off'}>{l.status === 'approved' ? '승인' : l.status === 'pending' ? '대기' : l.status}</Status></div>)}</div>}
        </Section>
        <Section title="계획" sub={bizLabel(bm)}>
          {p.plan ? <div style={{ marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><b>{p.plan.done}/{p.plan.total} 완료</b><span>{p.plan.total ? Math.round(p.plan.done / p.plan.total * 100) : 0}%</span></div><div className="bar"><i style={{ width: `${p.plan.total ? p.plan.done / p.plan.total * 100 : 0}%` }} /></div></div> : <Empty>이달 계획 없음</Empty>}
          {(plans ?? []).map((x, i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '4px 0', borderTop: '1px solid var(--line)' }}><Status kind={x.is_done ? 'ok' : 'off'}>{x.is_done ? '완료' : '예정'}</Status><span style={{ textDecoration: x.is_done ? 'line-through' : 'none', color: x.is_done ? 'var(--muted)' : 'inherit' }}>{x.title}</span><span className="cell-sub" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{x.type === 'daily' ? fmtMD(x.start_date) : x.type === 'weekly' ? '주간' : '월간'}</span></div>)}
        </Section>
        <Section title="지시사항 · 피드백" sub="제출된 주간보고">
          {dirRows.length ? <table style={{ fontSize: 13 }}><thead><tr><th>주</th><th>공통</th><th>개인</th><th>피드백</th></tr></thead><tbody>{dirRows.map((d, i) => <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{fmtMD(d.week!)}</td><td>{d.common || <span className="cell-sub">-</span>}</td><td>{d.directive || <span className="cell-sub">-</span>}</td><td style={{ color: 'var(--muted)' }}>{d.feedback || '-'}</td></tr>)}</tbody></table> : <Empty>주간보고 기록 없음</Empty>}
        </Section>
      </div>
      <Section title="일별 KPI" sub={bizLabel(bm)} flush>
        {(kpi ?? []).length ? <div style={{ overflowX: 'auto' }}><table><thead><tr><th>날짜</th><th style={{ textAlign: 'right' }}>마진</th><th style={{ textAlign: 'right' }}>신규 마진</th><th style={{ textAlign: 'right' }}>콜</th><th style={{ textAlign: 'right' }}>신규</th><th>업무 보고</th><th>팀장 피드백</th></tr></thead>
          <tbody>{(kpi ?? []).map(k => <tr key={k.work_date}><td style={{ whiteSpace: 'nowrap' }}>{fmtMD(k.work_date)}</td><td><Money v={Number(k.margin)} dash /></td><td><Money v={Number(k.new_margin)} dash /></td><td style={{ textAlign: 'right' }}>{Number(k.calls).toLocaleString()}</td><td style={{ textAlign: 'right' }}>{k.new_cnt}</td><td style={{ maxWidth: 420, whiteSpace: 'pre-wrap', fontSize: 13 }}>{k.work_report || <span className="cell-sub">-</span>}</td><td style={{ maxWidth: 300, whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--muted)' }}>{k.feedback || '-'}</td></tr>)}
            <tr className="total"><td>합계 {kpi?.length}일</td><td><Money v={(kpi ?? []).reduce((a, k) => a + Number(k.margin), 0)} big /></td><td><Money v={(kpi ?? []).reduce((a, k) => a + Number(k.new_margin), 0)} dash /></td><td style={{ textAlign: 'right' }}>{(kpi ?? []).reduce((a, k) => a + Number(k.calls), 0).toLocaleString()}</td><td style={{ textAlign: 'right' }}>{(kpi ?? []).reduce((a, k) => a + Number(k.new_cnt), 0)}</td><td colSpan={2} /></tr></tbody></table></div> : <div style={{ padding: 22 }}><Empty>이달 KPI 입력 없음</Empty></div>}
      </Section>
    </div>
  );
}
