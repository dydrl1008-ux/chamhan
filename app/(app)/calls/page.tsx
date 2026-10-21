import { headers } from 'next/headers';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import { PageHeader, Section, Empty } from '@/components/ui';
import CallsClient, { type Lead, type Prop } from './CallsClient';
export const dynamic = 'force-dynamic';

/** 오늘의 콜 리스트 — 영업사원 본인 배정분 + 관심 고객 팔로업 */
export default async function CallsPage() {
  const me = (await getProfile())!;
  const sb = supabaseServer(); const today = todayKST();
  const h = headers(); const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const cols = 'id,store_name,store_url,keyword,category,phone,score,score_why,status,note';
  const [{ data: todayRows }, { data: follow }, { data: props }] = await Promise.all([
    sb.from('leads').select(cols).eq('assigned_to', me.id).eq('assigned_date', today).order('score', { ascending: false }),
    sb.from('leads').select(cols).eq('assigned_to', me.id).eq('status', 'interested').neq('assigned_date', today).order('last_result_at', { ascending: false }).limit(50),
    sb.from('proposals').select('code,lead_id,title,views,last_view_at').eq('owner_id', me.id).order('last_view_at', { ascending: false, nullsFirst: false }).limit(300),
  ]);
  const t = (todayRows ?? []) as Lead[]; const left = t.filter(x => x.status === 'assigned').length;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="오늘의 콜 리스트" badge={<span className="pill">테스트</span>} desc={t.length ? `${t.length}곳 중 ${left}곳 남음 · 점수 높은 순` : '오늘 배분된 리스트가 없습니다'}
        help={<>평일 09:00에 점수 높은 업체부터 자동 배분됩니다. 결과를 안 남긴 건은 다음 날 다른 사람에게 다시 배분될 수 있습니다. 「+ 제안서 추적 링크」로 만든 링크를 고객에게 보내면, 고객이 열 때 알림이 오고 이 줄이 노랗게 표시됩니다.</>} />
      <Section title="오늘" flush>{t.length ? <CallsClient rows={t} props={(props ?? []) as Prop[]} origin={origin} /> : <div style={{ padding: 20 }}><Empty>오늘 배분된 업체가 없습니다.</Empty></div>}</Section>
      {follow?.length ? <Section title="관심 고객 팔로업" sub={`${follow.length}곳`} flush><CallsClient rows={follow as Lead[]} props={(props ?? []) as Prop[]} origin={origin} /></Section> : null}
    </div>
  );
}
