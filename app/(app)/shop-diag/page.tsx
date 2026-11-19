// 쇼핑 진단 — 상품 주소 + 키워드 → 순위·지수를 10위권 기준과 비교해 정리하고 카톡 문구·견적까지 만든다 (전 직원)
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import Client from './Client';
import { sdPrices } from './actions';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;
export default async function Page() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title="쇼핑 진단" desc="상품 주소와 키워드를 넣으면 순위·지수를 10위권 기준과 비교해 정리합니다. 단일 상품은 상품 번호로, 가격비교(원부)는 catalog 번호로 찾습니다" />
    <Client prices0={await sdPrices()} boss={me.role === 'head'} />
  </div>;
}
