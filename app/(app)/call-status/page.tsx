// 콜 리스트 현황 — 팀원별 콜 진행 상황 대시보드 (팀장=자기 팀, 총괄·어드민=전 팀). 사원에게는 메뉴도 화면도 안 보인다
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';
import { todayKST, addDays, weekStartOf, fmtMD } from '@/lib/date/kst';
import TeamCalls from './TeamCalls';
export const dynamic = 'force-dynamic';
export default async function CallStatusPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  if (!['admin', 'head', 'manager'].includes(me.role)) redirect('/');
  const sb = supabaseServer(); const { data: ts } = await sb.from('teams').select('id,name').order('id');
  const teams = ((ts ?? []) as { id: number; name: string }[]).filter(t => me.role !== 'manager' || t.id === me.team_id);
  const today = todayKST();
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title="콜 리스트 현황" desc={`오늘 ${fmtMD(today)} · 어제 ${fmtMD(addDays(today, -1))} · 이번 주 ${fmtMD(weekStartOf(today))}(월)부터 · 결과를 남긴 건 기준 — 지시한 수량과 대조해 보세요`} />
    {teams.length ? teams.map(t => <TeamCalls key={t.id} teamId={t.id} teamName={t.name} />) : <div className="card">팀이 배정되지 않았습니다.</div>}
    <span className="help">「처리」 = 배분받은 것 중 결과(관심·계약·거절·부재)를 남긴 건수. 워크허브 밖에서 건 전화는 잡히지 않습니다. 키워드 콜 상세는 <Link href="/kw-calls">키워드 콜 리스트</Link> 맨 위 표에서 이름을 누르면 보입니다</span>
  </div>;
}
