// 키워드 제안서 — 시크릿 지수 데이터만으로 9~10장짜리 제안서 자동 생성 (LLM 없음). PDF/PNG 저장, /p/코드 링크
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { recent, myUsage } from '@/lib/nsc';
import ProposalsClient from './ProposalsClient';
export const dynamic = 'force-dynamic';
export default async function ProposalsPage({ searchParams }: { searchParams: { kw?: string } }) {
  const me = (await getProfile())!;
  const [{ data: link }, list, usage] = await Promise.all([supabaseServer().from('reward_watch_links').select('phone').eq('user_id', me.id).maybeSingle(), recent(20).catch(() => []), myUsage(me.id).catch(() => ({ used: 0, limit: 0 }))]);
  return <ProposalsClient initialKw={searchParams.kw ?? ''} phone={link?.phone ?? ''} recent={(list as any[]).map(x => x.keyword)} usage={usage} />;
}
