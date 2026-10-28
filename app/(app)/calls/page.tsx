import { headers } from 'next/headers';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import Link from 'next/link';
import { PageHeader, Section, Empty } from '@/components/ui';
import CallsClient, { type Lead, type Prop, type Hist } from './CallsClient';
import MyCustomers, { type MyCustomer } from './MyCustomers';
export const dynamic = 'force-dynamic';

/** 오늘의 콜 리스트 — 영업사원 본인 배정분 + 관심 고객 팔로업. 총괄·대표·팀장은 사람 골라서 보기 (팀장은 팀원만) */
export default async function CallsPage({ searchParams }: { searchParams: { u?: string } }) {
  const me = (await getProfile())!;
  const sb = supabaseServer(); const today = todayKST();
  const lead = me.role === 'admin' || me.role === 'head'; const mgr = me.role === 'manager';
  let people: { id: string; name: string; team_id: number | null }[] = [];
  if (lead || mgr) { const q = sb.from('v_sales_people').select('id,name,team_id').order('name'); const { data } = mgr ? await q.eq('team_id', me.team_id ?? -1) : await q; people = (data ?? []) as any[]; }
  if (lead && !searchParams.u) {   // 총괄·대표: 사람별 오늘 현황 한눈에 → 이름 누르면 그 사람 리스트
    const { data: rows } = await sb.from('leads').select('assigned_to,status').eq('assigned_date', today);
    const per: Record<string, Record<string, number>> = {}; (rows ?? []).forEach(r => { const k = r.assigned_to ?? '-'; per[k] = per[k] ?? {}; per[k][r.status] = (per[k][r.status] ?? 0) + 1; });
    const tot = (rows ?? []).length; const left = (rows ?? []).filter(r => r.status === 'assigned').length;
    const { data: allC } = await sb.from('my_customers').select('id,name,phone,memo,created_at,user_id').order('created_at', { ascending: false }).limit(2000);
    const pn = Object.fromEntries(people.map(p => [p.id, p.name]));
    return <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="오늘의 콜 리스트" desc={tot ? `전체 ${tot}곳 · 남음 ${left}곳 · 사람 이름을 누르면 그 사람 리스트` : '오늘 배분된 리스트가 없습니다'} actions={<Link href="/leads" className="btn ghost">콜 리스트 관리 →</Link>} />
      <Section title="사람별" sub={today} flush>
        {Object.keys(per).length ? <div className="tbl-wrap"><table><thead><tr><th>영업사원</th><th className="num">배분</th><th className="num">남음</th><th className="num">관심</th><th className="num">계약</th><th className="num">거절·부재</th><th></th></tr></thead><tbody>
          {people.filter(p => per[p.id]).map(p => { const c = per[p.id]; const t = Object.values(c).reduce((a, b) => a + b, 0); return <tr key={p.id}><td><b>{p.name}</b></td><td className="num">{t}</td><td className="num">{c.assigned ?? 0}</td><td className="num">{c.interested ?? 0}</td><td className="num">{c.won ?? 0}</td><td className="num">{(c.rejected ?? 0) + (c.called ?? 0)}</td><td><Link href={`/calls?u=${p.id}`} className="help">리스트 보기 →</Link></td></tr>; })}
        </tbody></table></div> : <div style={{ padding: 20 }}><Empty>오늘 배분된 업체가 없습니다.</Empty></div>}
      </Section>
      <MyCustomers rows={(allC ?? []).map((c: any) => ({ ...c, who: pn[c.user_id] ?? '' })) as MyCustomer[]} canEdit={false} title="직원들이 적은 기존 고객 (콜 리스트 제외)" />
    </div>;
  }
  const target = (lead || mgr) && searchParams.u && people.some(p => p.id === searchParams.u) ? searchParams.u : me.id;
  const who = people.find(p => p.id === target)?.name ?? me.name;
  const h = headers(); const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const cols = 'id,store_name,store_url,keyword,category,phone,score,score_why,status,note,contact_round,rank_now,rank_prev';
  const [{ data: todayRows }, { data: follow }, { data: props }] = await Promise.all([
    sb.from('leads').select(cols).eq('assigned_to', target).eq('assigned_date', today).order('score', { ascending: false }),
    sb.from('leads').select(cols).eq('assigned_to', target).eq('status', 'interested').neq('assigned_date', today).order('last_result_at', { ascending: false }).limit(50),
    sb.from('proposals').select('code,lead_id,title,views,last_view_at').eq('owner_id', target).order('last_view_at', { ascending: false, nullsFirst: false }).limit(300),
  ]);
  const { data: myC } = await sb.from('my_customers').select('id,name,phone,memo,created_at').eq('user_id', target).order('created_at', { ascending: false });
  const t = (todayRows ?? []) as Lead[]; const left = t.filter(x => x.status === 'assigned').length;
  const ids = [...t, ...((follow ?? []) as Lead[])].map(x => x.id);
  const { data: hist } = ids.length ? await sb.from('lead_contacts').select('lead_id,user_id,round,status,note,created_at').in('lead_id', ids).order('created_at', { ascending: false }).limit(2000) : { data: [] as any[] };
  const uids = [...new Set((hist ?? []).map((h: any) => h.user_id).filter(Boolean))];
  const { data: names } = uids.length ? await sb.from('profiles').select('id,name').in('id', uids) : { data: [] as any[] };
  const nm = Object.fromEntries((names ?? []).map((x: any) => [x.id, x.name]));
  const history: Record<number, Hist[]> = {}; (hist ?? []).forEach((h: any) => { (history[h.lead_id] ??= []).push({ round: h.round, status: h.status, note: h.note, at: h.created_at, who: nm[h.user_id] ?? '' }); });
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title={target === me.id ? '오늘의 콜 리스트' : `${who} · 오늘의 콜 리스트`} actions={(lead || mgr) && people.length ? <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{lead && <Link href="/calls" className="btn ghost">전체 현황</Link>}{people.map(p => <Link key={p.id} href={`/calls?u=${p.id}`} className={`btn ${p.id === target ? '' : 'ghost'}`}>{p.name}</Link>)}</span> : undefined} desc={t.length ? `${t.length}곳 중 ${left}곳 남음 · 점수 높은 순` : '오늘 배분된 리스트가 없습니다'}
        help={<>평일 09:00에 점수 높은 업체부터 자동 배분됩니다. 결과를 안 남긴 건은 다음 날 다른 사람에게 다시 배분될 수 있습니다. 「+ 제안서 추적 링크」로 만든 링크를 고객에게 보내면, 고객이 열 때 알림이 오고 이 줄이 노랗게 표시됩니다.</>} />
      <Section title="오늘" flush>{t.length ? <CallsClient rows={t} props={(props ?? []) as Prop[]} origin={origin} history={history} /> : <div style={{ padding: 20 }}><Empty>오늘 배분된 업체가 없습니다.</Empty></div>}</Section>
      {follow?.length ? <Section title="관심 고객 팔로업" sub={`${follow.length}곳`} flush><CallsClient rows={follow as Lead[]} props={(props ?? []) as Prop[]} origin={origin} history={history} /></Section> : null}
      {(target === me.id || lead) && <MyCustomers rows={(myC ?? []) as MyCustomer[]} canEdit={target === me.id} title={target === me.id ? '내 고객 (콜 리스트 제외)' : `${who} 고객 (콜 리스트 제외)`} />}
    </div>
  );
}
