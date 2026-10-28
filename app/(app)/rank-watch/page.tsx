// 순위 체크 — ykreward rank_watch 중 내 계정 담당 건. 직원: 본인 / 팀장: 팀 / 총괄·대표·관리팀: 전체. ★ 주요 업체만 변동 알림(본인)
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { watchRows, watchHistory, ykrReady, type WatchRow, type HistPt } from '@/lib/ykreward';
import { PageHeader, Empty } from '@/components/ui';
import RankWatchClient from './RankWatchClient';
export const dynamic = 'force-dynamic';
export default async function RankWatchPage({ searchParams }: { searchParams: { u?: string } }) {
  const me = (await getProfile())!; const sb = supabaseServer();
  if (!ykrReady()) return <div style={{ display: 'grid', gap: 14 }}><PageHeader title="순위 체크" /><div className="card"><Empty>ykreward 연동 설정이 없습니다.</Empty></div></div>;
  const all = me.role === 'admin' || me.role === 'head' || me.is_mgmt;
  const [{ data: links }, { data: stars }, { data: profs }] = await Promise.all([
    sb.from('reward_watch_links').select('user_id,login_id'),                 // RLS: 본인 / 팀 / 전체
    sb.from('reward_watch_stars').select('group_key'),                        // 본인 것만
    sb.from('profiles').select('id,name,team_id').eq('is_active', true),
  ]);
  const myLink = links?.find(l => l.user_id === me.id)?.login_id ?? '';
  const people = (links ?? []).map(l => ({ user_id: l.user_id, login: l.login_id, name: profs?.find(p => p.id === l.user_id)?.name ?? '' })).sort((a, b) => a.name.localeCompare(b.name));
  const sel = me.role === 'staff' ? me.id : (searchParams.u && people.some(p => p.user_id === searchParams.u) ? searchParams.u : (myLink ? me.id : people[0]?.user_id ?? ''));
  const selLogin = people.find(p => p.user_id === sel)?.login;
  let rows: WatchRow[] = [], hist: Record<string, HistPt[]> = {}, err = '';
  try { rows = selLogin ? await watchRows([selLogin]) : []; hist = await watchHistory(rows.map(w => w.id), 30); } catch (e: any) { err = e?.message ?? String(e); }
  return <RankWatchClient me={{ id: me.id, name: me.name, role: me.role }} myLink={myLink} people={people} sel={sel} rows={rows} hist={hist} stars={(stars ?? []).map(s => s.group_key)} err={err} />;
}
