// 키워드 콜 리스트 — 추출기 CSV 로 쌓인 업체 연락처를 키워드별로 보고 연락 결과를 남긴다 (전 직원). 기존 콜 리스트(자동 배분)와 별개
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import KwCallsClient from './KwCallsClient';
import { kwKeywords, kwRequests } from './actions';
export const dynamic = 'force-dynamic';
export default async function KwCallsPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const [k, rq] = await Promise.all([kwKeywords(), kwRequests()]);
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title="키워드 콜 리스트" desc="키워드를 고르면 그 키워드 업체의 대표자·전화·이메일이 나옵니다. 연락한 결과를 남기면 담당으로 표시됩니다" />
    <KwCallsClient me={{ id: me.id, boss: me.role === 'head' || me.role === 'admin' }} keywords={k.ok ? k.list : []} err={k.ok ? '' : k.msg} reqs0={rq.ok ? { mine: rq.mine, open: rq.open } : { mine: [], open: [] }} reqErr={rq.ok ? '' : rq.msg} />
  </div>;
}
