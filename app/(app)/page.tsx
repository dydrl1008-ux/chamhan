import Link from 'next/link';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, won, man, weekStartOf, addDays, fmtMD } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, bizLabel, prevBizMonth } from '@/lib/date/period';
import { evaluatePeople } from '@/lib/eval';
export const dynamic = 'force-dynamic';
const Card = ({ l, v, d, c, href }: { l: string; v: React.ReactNode; d?: React.ReactNode; c?: string; href?: string }) => <div className="card" style={{ padding: '14px 18px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>{d && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{d}</div>}{href && <Link href={href} style={{ fontSize: 12 }}>바로가기 →</Link>}</div>;
const bar = (p: number, c?: string) => <div style={{ height: 8, background: 'var(--line)', borderRadius: 6, marginTop: 6 }}><div style={{ width: `${Math.min(100, Math.max(0, p))}%`, height: '100%', background: c ?? 'var(--accent)', borderRadius: 6 }} /></div>;
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
const leaveName: Record<string, string> = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', monthly: '월차', sick: '병가', absent: '무단결근', late: '지각' };

export default async function Home() {
  const p = (await getProfile())!; const sb = supabaseServer(); const today = todayKST(); const bm = bizMonthOf(today); const [ms, meD] = bizMonthRange(bm); const ws = weekStartOf(today);
  const [{ data: issue }, { data: reads }, { data: promos }] = await Promise.all([
    sb.from('issues').select('id,title,body,customer_notice,issue_date').eq('is_active', true).order('issue_date', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
    sb.from('issue_reads').select('issue_id').eq('user_id', p.id),
    sb.from('promotions').select('title,body,starts_at,ends_at').eq('is_active', true).or(`ends_at.is.null,ends_at.gte.${today}`).order('sort_order').limit(2),
  ]);
  const unread = issue && !reads?.some(x => x.issue_id === issue.id);
  const issueBox = issue && <div style={{ borderLeft: '4px solid #D97706', background: '#FDF1DD', padding: '12px 16px', borderRadius: '0 12px 12px 0' }}><b>금일 이슈 · {issue.title}</b> {unread && <span className="pill" style={{ background: 'var(--bad-soft)', color: 'var(--bad)', marginLeft: 6 }}>미확인</span>}<div style={{ fontSize: 13, marginTop: 4 }}>{issue.body}</div><Link href="/issues" style={{ fontSize: 13 }}>전체 보기 →</Link></div>;
  const promoBox = promos && promos.length > 0 && <div style={{ background: 'linear-gradient(120deg,#101A4A,#26308F 55%,#3D5AFE)', color: '#fff', borderRadius: 16, padding: '18px 22px', display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}><div><div style={{ fontSize: 11.5, background: 'rgba(255,255,255,.16)', display: 'inline-block', padding: '3px 9px', borderRadius: 6, marginBottom: 6 }}>진행 중 프로모션{promos[0].starts_at ? ` · ${promos[0].starts_at.slice(5).replace('-', '/')} ~ ${promos[0].ends_at?.slice(5).replace('-', '/') ?? ''}` : ''}</div><div style={{ fontSize: 18, fontWeight: 800 }}>{promos[0].title}</div><div style={{ fontSize: 13, opacity: .85 }}>{promos[0].body}</div></div>{promos[1] && <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, minWidth: 200 }}>다음<div style={{ fontWeight: 700 }}>{promos[1].title}</div></div>}</div>;

  // ---------- 직원 ----------
  if (p.role === 'staff') {
    const [{ people }, { data: att }, { data: kpi }, { data: tgt }, { data: pend }, { data: plans }, { data: dir }] = await Promise.all([
      evaluatePeople(today, p.id),
      sb.from('attendance').select('check_in,check_out,is_late').eq('user_id', p.id).eq('work_date', today).maybeSingle(),
      sb.from('kpi_daily').select('margin,margin_auto,margin_manual').eq('user_id', p.id).eq('work_date', today).maybeSingle(),
      sb.from('monthly_targets').select('margin').eq('user_id', p.id).eq('month', bm + '-01').maybeSingle(),
      sb.from('leave_requests').select('type,start_date,status,team_approved_at').eq('user_id', p.id).eq('status', 'pending'),
      sb.from('plans').select('id,title,is_done').eq('user_id', p.id).eq('is_active', true).eq('type', 'daily').lte('start_date', today).gte('end_date', today),
      sb.rpc('my_directives', { p_limit: 1 }),
    ]);
    const me = people[0]; const tg = Number(tgt?.margin ?? 0); const mm = me?.monthMargin ?? 0; const r = tg ? mm / tg : 0; const d = (dir as any[])?.[0];
    const todo = [!att?.check_in && ['출근 기록', '/attendance'], !kpi && ['오늘 KPI 보고', '/kpi'], unread && ['금일 이슈 확인', '/issues']].filter(Boolean) as [string, string][];
    return (
      <div style={{ display: 'grid', gap: 18, maxWidth: 1100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><h1 style={{ fontSize: 20, margin: 0 }}>{p.name}님, {today}</h1>{todo.length ? todo.map(([t, h]) => <Link key={h} href={h} className="pill" style={{ background: 'var(--bad-soft)', color: 'var(--bad)', textDecoration: 'none' }}>할 일 · {t}</Link>) : <span className="pill" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>오늘 할 일 완료</span>}</div>
        {promoBox}{issueBox}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          <Card l="오늘 출근" v={att?.check_in ? att.check_in.slice(0, 5) : '미체크'} d={att?.check_in ? (att.is_late ? '지각' : '정상') + (att.check_out ? ` · 퇴근 ${att.check_out.slice(0, 5)}` : '') : '자리에 앉으면 기록'} c={att?.check_in ? (att.is_late ? '#D97706' : 'var(--ok)') : 'var(--bad)'} href="/attendance" />
          <Card l="오늘 KPI" v={kpi ? won(kpi.margin) : '미제출'} d={kpi ? `정산 ${won(kpi.margin_auto)} + 추가 ${won(kpi.margin_manual)}` : '퇴근 전 제출'} c={kpi ? 'var(--ok)' : 'var(--bad)'} href="/kpi" />
          <div className="card" style={{ padding: '14px 18px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{bizLabel(bm)} 마진</div><div style={{ fontSize: 22, fontWeight: 800, color: mm < 0 ? 'var(--bad)' : 'inherit' }}>{won(mm)}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{tg ? `목표 ${man(tg)} · ${pct(mm, tg)}%` : '목표 미배정'}</div>{tg ? bar(r * 100, r >= 1 ? 'var(--ok)' : r >= .7 ? '#D97706' : undefined) : null}</div>
          <Card l="예상 인센티브" v={won(me?.inc.total ?? 0)} d={me?.inc.tier ? `${me.inc.scope} · ${me.inc.tier.label}${me.inc.next ? ` · 다음 구간까지 ${man(Number(me.inc.next.min_margin) - mm)}` : ''}` : '기준 없음'} href="/me" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>오늘 계획 <Link href="/plans" style={{ fontSize: 12, fontWeight: 400 }}>캘린더 →</Link></h3>{(plans ?? []).length ? (plans ?? []).map(x => <div key={x.id} style={{ fontSize: 13, padding: '4px 0', textDecoration: x.is_done ? 'line-through' : 'none', opacity: x.is_done ? .5 : 1 }}>{x.is_done ? '✓' : '○'} {x.title}</div>) : <div style={{ fontSize: 13, color: 'var(--muted)' }}>등록된 오늘 계획 없음</div>}</div>
          <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>내 근태 신청 <Link href="/leave" style={{ fontSize: 12, fontWeight: 400 }}>근태 →</Link></h3>{(pend ?? []).length ? (pend ?? []).map((x, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0' }}>{leaveName[x.type]} {x.start_date} · <span style={{ color: '#D97706' }}>{x.team_approved_at ? '총괄 최종 대기' : '팀장 승인 대기'}</span></div>) : <div style={{ fontSize: 13, color: 'var(--muted)' }}>대기 중인 신청 없음</div>}</div>
          <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>팀장 지시 <Link href="/me" style={{ fontSize: 12, fontWeight: 400 }}>전체 →</Link></h3>{d ? <div style={{ fontSize: 13 }}><div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtMD(d.week_start)} 주</div>{d.common_directive && <div style={{ marginTop: 4 }}><b>공통</b> {d.common_directive}</div>}{d.directive && <div style={{ marginTop: 4 }}><b>지시</b> {d.directive}</div>}{d.feedback && <div style={{ marginTop: 4, color: 'var(--muted)' }}><b>피드백</b> {d.feedback}</div>}</div> : <div style={{ fontSize: 13, color: 'var(--muted)' }}>아직 없음</div>}</div>
        </div>
      </div>
    );
  }

  // ---------- 팀장 / 총괄 / 어드민 ----------
  const isMgr = p.role === 'manager';
  const [{ people, teams }, { data: att }, { data: kpiT }, { data: lvToday }, { data: pend }, { data: targets }, { data: wr }, { data: cur }, { data: prv }, { count: settlePending }] = await Promise.all([
    evaluatePeople(today),
    sb.from('attendance').select('user_id,check_in,is_late').eq('work_date', today),
    sb.from('kpi_daily').select('user_id,margin').eq('work_date', today),
    sb.from('leave_requests').select('user_id,type').eq('status', 'approved').lte('start_date', today).gte('end_date', today),
    sb.from('leave_requests').select('user_id,type,team_approved_at').eq('status', 'pending'),
    sb.from('monthly_targets').select('user_id,margin').eq('month', bm + '-01'),
    sb.from('weekly_reports').select('team_id,status').eq('week_start', ws),
    sb.from('kpi_daily').select('user_id,work_date,margin').gte('work_date', ms).lte('work_date', today).limit(5000),
    (() => { const [pms, pme] = bizMonthRange(prevBizMonth(bm)); return sb.from('kpi_daily').select('user_id,work_date,margin').gte('work_date', pms).lte('work_date', pme).limit(5000); })(),
    isMgr ? Promise.resolve({ count: 0 }) : sb.from('settlement_pending').select('item_key', { count: 'exact', head: true }).is('resolved_at', null).is('dismissed_at', null),
  ]);
  const rows = people.filter(x => !isMgr || x.team_id === p.team_id); const staff = rows.filter(x => x.role === 'staff'); const ids = staff.map(x => x.id);
  const sumM = (arr: { margin: number; user_id: string }[]) => arr.filter(x => ids.includes(x.user_id)).reduce((a, x) => a + Number(x.margin), 0);
  const mm = staff.reduce((a, x) => a + x.monthMargin, 0); const tg = ids.reduce((a, id) => a + Number(targets?.find(t => t.user_id === id)?.margin ?? 0), 0); const r = tg ? mm / tg : 0;
  const dayIdx = Math.round((new Date(today + 'T00:00:00Z').getTime() - new Date(ms + 'T00:00:00Z').getTime()) / 864e5); const [pms] = bizMonthRange(prevBizMonth(bm)); const pSame = addDays(pms, dayIdx);
  const prvSame = sumM((prv ?? []).filter(x => x.work_date <= pSame)); const diff = mm - prvSame;
  const pendMine = (pend ?? []).filter(x => rows.some(y => y.id === x.user_id)).filter(x => isMgr ? (!x.team_approved_at && !['late', 'absent'].includes(x.type)) : (x.team_approved_at || ['late', 'absent'].includes(x.type)));
  const noAtt = rows.filter(x => !att?.some(a => a.user_id === x.id) && !lvToday?.some(l => l.user_id === x.id)); const noKpi = staff.filter(x => !kpiT?.some(k => k.user_id === x.id));
  const tn = (id: number | null) => teams.find(t => t.id === id)?.name ?? '-';
  const teamsShown = teams.filter(t => rows.some(x => x.team_id === t.id));
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><h1 style={{ fontSize: 20, margin: 0 }}>{p.name}님, {today}</h1><span style={{ fontSize: 13, color: 'var(--muted)' }}>{isMgr ? tn(p.team_id) : '전사'} · {bizLabel(bm)}</span><Link href="/overview" className="btn ghost" style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}>직원 현황 →</Link></div>
      {promoBox}{issueBox}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
        <div className="card" style={{ padding: '14px 18px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{isMgr ? '팀' : '전사'} 마진 (오늘까지)</div><div style={{ fontSize: 22, fontWeight: 800, color: mm < 0 ? 'var(--bad)' : 'inherit' }}>{won(mm)}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{tg ? `목표 ${man(tg)} · ${pct(mm, tg)}%` : '목표 미배정'}</div>{tg ? bar(r * 100, r >= 1 ? 'var(--ok)' : r >= .7 ? '#D97706' : undefined) : null}</div>
        <Card l="지난달 같은 시점 대비" v={<span style={{ color: diff >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{diff >= 0 ? '▲' : '▼'} {man(Math.abs(diff))}</span>} d={`${Number(prevBizMonth(bm).slice(5))}월 ${pSame.slice(5).replace('-', '/')}까지 ${won(prvSame)}`} />
        <Card l="오늘 출근" v={`${rows.length - noAtt.length}/${rows.length}`} d={noAtt.length ? `미체크: ${noAtt.map(x => x.name).join(', ')}` : '전원 체크'} c={noAtt.length ? 'var(--bad)' : 'var(--ok)'} href="/attendance" />
        <Card l="오늘 KPI 제출" v={`${staff.length - noKpi.length}/${staff.length}`} d={noKpi.length ? `미제출: ${noKpi.map(x => x.name).join(', ')}` : '전원 제출'} c={noKpi.length ? 'var(--bad)' : 'var(--ok)'} href="/kpi" />
        <Card l={isMgr ? '팀 승인 대기' : '최종 승인 대기'} v={`${pendMine.length}건`} d={!isMgr && (settlePending ?? 0) > 0 ? `정산 승인 대기 ${settlePending}건` : undefined} c={pendMine.length ? '#D97706' : 'var(--ok)'} href={pendMine.length ? '/leave' : (settlePending ?? 0) > 0 ? '/pending' : '/leave'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, teamsShown.length))},1fr)`, gap: 14 }}>
        {teamsShown.map(t => { const tm = staff.filter(x => x.team_id === t.id); const tids = tm.map(x => x.id); const m = tm.reduce((a, x) => a + x.monthMargin, 0); const tt = tids.reduce((a, id) => a + Number(targets?.find(y => y.user_id === id)?.margin ?? 0), 0); const w = wr?.find(x => x.team_id === t.id); return (
          <div key={t.id} className="card"><h3 style={{ margin: '0 0 8px', fontSize: 15, display: 'flex', justifyContent: 'space-between' }}><span>{t.name} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{tm.length}명</span></span><span className="pill" style={w?.status === 'submitted' ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : { background: '#FDF1DD', color: '#D97706' }}>주간보고 {w?.status === 'submitted' ? '제출' : w ? '작성중' : '미작성'}</span></h3>
            <div style={{ fontSize: 20, fontWeight: 800, color: m < 0 ? 'var(--bad)' : 'inherit' }}>{won(m)} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{tt ? `/ ${man(tt)} · ${pct(m, tt)}%` : ''}</span></div>{tt ? bar(pct(m, tt), m / tt >= 1 ? 'var(--ok)' : undefined) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>{tm.map(x => { const a = att?.some(y => y.user_id === x.id); const l = lvToday?.some(y => y.user_id === x.id); const k = kpiT?.some(y => y.user_id === x.id); const ok = (a || l) && k; return <span key={x.id} className="pill" style={{ background: ok ? 'var(--ok-soft)' : 'var(--bad-soft)', color: ok ? 'var(--ok)' : 'var(--bad)' }} title={`${l ? '휴가' : a ? '출근' : '미체크'} · ${k ? 'KPI 제출' : 'KPI 미제출'}`}>{x.name}</span>; })}</div>
          </div>); })}
      </div>
    </div>
  );
}
