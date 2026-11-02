// 키워드 제안서 — 시크릿 지수 데이터만으로 9~10장짜리 제안서 자동 생성 (LLM 없음). PDF/PNG 저장, /p/코드 링크
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { recent, myUsage } from '@/lib/nsc';
import ProposalsClient from './ProposalsClient';
export const dynamic = 'force-dynamic';
export default async function ProposalsPage({ searchParams }: { searchParams: { kw?: string } }) {
  const me = (await getProfile())!;
  const sb = supabaseServer();
  const [{ data: link }, list, usage, { data: mine }] = await Promise.all([sb.from('reward_watch_links').select('phone').eq('user_id', me.id).maybeSingle(), recent(20).catch(() => []), myUsage(me.id).catch(() => ({ used: 0, limit: 0 })), sb.from('proposals').select('code,title,views,first_view_at,last_view_at,created_at').eq('owner_id', me.id).eq('kind', 'native').order('created_at', { ascending: false }).limit(30)]);
  // 팀장·총괄·관리팀: 생성 현황 (RLS가 범위 결정)
  let team: any[] = [];
  if (me.role !== 'staff') {
    const [{ data: logs }, { data: profs }, { data: links }] = await Promise.all([sb.from('proposal_logs').select('user_id,keyword,target,action,code,created_at').order('created_at', { ascending: false }).limit(100), sb.from('profiles').select('id,name'), sb.from('proposals').select('code,views').eq('kind', 'native')]);
    const nm = new Map((profs ?? []).map(p => [p.id, p.name])); const vw = new Map((links ?? []).map(l => [l.code, l.views]));
    team = (logs ?? []).map(l => ({ name: nm.get(l.user_id) ?? '', keyword: l.keyword, target: l.target, action: l.action, code: l.code, views: l.code ? vw.get(l.code) ?? 0 : null, created_at: l.created_at }));
  }
  return <ProposalsClient initialKw={searchParams.kw ?? ''} phone={link?.phone ?? ''} owner={me.name} recent={(list as any[]).map(x => x.keyword)} usage={usage} mine={(mine ?? []) as any} team={team} base={(process.env.NEXT_PUBLIC_PROPOSAL_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://chamhan.vercel.app').replace(/\/$/, '')} />;
}
