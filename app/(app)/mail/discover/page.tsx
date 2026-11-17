// 키워드 발굴 — 아직 수집 안 된 키워드를 검색광고 API 연관 키워드에서 찾아 쌓고, 100개씩 콤마로 복사 (총괄만)
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import DiscoverClient from './DiscoverClient';
import { poolState, autoState } from './actions';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;
export default async function DiscoverPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login'); if (me.role !== 'head') redirect('/mail');
  const [st, auto] = await Promise.all([poolState(), autoState()]);
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title="키워드 발굴" desc="아직 수집 안 된 키워드를 자동으로 찾아 쌓아 둡니다. 필요할 때 100개씩 가져가세요" />
    <DiscoverClient init={st.ok ? { wait: st.wait, taken: st.taken, have: st.have, top: st.top, ad: st.ad } : null} err={st.ok ? '' : st.msg} auto0={auto} />
  </div>;
}
