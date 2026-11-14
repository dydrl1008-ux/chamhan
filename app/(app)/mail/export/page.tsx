import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { supabaseServer } from '@/lib/supabase/server';
import ExportClient from './ExportClient';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;   // 대상 확인·키워드별 엑셀 행 만들기가 길어질 수 있음

/** 메일 발송 › 수동 발송용 엑셀 — 다른 계정으로 직접 보낼 때. 총괄만 */
export default async function MailExportPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  if (me.role !== 'head') redirect('/mail');
  const { data: pr } = await supabaseServer().from('profiles').select('phone').eq('id', me.id).maybeSingle();
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="수동 발송용 엑셀" desc="키워드별로 대상을 뽑아 제안서 링크·제목·본문을 채운 엑셀. 다른 계정에서 직접 보낼 때"
        help={<>워크허브에 발송 기록은 남기지 않습니다 (중복 제외는 워크허브 자동 발송·회신·관심 업체 기준만). 제안서는 키워드당 1개(시크릿 지수 24시간 캐시 사용). A/B/C 세 가지 제목·본문이 옆 칸에 같이 들어갑니다.</>} />
      <ExportClient owner={me.name} phone={pr?.phone ?? ''} />
    </div>
  );
}
