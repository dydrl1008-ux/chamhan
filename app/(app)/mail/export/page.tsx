import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { supabaseServer } from '@/lib/supabase/server';
import ExportClient from './ExportClient';
export const dynamic = 'force-dynamic';

/** 메일 발송 › 수동 발송용 엑셀 — 다른 계정으로 직접 보낼 때. 총괄·대표만 */
export default async function MailExportPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  if (!(me.role === 'admin' || me.role === 'head')) redirect('/mail');
  const { data: pr } = await supabaseServer().from('profiles').select('phone').eq('id', me.id).maybeSingle();
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="수동 발송용 엑셀" desc="키워드별로 대상을 뽑아 제안서 링크·제목·본문을 채운 엑셀. 다른 계정에서 직접 보낼 때"
        help={<>뽑힌 업체는 「발송됨(수동)」으로 기록돼 3일 내 중복 발송에서 빠지고, 링크 열람도 추적됩니다. 제안서는 키워드당 1개(시크릿 지수 24시간 캐시 사용). A/B/C 세 가지 제목·본문이 옆 칸에 같이 들어갑니다.</>} />
      <ExportClient owner={me.name} phone={pr?.phone ?? ''} />
    </div>
  );
}
