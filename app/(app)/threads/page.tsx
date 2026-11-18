// 쓰레드 자동 발행 — 계정 연결 · 발행 설정 · 글 대기열 · 발행 내역 (총괄만)
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui';
import ThreadsClient from './ThreadsClient';
import { thState } from './actions';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;
export default async function ThreadsPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login'); if (me.role !== 'head') redirect('/');
  const s = await thState();
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title="쓰레드 자동 발행" desc="워크허브 키워드 데이터로 쓴 글을 정해 둔 시각에 자동으로 올립니다. AI 가 쓴 글은 AI 검수를 통과해야 대기열에 들어가고, 발행 전에 대기열에서 고치거나 지울 수 있습니다" />
    <ThreadsClient init={s.ok ? { acc: s.acc, queue: s.queue, done: s.done, aiTask: s.aiTask, rvTask: s.rvTask } : null} err={s.ok ? '' : s.msg} />
  </div>;
}
