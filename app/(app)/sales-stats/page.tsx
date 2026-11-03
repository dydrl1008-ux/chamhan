// 콜 성과 — 직원별 콜·결과·전환율, 제안서 링크 열람→계약, 키워드별 성사율, 일별 추이. 팀장: 팀 / 총괄·대표·관리팀: 전체
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader, Section, Empty, Status } from '@/components/ui';
import { todayKST, addDays, fmtMD } from '@/lib/date/kst';
export const dynamic = 'force-dynamic';

const ST: Record<string, string> = { called: '부재', interested: '관심', rejected: '거절', won: '계약', excluded: '대상 아님' };
const kstDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
/** 회사월(21일~20일) 시작일 */
function companyMonthStart(d: string) { const [y, m, day] = d.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, 21)); if (day < 21) dt.setUTCMonth(dt.getUTCMonth() - 1); return dt.toISOString().slice(0, 10); }
const pct = (a: number, b: number) => b ? `${Math.round((a / b) * 100)}%` : '-';

export default async function SalesStatsPage({ searchParams }: { searchParams: { p?: string } }) {
  const me = (await getProfile())!;
  if (me.role === 'staff') return <div style={{ display: 'grid', gap: 14 }}><PageHeader title="콜 성과" /><div className="card"><Empty>팀장·총괄만 볼 수 있습니다.</Empty></div></div>;
  const today = todayKST(); const period = searchParams.p === 'today' ? 'today' : searchParams.p === 'month' ? 'month' : '7d';
  const from = period === 'today' ? today : period === 'month' ? companyMonthStart(today) : addDays(today, -6);
  const since = new Date(from + 'T00:00:00+09:00').toISOString();
  const sb = supabaseAdmin();
  const all = me.role === 'admin' || me.role === 'head' || me.is_mgmt;
  const { data: profs } = await sb.from('profiles').select('id,name,team_id,is_active,role').eq('is_active', true);
  const people = (profs ?? []).filter(p => all || p.team_id === me.team_id).filter(p => p.role !== 'admin');
  const ids = new Set(people.map(p => p.id)); const nm = new Map(people.map(p => [p.id, p.name]));
  const [{ data: contacts }, { data: props }, { data: assigned }] = await Promise.all([
    sb.from('lead_contacts').select('lead_id,user_id,status,created_at, leads!inner(keyword,status)').gte('created_at', since).limit(50000),
    sb.from('proposals').select('code,lead_id,owner_id,views,created_at, leads(status)').gte('created_at', since).limit(20000),
    sb.from('leads').select('assigned_to').eq('assigned_date', today).not('assigned_to', 'is', null),
  ]);
  const cs = (contacts ?? []).filter((c: any) => c.user_id && ids.has(c.user_id)) as any[];
  const ps = (props ?? []).filter((p: any) => p.owner_id && ids.has(p.owner_id)) as any[];
  const asg = new Map<string, number>(); (assigned ?? []).forEach((a: any) => asg.set(a.assigned_to, (asg.get(a.assigned_to) ?? 0) + 1));

  // 직원별
  const byUser = new Map<string, { calls: number; called: number; rejected: number; interested: number; won: number; links: number; viewed: number; viewedWon: number }>();
  const u = (id: string) => { let x = byUser.get(id); if (!x) { x = { calls: 0, called: 0, rejected: 0, interested: 0, won: 0, links: 0, viewed: 0, viewedWon: 0 }; byUser.set(id, x); } return x; };
  for (const c of cs) { const x = u(c.user_id); x.calls++; if (c.status in x) (x as any)[c.status]++; }
  for (const p of ps) { const x = u(p.owner_id); x.links++; if (p.views > 0) { x.viewed++; if (p.leads?.status === 'won') x.viewedWon++; } }
  const rows = people.map(p => ({ id: p.id, name: p.name, today: asg.get(p.id) ?? 0, ...u(p.id) })).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  const tot = rows.reduce((t, r) => ({ calls: t.calls + r.calls, called: t.called + r.called, rejected: t.rejected + r.rejected, interested: t.interested + r.interested, won: t.won + r.won, links: t.links + r.links, viewed: t.viewed + r.viewed, viewedWon: t.viewedWon + r.viewedWon, today: t.today + r.today }), { calls: 0, called: 0, rejected: 0, interested: 0, won: 0, links: 0, viewed: 0, viewedWon: 0, today: 0 });

  // 키워드별
  const byKw = new Map<string, { calls: number; interested: number; won: number; rejected: number }>();
  for (const c of cs) { const k = c.leads?.keyword || '(없음)'; let x = byKw.get(k); if (!x) { x = { calls: 0, interested: 0, won: 0, rejected: 0 }; byKw.set(k, x); } x.calls++; if (c.status === 'interested') x.interested++; if (c.status === 'won') x.won++; if (c.status === 'rejected') x.rejected++; }
  const kws = [...byKw.entries()].map(([k, v]) => ({ k, ...v, rate: v.calls ? (v.won + v.interested * 0.3) / v.calls : 0 })).sort((a, b) => b.won - a.won || b.interested - a.interested || b.calls - a.calls).slice(0, 30);

  // 일별
  const days: string[] = []; for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);
  const daily = days.map(d => ({ d, calls: cs.filter(c => kstDay(c.created_at) === d).length, won: cs.filter(c => c.status === 'won' && kstDay(c.created_at) === d).length, interested: cs.filter(c => c.status === 'interested' && kstDay(c.created_at) === d).length }));
  const mx = Math.max(...daily.map(x => x.calls), 1);

  const tab = (k: string, label: string) => <a href={`/sales-stats?p=${k}`} className={`btn ${period === k ? '' : 'ghost'}`} style={{ padding: '4px 12px' }}>{label}</a>;
  return <div style={{ display: 'grid', gap: 14 }}>
    <PageHeader title="콜 성과" desc={`${fmtMD(from)} ~ ${fmtMD(today)} · 콜 기록(lead_contacts) 기준 · ${all ? '전체' : '우리 팀'}`} actions={<span style={{ display: 'flex', gap: 6 }}>{tab('today', '오늘')}{tab('7d', '7일')}{tab('month', '회사월')}</span>} />
    <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12 }}>
      {[['콜 기록', tot.calls, `오늘 배분 ${tot.today}건`], ['관심', tot.interested, pct(tot.interested, tot.calls) + ' of 콜'], ['계약', tot.won, pct(tot.won, tot.calls) + ' 전환'], ['제안서 링크', tot.links, `열람 ${tot.viewed}건 (${pct(tot.viewed, tot.links)})`], ['열람 → 계약', tot.viewedWon, pct(tot.viewedWon, tot.viewed)]].map(([l, v, d]) => <div className="card" key={String(l)} style={{ padding: '12px 14px' }}><div className="cell-sub">{l}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{v}</div><div className="cell-sub">{d}</div></div>)}
    </div>
    <Section title="직원별" flush>
      {rows.length === 0 ? <div style={{ padding: 16 }}><Empty>기록 없음</Empty></div> : <table><thead><tr><th>담당자</th><th className="num">오늘 배분</th><th className="num">콜 기록</th><th className="num">부재</th><th className="num">거절</th><th className="num">관심</th><th className="num">계약</th><th className="num">콜→계약</th><th className="num">링크</th><th className="num">열람</th><th className="num">열람→계약</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.id} style={{ opacity: r.calls || r.today ? 1 : .5 }}><td><b>{r.name}</b>{!r.calls && r.today > 0 && <span style={{ marginLeft: 6 }}><Status kind="bad">콜 0</Status></span>}</td><td className="num">{r.today}</td><td className="num" style={{ fontWeight: 700 }}>{r.calls}</td><td className="num">{r.called}</td><td className="num">{r.rejected}</td><td className="num">{r.interested}</td><td className="num" style={{ fontWeight: 700, color: r.won ? 'var(--ok-ink)' : undefined }}>{r.won}</td><td className="num">{pct(r.won, r.calls)}</td><td className="num">{r.links}</td><td className="num">{r.viewed}</td><td className="num">{r.viewedWon}{r.viewed ? ` (${pct(r.viewedWon, r.viewed)})` : ''}</td></tr>)}
        <tr style={{ background: 'var(--bg)', fontWeight: 700 }}><td>합계</td><td className="num">{tot.today}</td><td className="num">{tot.calls}</td><td className="num">{tot.called}</td><td className="num">{tot.rejected}</td><td className="num">{tot.interested}</td><td className="num">{tot.won}</td><td className="num">{pct(tot.won, tot.calls)}</td><td className="num">{tot.links}</td><td className="num">{tot.viewed}</td><td className="num">{tot.viewedWon}</td></tr>
      </tbody></table>}
    </Section>
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
      <Section title="키워드별" sub="계약·관심 많은 순 · 상위 30" flush>
        {kws.length === 0 ? <div style={{ padding: 16 }}><Empty>기록 없음</Empty></div> : <table><thead><tr><th>키워드</th><th className="num">콜</th><th className="num">거절</th><th className="num">관심</th><th className="num">계약</th><th className="num">성사율</th></tr></thead><tbody>
          {kws.map(k => <tr key={k.k}><td><b>{k.k}</b></td><td className="num">{k.calls}</td><td className="num">{k.rejected}</td><td className="num">{k.interested}</td><td className="num" style={{ fontWeight: 700, color: k.won ? 'var(--ok-ink)' : undefined }}>{k.won}</td><td className="num">{pct(k.won, k.calls)}</td></tr>)}
        </tbody></table>}
      </Section>
      <Section title="일별" sub="콜 수 · 관심 · 계약">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, padding: '8px 4px 0' }}>
          {daily.map(x => <div key={x.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', minWidth: 0 }} title={`${x.d} 콜 ${x.calls} · 관심 ${x.interested} · 계약 ${x.won}`}>
            <div className="cell-sub" style={{ fontSize: 11 }}>{x.calls}{x.won ? <b style={{ color: 'var(--ok-ink)' }}> ·{x.won}</b> : ''}</div>
            <div style={{ width: '100%', height: `${Math.max(2, (x.calls / mx) * 110)}px`, background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: x.d === today ? 1 : .7 }} />
            <div className="cell-sub" style={{ fontSize: 10, marginTop: 4 }}>{daily.length > 14 ? x.d.slice(8) : fmtMD(x.d)}</div>
          </div>)}
        </div>
      </Section>
    </div>
  </div>;
}
