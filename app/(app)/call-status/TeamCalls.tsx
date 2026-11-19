// 콜 리스트 현황 — 팀원별 오늘의 콜 리스트 + 키워드 콜 리스트를 기간(하루~14일) 합산으로 (팀장=자기 팀, 총괄·어드민=전 팀)
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { todayKST, addDays, fmtMD } from '@/lib/date/kst';
type Sm = { assigned_to: string | null; status: string; cnt: number };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dow = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();
export default async function TeamCalls({ teamId, teamName, from, to }: { teamId: number; teamName: string; from: string; to: string }) {
  const sb = supabaseServer(); const today = todayKST();
  const { data: ppl } = await sb.from('v_sales_people').select('id,name,team_id').eq('team_id', teamId).order('name');
  const people = (ppl ?? []) as { id: string; name: string }[]; if (!people.length) return null; const ids = people.map(p => p.id);
  const days: string[] = []; for (let d = from; d <= to && days.length < 14; d = addDays(d, 1)) days.push(d);
  const [sums, kw] = await Promise.all([
    Promise.all(days.map(d => (d === today ? sb.rpc('leads_today_summary', { p_date: d }) : sb.rpc('leads_day_summary', { p_date: d })).then(r => (r.data ?? []) as Sm[]))),
    supabaseAdmin().from('kw_contacts').select('claimed_by,result,result_at').in('claimed_by', ids).neq('result', '').gte('result_at', `${from}T00:00:00+09:00`).lt('result_at', `${addDays(to, 1)}T00:00:00+09:00`).limit(10000),
  ]);
  const K = (kw.data ?? []) as { claimed_by: string; result: string; result_at: string }[];
  const workdays = Math.max(1, days.filter(d => d <= today && dow(d) >= 1 && dow(d) <= 5).length); const single = days.length === 1; const hasToday = days.includes(today);
  const rows = people.map(p => {
    const per = sums.map(s => { const c: Record<string, number> = {}; for (const r of s) if (r.assigned_to === p.id) c[r.status] = (c[r.status] ?? 0) + r.cnt; const tot = Object.values(c).reduce((a, b) => a + b, 0); return { tot, left: c.assigned ?? 0, done: tot - (c.assigned ?? 0), hot: c.interested ?? 0, won: c.won ?? 0, no: (c.rejected ?? 0) + (c.called ?? 0) }; });
    const sum = (f: (x: typeof per[number]) => number) => per.reduce((a, x) => a + f(x), 0); const mine = K.filter(k => k.claimed_by === p.id); const ti = days.indexOf(today);
    return { ...p, per, done: sum(x => x.done), hot: sum(x => x.hot), won: sum(x => x.won), no: sum(x => x.no), tot: sum(x => x.tot), left: ti >= 0 ? per[ti].left : 0, kw: mine.length, khot: mine.filter(k => k.result === '관심' || k.result === '계약').length };
  });
  const S = (f: (r: typeof rows[number]) => number) => rows.reduce((a, r) => a + f(r), 0); const n = { textAlign: 'right' as const }; const v = (x: number) => x || '-'; const sep = { borderLeft: '2px solid var(--line, #E4E7EC)' };
  return <div className="card" style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}><b>{teamName}</b><span className="cell-sub">{people.length}명 · {single ? fmtMD(from) : `${fmtMD(from)} ~ ${fmtMD(to)} (근무일 ${workdays}일)`}</span></div>
    <div style={{ overflowX: 'auto' }}><table>
      <thead><tr><th>이름</th>
        {!single && days.map(d => <th key={d} style={{ ...n, color: dow(d) === 0 || dow(d) === 6 ? 'var(--muted)' : undefined }}>{fmtMD(d)}<br /><span style={{ fontWeight: 400 }}>{DOW[dow(d)]}</span></th>)}
        {single && <th style={n}>배분</th>}{hasToday && <th style={n}>오늘 남음</th>}
        <th style={{ ...n, ...sep }}>처리{single ? '' : ' 합계'}</th>{!single && <th style={n}>일평균</th>}<th style={n}>관심</th><th style={n}>계약</th><th style={n}>거절·부재</th>
        <th style={{ ...n, ...sep }}>키워드 콜</th><th style={n}>관심·계약</th><th style={{ ...n, ...sep }}>전체 합계</th><th /></tr></thead>
      <tbody>
        {rows.map(r => <tr key={r.id}><td><b>{r.name}</b></td>
          {!single && r.per.map((x, i) => <td key={days[i]} style={{ ...n, color: !x.done && x.tot ? '#B42318' : undefined }}>{v(x.done)}</td>)}
          {single && <td style={n}>{v(r.tot)}</td>}{hasToday && <td style={n}>{v(r.left)}</td>}
          <td style={{ ...n, ...sep, fontWeight: 700, color: !r.done && r.tot ? '#B42318' : undefined }}>{r.tot ? r.done : '-'}</td>{!single && <td style={n}>{r.done ? Math.round(r.done / workdays) : '-'}</td>}
          <td style={{ ...n, color: r.hot ? '#067647' : undefined }}>{v(r.hot)}</td><td style={{ ...n, color: r.won ? '#067647' : undefined }}>{v(r.won)}</td><td style={n}>{v(r.no)}</td>
          <td style={{ ...n, ...sep, fontWeight: 700 }}>{v(r.kw)}</td><td style={{ ...n, color: r.khot ? '#067647' : undefined }}>{v(r.khot)}</td>
          <td style={{ ...n, ...sep, fontWeight: 700 }}>{v(r.done + r.kw)}</td>
          <td><Link href={`/calls?u=${r.id}${single && from < today ? `&d=${from}` : ''}`} className="help">리스트 →</Link></td></tr>)}
        <tr style={{ fontWeight: 700 }}><td>합계</td>
          {!single && days.map((d, i) => <td key={d} style={n}>{S(r => r.per[i].done)}</td>)}{single && <td style={n}>{S(r => r.tot)}</td>}{hasToday && <td style={n}>{S(r => r.left)}</td>}
          <td style={{ ...n, ...sep }}>{S(r => r.done)}</td>{!single && <td style={n}>{Math.round(S(r => r.done) / workdays)}</td>}<td style={n}>{S(r => r.hot)}</td><td style={n}>{S(r => r.won)}</td><td style={n}>{S(r => r.no)}</td>
          <td style={{ ...n, ...sep }}>{S(r => r.kw)}</td><td style={n}>{S(r => r.khot)}</td><td style={{ ...n, ...sep }}>{S(r => r.done + r.kw)}</td><td /></tr>
      </tbody>
    </table></div>
  </div>;
}
