// 메타팀 인바운드 DB — 광고로 들어온 문의를 처리한다. 사원: 본인 배정분 / 메타팀 팀장·총괄: 전체 + 올리기·배분
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { todayKST } from '@/lib/date/kst';
import { metaAccess, metaIntakeOpen, META_OPEN_FROM, META_OPEN_TO } from '@/lib/meta';
import { metaDeployed } from '@/lib/metaEdu';
import { PageHeader } from '@/components/ui';
import { mdList, metaPeople } from './actions';
import MetaDbClient from './MetaDbClient';
export const dynamic = 'force-dynamic';
export default async function MetaDbPage({ searchParams }: { searchParams: { u?: string } }) {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const a = await metaAccess(me); if (!a.ok) redirect('/');
  if (!a.lead && !(await metaDeployed(me))) redirect('/meta-edu');   // 교육 · 시험 · 스크립트 승인 전에는 DB 대신 교육 화면   // 교육 · 시험 · 스크립트 승인 전에는 DB 대신 교육 화면
  const people = a.lead ? await metaPeople() : [];
  const owner = a.lead ? (searchParams.u === 'none' || people.some(p => p.id === searchParams.u) ? searchParams.u! : 'all') : me.id;
  const r = await mdList(owner);
  return <>
    <PageHeader title="메타 DB" desc={a.lead ? '들어온 문의를 배분하고, 담당자별 진행 상황을 봅니다. 삭제는 없습니다 — 잘못 들어온 건은 허수 · 중복으로 표시합니다' : '나에게 배정된 문의입니다. 연락할 때마다 「연락 기록」을 남기고, 인수인계에 필요한 내용은 「관리 내용」에 적어 주세요. 결제는 정산요청에서 인바운드 체크로 접수하면 자동으로 들어옵니다'} />
    {a.lead && !metaIntakeOpen() && <div className="card" style={{ marginBottom: 12, background: '#FFFAEB', fontSize: 13.5 }}>지금은 DB 가 들어오는 시간(평일 {META_OPEN_FROM}~{META_OPEN_TO})이 아닙니다. 평일 이 시간 밖에 접수된 문의는 다음 날 9시(금요일 저녁 건은 토요일 0시)에 한꺼번에 들어옵니다. 주말은 시간 제한 없이 바로 들어옵니다.</div>}
    {!r.ok ? <div className="card" style={{ color: '#B42318' }}>{r.msg}</div>
      : <MetaDbClient rows={r.rows} people={people} owner={owner} lead={a.lead} boss={a.boss} meId={me.id} today={todayKST()} />}
  </>;
}
