import { redirect } from 'next/navigation';
/** /ai → 지시 · 작업 현황 (알림 링크 /ai?task= 호환) */
export default function AiIndex({ searchParams }: { searchParams: { task?: string } }) {
  redirect('/ai/orders' + (searchParams.task ? `?task=${encodeURIComponent(searchParams.task)}` : ''));
}
