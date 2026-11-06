import { headers } from 'next/headers';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { todayKST, addDays, fmtMD } from '@/lib/date/kst';
import Link from 'next/link';
import { PageHeader, Section, Empty } from '@/components/ui';
import CallsClient, { type Lead, type Prop, type Hist } from './CallsClient';
import { leadIndexes } from '@/lib/leadIndex';
import MyCustomers, { type MyCustomer } from './MyCustomers';
import CallTabs from './CallTabs';
export const dynamic = 'force-dynamic';

/** 오늘의 콜 리스트 — 영업사원 본인 배정분(오늘) · 관심 · 계약 탭. 총괄·대표·팀장은 사람 골라서 보기 (팀장은 팀원만) */
export default async function CallsPage({ searchParams }: { searchParams: { u?: string; d?: string; t?: string } }) {
  const me = (await getProfile())!;
  const sb = supabaseServer(); const today = todayKST();
  // 날짜 이동 (팀장·총괄·대표만, 오늘 이전만). 결과 안 남긴 건은 다음 날 다시 풀리므로 지난 날짜엔 결과 남긴 건만 남음
  const canNav = me.role !== 'staff';
  const day = canNav && searchParams.d && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d) && searchParams.d < today ? searchParams.d : today;
  const isToday = day === today; const dayLabel = isToday ? '오늘' : fmtMD(day);
  const qs = (d: string, u?: string) => `/calls?${[u ? `u=${u}` : '', d !== today ? `d=${d}` : ''].filter(Boolean).join('&')}`;
  const dateNav = canNav ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
    <Link href={qs(addDays(day, -1), searchParams.u)} className="btn ghost" style={{ padding: '4px 10px' }}>◀ {fmtMD(addDays(day, -1))}</Link>
    {!isToday && <Link href={qs(today, searchParams.u)} className="btn ghost" style={{ padding: '4px 10px' }}>오늘</Link>}
    {!isToday && <Link href={qs(addDays(day, 1), searchParams.u)} className="btn ghost" style={{ padding: '4px 10px' }}>{fmtMD(addDays(day, 1))} ▶</Link>}
    <form action="/calls" style={{ display: 'inline' }}>{searchParams.u && <input type="hidden" name="u" value={searchParams.u} />}<input type="date" name="d" defaultValue={day} max={today} style={{ padding: '4px 8px', fontSize: 13 }} /><button className="btn ghost" style={{ padding: '4px 10px', marginLeft: 4 }}>이동</button></form>
  </span> : null;
  const lead = me.role === 'admin' || me.role === 'head'; const mgr = me.role === 'manager';
  let people: { id: string; name: string; team_id: number | null }[] = [];
  if (lead || mgr) { const q = sb.from('v_sales_people').select('id,name,team_id').order('name'); const { data } = mgr ? await q.eq('team_id', me.team_id ?? -1) : await q; people = (data ?? []) as any[]; }
  if (lead && !searchParams.u) {   // 총괄·대표: 사람별 오늘 현황 한눈에 → 이름 누르면 그 사람 리스트
    // 오늘은 현재 상태, 지난 날짜는 배분 이력(lead_assignments) + 그날 콜 기록 기준 (0072)
    const { data: rows } = isToday ? await sb.rpc('leads_today_summary', { p_date: day }) : await sb.rpc('leads_day_summary', { p_date: day }).then(r => r.error ? sb.rpc('leads_today_summary', { p_date: day }) : r);
    const sm = (rows ?? []) as { assigned_to: string | null; status: string; cnt: number }[];
    const per: Record<string, Record<string, number>> = {}; sm.forEach(r => { const k = r.assigned_to ?? '-'; per[k] = per[k] ?? {}; per[k][r.status] = (per[k][r.status] ?? 0) + r.cnt; });
    const tot = sm.reduce((a, r) => a + r.cnt, 0); const left = sm.filter(r => r.status === 'assigned').reduce((a, r) => a + r.cnt, 0);
    const { data: allC } = await sb.from('my_customers').select('id,name,phone,memo,created_at,user_id').order('created_at', { ascending: false }).limit(2000);
    const pn = Object.fromEntries(people.map(p => [p.id, p.name]));
    return <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title={isToday ? '오늘의 콜 리스트' : `콜 리스트 · ${dayLabel}`} desc={tot ? `전체 ${tot}곳 · 남음 ${left}곳 · 사람 이름을 누르면 그 사람 리스트${isToday ? '' : ' · 배분 이력 기준'}` : `${dayLabel} 배분된 리스트가 없습니다`} actions={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{dateNav}<Link href="/leads" className="btn ghost">콜 리스트 관리 →</Link></span>} />
      <Section title="사람별" sub={day} flush>
        {Object.keys(per).length ? <div className="tbl-wrap"><table><thead><tr><th>영업사원</th><th className="num">배분</th><th className="num">남음</th><th className="num">관심</th><th className="num">계약</th><th className="num">거절·부재</th><th></th></tr></thead><tbody>
          {people.filter(p => per[p.id]).map(p => { const c = per[p.id]; const t = Object.values(c).reduce((a, b) => a + b, 0); return <tr key={p.id}><td><b>{p.name}</b></td><td className="num">{t}</td><td className="num">{c.assigned ?? 0}</td><td className="num">{c.interested ?? 0}</td><td className="num">{c.won ?? 0}</td><td className="num">{(c.rejected ?? 0) + (c.called ?? 0)}</td><td><Link href={qs(day, p.id)} className="help">리스트 보기 →</Link></td></tr>; })}
        </tbody></table></div> : <div style={{ padding: 20 }}><Empty>오늘 배분된 업체가 없습니다.</Empty></div>}
      </Section>
      <MyCustomers rows={(allC ?? []).map((c: any) => ({ ...c, who: pn[c.user_id] ?? '' })) as MyCustomer[]} canEdit={false} title="직원들이 적은 기존 고객 (콜 리스트 제외)" />
    </div>;
  }
  const target = (lead || mgr) && searchParams.u && people.some(p => p.id === searchParams.u) ? searchParams.u : me.id;
  const who = people.find(p => p.id === target)?.name ?? me.name;
  const h = headers(); const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const cols = 'id,store_name,store_url,product_url,keyword,category,phone,score,score_why,status,note,contact_round,rank_now,rank_prev,next_contact_on';
  const [{ data: todayRows }, { data: follow }, { data: wonRows }, { data: props }] = await Promise.all([
    isToday ? sb.from('leads').select(cols).eq('assigned_to', target).eq('assigned_date', day).order('score', { ascending: false }).order('id', { ascending: true }).range(0, 4999)   // 점수 같으면 id 순 → 번호 고정
      : sb.rpc('leads_day_list', { p_date: day, p_user: target }).then(r => r.error ? sb.from('leads').select(cols).eq('assigned_to', target).eq('assigned_date', day).order('score', { ascending: false }).order('id', { ascending: true }).range(0, 4999) : r),   // 지난 날짜: 배분 이력 + 그날 결과 (0072)
    isToday ? sb.from('leads').select(cols).eq('assigned_to', target).eq('status', 'interested').order('last_result_at', { ascending: false }).order('id', { ascending: true }).limit(300) : Promise.resolve({ data: [] as any[] }),   // 관심: 오늘 포함 전부
    isToday ? sb.from('leads').select(cols).eq('assigned_to', target).eq('status', 'won').order('last_result_at', { ascending: false }).order('id', { ascending: true }).limit(300) : Promise.resolve({ data: [] as any[] }),   // 계약 전부
    sb.from('proposals').select('code,lead_id,title,views,last_view_at').eq('owner_id', target).order('last_view_at', { ascending: false, nullsFirst: false }).limit(300),
  ]);
  const { data: myC } = await sb.from('my_customers').select('id,name,phone,memo,created_at').eq('user_id', target).order('created_at', { ascending: false });
  const t0 = (todayRows ?? []) as Lead[]; const t = [...t0.filter(x => x.next_contact_on && x.next_contact_on <= today), ...t0.filter(x => !(x.next_contact_on && x.next_contact_on <= today))];   // 약속 팔로업 먼저
  const left = t.filter(x => x.status === 'assigned').length;
  // 탭: 오늘(관심·계약으로 넘어간 건 제외) / 관심 전부 / 계약 전부. 지난 날짜는 그날 리스트만
  const todayTab = isToday ? t.filter(x => x.status !== 'interested' && x.status !== 'won') : t;
  const interested = (follow ?? []) as Lead[]; const wonL = (wonRows ?? []) as Lead[];
  const all = [...t, ...interested, ...wonL].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
  const ids = all.map(x => x.id);
  const { data: hist } = ids.length ? await sb.from('lead_contacts').select('lead_id,user_id,round,status,note,created_at').in('lead_id', ids).order('created_at', { ascending: false }).limit(2000) : { data: [] as any[] };
  const uids = [...new Set((hist ?? []).map((h: any) => h.user_id).filter(Boolean))];
  const { data: names } = uids.length ? await supabaseAdmin().from('profiles').select('id,name').in('id', uids) : { data: [] as any[] };   // 다른 팀 사람 이름도 보이게 (RLS 우회, 이름만)
  const nm = Object.fromEntries((names ?? []).map((x: any) => [x.id, x.name]));
  const idx = await leadIndexes(all.map(x => ({ id: x.id, keyword: x.keyword, product_url: x.product_url, store_name: x.store_name, category: x.category })));
  const history: Record<number, Hist[]> = {}; (hist ?? []).forEach((h: any) => { (history[h.lead_id] ??= []).push({ round: h.round, status: h.status, note: h.note, at: h.created_at, who: nm[h.user_id] ?? '' }); });
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title={(target === me.id ? '' : `${who} · `) + (isToday ? '오늘의 콜 리스트' : `콜 리스트 · ${dayLabel}`)} actions={(lead || mgr) && people.length ? <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{dateNav}{lead && <Link href={qs(day)} className="btn ghost">전체 현황</Link>}{people.map(p => <Link key={p.id} href={qs(day, p.id)} className={`btn ${p.id === target ? '' : 'ghost'}`}>{p.name}</Link>)}</span> : undefined} desc={isToday ? `오늘 ${t.length}곳 중 ${left}곳 남음 · 관심 ${interested.length} · 계약 ${wonL.length}` : t.length ? `${t.length}곳 · 배분 이력 기준` : `${dayLabel} 배분된 리스트가 없습니다`}
        help={<>평일 09:00에 점수 높은 업체부터 자동 배분됩니다. 결과를 안 남긴 건은 다음 날 다른 사람에게 다시 배분될 수 있습니다. 「+ 제안서 추적 링크」로 만든 링크를 고객에게 보내면, 고객이 열 때 알림이 오고 이 줄이 노랗게 표시됩니다.</>} />
      <CallTabs initial={searchParams.t} props={(props ?? []) as Prop[]} origin={(process.env.NEXT_PUBLIC_PROPOSAL_URL || '').replace(/\/$/, '') || origin} history={history} indexes={idx}
        tabs={isToday ? [
          { key: 'today', label: '오늘', rows: todayTab, empty: '오늘 배분된 업체가 없습니다.', sub: `남음 ${left}곳 · 점수 높은 순 · 관심·계약으로 바꾼 건은 해당 탭으로` },
          { key: 'interested', label: '관심', rows: interested, empty: '관심으로 남긴 업체가 없습니다.', sub: '최근 결과 순 · 약속 날짜 지난 건 먼저 연락' },
          { key: 'won', label: '계약', rows: wonL, empty: '계약한 업체가 없습니다.', sub: '최근 계약 순' },
        ] : [{ key: 'today', label: dayLabel, rows: t, empty: `${dayLabel} 배분된 업체가 없습니다.`, sub: '배분 이력 기준' }]} />
      {(target === me.id || lead) && <MyCustomers rows={(myC ?? []) as MyCustomer[]} canEdit={target === me.id} title={target === me.id ? '내 고객 (콜 리스트 제외)' : `${who} 고객 (콜 리스트 제외)`} />}
    </div>
  );
}
