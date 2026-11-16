import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import { canBrief, canBriefEdit, DEFAULT_BUCKETS } from '@/lib/brief';
import { getBrief } from './actions';
import BriefClient from './BriefClient';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;

/** 영업 브리핑 — 오늘 영업할 키워드가 셀팜 진행 현황에 있으면 구간(슬롯·순위)으로만 보여 준다. 지정 계정만 */
export default async function BriefPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  if (!canBrief(me)) redirect('/');
  const r = await getBrief();
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="영업 브리핑" desc="오늘 영업할 키워드가 진행 현황에 있으면, 슬롯·순위를 구간으로만 보여 줍니다. 상품·MID는 나오지 않습니다." />
      <BriefClient list={r.list ?? []} buckets={r.buckets ?? DEFAULT_BUCKETS} at={r.at ?? null} n={r.n ?? 0} summary={r.summary ?? null} canEdit={canBriefEdit(me)} err={r.ok ? '' : r.msg} />
    </div>
  );
}
