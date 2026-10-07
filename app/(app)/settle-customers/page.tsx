import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import CustomersClient from './CustomersClient';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export default async function Page() {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) redirect('/');
  const base = process.env.SETTLE_BASE_URL || 'https://chamhan.info';
  return <div style={{ display: 'grid', gap: 18 }}>
    <div><h1 style={{ fontSize: 20, margin: 0 }}>고객(업체) 등록 · 직원 배정</h1><div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>정산 사이트의 고객관리 + 직원별 고객관리와 동일하게 반영됩니다. 직원은 자기에게 배정된 고객만 정산요청할 수 있고, 한 고객을 여러 직원에게 배정할 수 있습니다 (킵은 고객 단위로 공유). <a href={`${base}/pages/emp_customer`} target="_blank" rel="noreferrer">사이트에서 보기 ↗</a></div></div>
    <CustomersClient />
  </div>;
}
