import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, addDays, fmtMD, won } from '@/lib/date/kst';
import KpiForm from './KpiForm';
export const dynamic = 'force-dynamic';
export default async function KpiPage({ searchParams }: { searchParams: { d?: string } }) {
  const me = (await getProfile())!; const sb = supabaseServer(); const today = todayKST();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d ?? '') && searchParams.d! <= today ? searchParams.d! : today;
  const [{ data: mine }, { data: recent }, { data: team }, { data: people }] = await Promise.all([
    sb.from('kpi_daily').select('*').eq('user_id', me.id).eq('work_date', d).maybeSingle(),
    sb.from('kpi_daily').select('work_date,calls,new_cnt,margin,kakao_db,overtime,new_margin,work_report').eq('user_id', me.id).order('work_date', { ascending: false }).limit(10),
    me.role === 'staff' ? Promise.resolve({ data: [] as any[] }) : sb.from('kpi_daily').select('user_id,work_date,calls,new_cnt,margin,kakao_db,overtime,new_margin,work_report,feedback').gte('work_date', addDays(today, -6)).order('work_date', { ascending: false }),
    sb.from('profiles').select('id,name,team_id,role').eq('is_active', true),
  ]);
  const nm = (id: string) => people?.find(p => p.id === id)?.name ?? '-';
  const canSubmit = me.role === 'staff' || me.role === 'manager';
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>일간 KPI 보고 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>제출 즉시 영업 마진 · 팀장 주간보고에 반영</span></h1>
      {canSubmit && <KpiForm date={d} today={today} existing={mine} />}
      {recent && recent.length > 0 && <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>내 최근 제출</h3><div style={{ overflowX: 'auto' }}><table><thead><tr><th>날짜</th><th className="num" style={{ textAlign: 'right' }}>콜</th><th style={{ textAlign: 'right' }}>신규</th><th style={{ textAlign: 'right' }}>마진</th><th style={{ textAlign: 'right' }}>카톡DB</th><th>야근</th><th style={{ textAlign: 'right' }}>신규마진</th><th>업무 보고</th></tr></thead>
        <tbody>{recent.map(r => <tr key={r.work_date}><td><a href={`/kpi?d=${r.work_date}`}>{r.work_date}</a></td><td style={{ textAlign: 'right' }}>{r.calls}</td><td style={{ textAlign: 'right' }}>{r.new_cnt || '-'}</td><td style={{ textAlign: 'right', color: r.margin < 0 ? 'var(--bad)' : 'inherit', fontWeight: 600 }}>{won(r.margin)}</td><td style={{ textAlign: 'right' }}>{r.kakao_db}</td><td>{r.overtime ? '야근' : '-'}</td><td style={{ textAlign: 'right' }}>{r.new_margin ? won(r.new_margin) : '-'}</td><td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.work_report ?? ''}>{r.work_report}</td></tr>)}</tbody></table></div></div>}
      {me.role !== 'staff' && <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{me.role === 'manager' ? '팀원 제출 현황' : '전체 제출 현황'} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>최근 7일 · {team?.length ?? 0}건</span></h3>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>날짜</th><th>이름</th><th style={{ textAlign: 'right' }}>콜</th><th style={{ textAlign: 'right' }}>신규</th><th style={{ textAlign: 'right' }}>마진</th><th style={{ textAlign: 'right' }}>카톡DB</th><th>야근</th><th>업무 보고</th><th>느낀점</th></tr></thead>
        <tbody>{(team ?? []).map((r, i) => <tr key={i}><td>{fmtMD(r.work_date)}</td><td><b>{nm(r.user_id)}</b></td><td style={{ textAlign: 'right' }}>{r.calls}</td><td style={{ textAlign: 'right' }}>{r.new_cnt || '-'}</td><td style={{ textAlign: 'right', color: r.margin < 0 ? 'var(--bad)' : 'inherit', fontWeight: 600 }}>{won(r.margin)}</td><td style={{ textAlign: 'right' }}>{r.kakao_db}</td><td>{r.overtime ? '야근' : '-'}</td><td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 280, whiteSpace: 'pre-wrap' }}>{r.work_report}</td><td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 200, whiteSpace: 'pre-wrap' }}>{r.feedback}</td></tr>)}
        {(team ?? []).length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>제출 없음</td></tr>}</tbody></table></div></div>}
    </div>
  );
}
