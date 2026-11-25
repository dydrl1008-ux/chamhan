// 순위 체크 — 워크허브 자체 기능(지수 프로그램으로 조회). 직원: 본인 / 팀장: 팀 / 총괄·대표·관리팀: 전체. ★ 주요 업체는 변동 알림
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { watchRows, watchHistory, type WatchRow, type HistPt } from '@/lib/rankWatch';
import RankWatchClient from './RankWatchClient';
export const dynamic = 'force-dynamic';
export default async function RankWatchPage({ searchParams }: { searchParams: { u?: string } }) {
  const me = (await getProfile())!; const sb = supabaseServer(); const all = me.role === 'admin' || me.role === 'head' || me.is_mgmt;
  const [{ data: stars }, { data: profs }, { data: grps }, { data: owners }] = await Promise.all([
    sb.from('reward_watch_stars').select('group_key'),                        // 본인 것만
    sb.from('profiles').select('id,name,team_id').eq('is_active', true),
    sb.from('reward_watch_groups').select('user_id,name,memo').order('created_at'),
    supabaseAdmin().from('rank_watch_items').select('user_id').eq('active', true).limit(20000),
  ]);
  const has = new Set((owners ?? []).map((o: any) => o.user_id)); has.add(me.id);
  const people = (profs ?? []).filter(p => has.has(p.id) && (all || p.id === me.id || (me.role === 'manager' && p.team_id != null && p.team_id === me.team_id))).map(p => ({ user_id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
  const sel = me.role === 'staff' ? me.id : (searchParams.u && people.some(p => p.user_id === searchParams.u) ? searchParams.u : me.id);
  let rows: WatchRow[] = [], hist: Record<string, HistPt[]> = {}, err = '';
  try { rows = await watchRows([sel]); hist = await watchHistory(rows.map(w => w.id), 30); } catch (e: any) { err = e?.message ?? String(e); }
  return <RankWatchClient me={{ id: me.id, name: me.name, role: me.role }} people={people} sel={sel} rows={rows} hist={hist} stars={(stars ?? []).map(s => s.group_key)} emptyGroups={(grps ?? []).filter(g => g.user_id === sel).map(g => g.name)} err={err} />;
}
