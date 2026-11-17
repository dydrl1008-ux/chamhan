// 수신거부 목록 — 메일의 수신거부 링크·공개 페이지(/unsub)·직접 추가로 들어온 주소 전체. 자동 발송·수동 뽑기가 이 목록으로 거른다
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import OptoutsClient from './OptoutsClient';
export const dynamic = 'force-dynamic';
export default async function OptoutsPage() {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head')) redirect('/');
  const sb = supabaseAdmin(); const rows: { email: string; code: string | null; created_at: string }[] = [];
  for (let from = 0; from < 20000; from += 1000) {   // 1,000건씩 끊어서 전부
    const { data, error } = await sb.from('email_optouts').select('email,code,created_at').order('created_at', { ascending: false }).range(from, from + 999);
    if (error || !data?.length) break; rows.push(...data); if (data.length < 1000) break;
  }
  const { data: st } = await sb.from('app_settings').select('value').eq('key', 'unsub_url').maybeSingle();
  return <OptoutsClient rows={rows} savedUrl={String(st?.value ?? '').replace(/"/g, '')} />;
}
