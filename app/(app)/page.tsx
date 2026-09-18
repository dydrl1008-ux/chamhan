import Link from 'next/link';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, won } from '@/lib/date/kst';
import { bizMonthOf } from '@/lib/date/period';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const p = (await getProfile())!; const sb = supabaseServer(); const today = todayKST();
  const [{ data: att }, { data: issue }, { data: reads }, { count: pending }, { count: visible }] = await Promise.all([
    sb.from('attendance').select('check_in,check_out,is_late').eq('user_id', p.id).eq('work_date', today).maybeSingle(),
    sb.from('issues').select('id,title,body,customer_notice').eq('is_active', true).order('issue_date', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
    sb.from('issue_reads').select('issue_id').eq('user_id', p.id),
    p.role === 'staff' ? Promise.resolve({ count: 0 }) : p.role === 'manager' ? sb.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('team_approved_at', null) : sb.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('profiles').select('id', { count: 'exact', head: true }),
  ]);
  const ms = bizMonthOf(today) + '-01';
  const [{ data: kpiToday }, { data: myMonth }, { data: tgt }] = await Promise.all([
    sb.from('kpi_daily').select('id').eq('user_id', p.id).eq('work_date', today).maybeSingle(),
    sb.from('v_margin_monthly').select('margin').eq('user_id', p.id).eq('month', ms).maybeSingle(),
    sb.from('monthly_targets').select('margin').eq('user_id', p.id).eq('month', ms).maybeSingle(),
  ]);
  const mm = Number(myMonth?.margin ?? 0), tg = Number(tgt?.margin ?? 0);
  const { data: promos } = await sb.from('promotions').select('title,body,starts_at,ends_at,link_url').eq('is_active', true).or(`ends_at.is.null,ends_at.gte.${today}`).order('sort_order').limit(2);
  const unread = issue && !reads?.some(x => x.issue_id === issue.id);
  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 980 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>{p.name}님, {today}</h1>
      {promos && promos.length > 0 && <div style={{ background: 'linear-gradient(120deg,#101A4A,#26308F 55%,#3D5AFE)', color: '#fff', borderRadius: 16, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}><div><div style={{ fontSize: 11.5, background: 'rgba(255,255,255,.16)', display: 'inline-block', padding: '3px 9px', borderRadius: 6, marginBottom: 8 }}>진행 중 프로모션{promos[0].starts_at ? ` · ${promos[0].starts_at.slice(5).replace('-', '/')} ~ ${promos[0].ends_at?.slice(5).replace('-', '/') ?? ''}` : ''}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{promos[0].title}</div><div style={{ fontSize: 13.5, opacity: .85 }}>{promos[0].body}</div></div>{promos[1] && <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '12px 16px', fontSize: 13, minWidth: 220 }}>다음<div style={{ fontWeight: 700 }}>{promos[1].title}</div><div style={{ opacity: .85 }}>{promos[1].body}</div></div>}</div>}
      {issue && <div style={{ borderLeft: '4px solid #D97706', background: '#FDF1DD', padding: '12px 16px', borderRadius: '0 12px 12px 0' }}><b>금일 이슈 · {issue.title}</b> {unread && <span className="pill" style={{ background: 'var(--bad-soft)', color: 'var(--bad)', marginLeft: 6 }}>미확인</span>}<div style={{ fontSize: 13, marginTop: 4 }}>{issue.body}</div><Link href="/issues" style={{ fontSize: 13 }}>전체 보기 →</Link></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridAutoRows: '1fr', gap: 14 }}>
        <div className="card"><div style={{ fontSize: 12, color: 'var(--muted)' }}>오늘 출근</div><div style={{ fontSize: 22, fontWeight: 800 }}>{att?.check_in ? att.check_in.slice(0, 5) : '미체크'}</div>{att?.check_in ? <div style={{ fontSize: 12, color: att.is_late ? 'var(--bad)' : 'var(--ok)' }}>{att.is_late ? '지각' : '정상'}{att.check_out ? ` · 퇴근 ${att.check_out.slice(0, 5)}` : ''}</div> : <Link href="/attendance" className="btn" style={{ display: 'inline-block', marginTop: 6, padding: '6px 12px', fontSize: 12, textDecoration: 'none' }}>출근 기록하기</Link>}</div>
        {(p.role === 'staff' || p.role === 'manager') && <div className="card"><div style={{ fontSize: 12, color: 'var(--muted)' }}>오늘 KPI 보고</div><div style={{ fontSize: 22, fontWeight: 800, color: kpiToday ? 'var(--ok)' : 'var(--bad)' }}>{kpiToday ? '제출 완료' : '미제출'}</div><Link href="/kpi" style={{ fontSize: 12 }}>{kpiToday ? '수정하기' : '지금 제출 →'}</Link></div>}
        {(p.role === 'staff' || p.role === 'manager') && <div className="card"><div style={{ fontSize: 12, color: 'var(--muted)' }}>이달 내 마진</div><div style={{ fontSize: 22, fontWeight: 800, color: mm < 0 ? 'var(--bad)' : 'inherit' }}>{won(mm)}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{tg ? `목표 ${won(tg)} · ${Math.round(mm / tg * 100)}%` : '목표 미설정'}</div></div>}
        {p.role !== 'staff' && <div className="card"><div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.role === 'manager' ? '팀 승인 대기' : '최종 승인 대기'}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{pending ?? 0}건</div><Link href="/leave" style={{ fontSize: 12 }}>근태로 이동 →</Link></div>}
        <div className="card"><div style={{ fontSize: 12, color: 'var(--muted)' }}>보이는 인원 (권한 확인용)</div><div style={{ fontSize: 22, fontWeight: 800 }}>{visible ?? 0}명</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>admin/head=전체 · manager=팀 · staff=1</div></div>
      </div>
    </div>
  );
}
