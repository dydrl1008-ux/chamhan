// 메타팀 인바운드 DB — 광고로 들어온 문의를 처리한다. 사원: 본인 배정분 / 메타팀 팀장·총괄: 전체 + 올리기·배분
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { todayKST } from '@/lib/date/kst';
import { metaAccess } from '@/lib/meta';
import { metaDeployed } from '@/lib/metaEdu';
import { PageHeader } from '@/components/ui';
import { mdList, metaPeople } from './actions';
import MetaDbClient from './MetaDbClient';
export const dynamic = 'force-dynamic';
export default async function MetaDbPage({ searchParams }: { searchParams: { u?: string } }) {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const a = await metaAccess(me); if (!a.ok) redirect('/');
  if (!a.lead) redirect((await metaDeployed(me)) ? '/my-db' : '/meta-edu');   // 사원: 받은 건은 내 DB 에서 관리 (투입 전이면 교육)   // 교육 · 시험 · 스크립트 승인 전에는 DB 대신 교육 화면
  const people = a.lead ? await metaPeople() : [];
  const owner = a.lead ? (searchParams.u === 'none' || people.some(p => p.id === searchParams.u) ? searchParams.u! : 'all') : me.id;
  const r = await mdList(owner);
  return <>
    <PageHeader title="인바운드 DB" desc={a.lead ? '들어온 문의를 배분합니다. 배정하면 그 사람의 「내 DB」에 바로 들어가고, 사원이 내 DB 에서 남긴 상태 · 결제 금액이 여기에 반영됩니다' : '나에게 배정된 문의입니다. 통화 후 상태 · 결제 금액 · 메모를 남겨 주세요'} />
    {!r.ok ? <div className="card" style={{ color: '#B42318' }}>{r.msg}</div>
      : <MetaDbClient rows={r.rows} people={people} owner={owner} lead={a.lead} boss={a.boss} meId={me.id} today={todayKST()} />}
  </>;
}
