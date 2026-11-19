// 콜 리스트 현황 — 팀원별 콜 진행 상황 대시보드 (팀장=자기 팀, 총괄·어드민=전 팀). 날짜 하루 또는 기간(최대 14일) 합산. 사원에게는 메뉴도 화면도 안 보인다
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { todayKST, addDays, weekStartOf, fmtMD } from '@/lib/date/kst';
import TeamCalls from './TeamCalls';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
export default async function CallStatusPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  if (!['admin', 'head', 'manager'].includes(me.role)) redirect('/');
  const today = todayKST(); const wk = weekStartOf(today);
  let to = isDate(searchParams.to) && searchParams.to! <= today ? searchParams.to! : today; let from = isDate(searchParams.from) && searchParams.from! <= to ? searchParams.from! : to;
  if (!searchParams.from && !searchParams.to) { from = today; to = today; }
  if (addDays(from, 13) < to) from = addDays(to, -13);   // 최대 14일
  const sb = supabaseServer(); const { data: ts } = await sb.from('teams').select('id,name').eq('is_active', true).neq('name', '관리팀').order('sort_order');
  const teams = ((ts ?? []) as { id: number; name: string }[]).filter(t => me.role !== 'manager' || t.id === me.team_id);
  const lw = addDays(wk, -7); const quick: [string, string, string][] = [['오늘', today, today], ['어제', addDays(today, -1), addDays(today, -1)], ['이번 주', wk, today], ['지난주', lw, addDays(lw, 4)], ['최근 7일', addDays(today, -6), today], ['최근 14일', addDays(today, -13), today]];
  const on = (f: string, t: string) => f === from && t === to;
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title="콜 리스트 현황" desc={`${from === to ? fmtMD(from) : `${fmtMD(from)} ~ ${fmtMD(to)}`} · 결과를 남긴 건 기준 — 지시한 수량과 대조해 보세요`} />
    <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {quick.map(([label, f, t]) => <Link key={label} href={`/call-status?from=${f}&to=${t}`} className={on(f, t) ? 'btn' : 'btn ghost'} style={{ padding: '4px 12px' }}>{label}</Link>)}
      <form action="/call-status" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
        <input type="date" name="from" defaultValue={from} max={today} style={{ padding: '4px 8px', fontSize: 13, width: 'auto' }} /><span>~</span>
        <input type="date" name="to" defaultValue={to} max={today} style={{ padding: '4px 8px', fontSize: 13, width: 'auto' }} />
        <button className="btn ghost" style={{ padding: '4px 12px' }}>보기</button></form>
      <span className="help">한 번에 최대 14일</span>
    </div>
    {teams.length ? teams.map(t => <TeamCalls key={`${t.id}:${from}:${to}`} teamId={t.id} teamName={t.name} from={from} to={to} />) : <div className="card">팀이 배정되지 않았습니다.</div>}
    <span className="help">날짜별 숫자와 「처리」 = 오늘의 콜 리스트에서 결과(관심·계약·거절·부재)를 남긴 건수. 「일평균」 = 처리 합계 ÷ 기간 안의 평일 수. 「키워드 콜」 = 그 기간에 키워드 콜 리스트에 결과를 남긴 업체 수(같은 업체는 마지막 결과 한 번만). 워크허브 밖에서 건 전화는 잡히지 않습니다. 키워드 콜 상세는 <Link href="/kw-calls">키워드 콜 리스트</Link> 맨 위 표에서 이름을 누르면 보입니다</span>
  </div>;
}
