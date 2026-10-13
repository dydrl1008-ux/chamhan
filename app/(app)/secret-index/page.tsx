import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import Client from './Client';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export default async function Page({ searchParams }: { searchParams: { q?: string } }) {
  const p = await getProfile(); if (!p) redirect('/login');
  const canAdmin = p.role === 'admin' || p.role === 'head' || p.is_mgmt;
  return <div className="page">
    <PageHeader title="시크릿 지수" desc="네이버 쇼핑 키워드 상위 100개의 클릭·판매·품질 지수와 종합점수 · 회사 계정 1개로 조회 (같은 키워드는 24시간 캐시)" help="조회 1건마다 비용이 발생합니다. 같은 키워드를 24시간 안에 다시 보면 저장된 결과를 보여주고(무료), 하루 1인 조회 횟수는 설정값으로 제한됩니다. 강제 재조회는 관리팀·총괄·어드민만 가능합니다." />
    <Client initialQ={searchParams.q ?? ''} canAdmin={canAdmin} />
  </div>;
}
