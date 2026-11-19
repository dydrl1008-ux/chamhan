// 월간 보고 — 팀원 콜 리스트 현황 (오늘의 콜 리스트 + 키워드 콜 리스트를 한 표로). 팀장이 보고 쓰면서 바로 대조할 수 있게
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { todayKST, addDays, weekStartOf, fmtMD } from '@/lib/date/kst';
type Sm = { assigned_to: string | null; status: string; cnt: number };
export default async function TeamCalls({ teamId }: { teamId: number }) {
  const sb = supabaseServer(); const today = todayKST(); const yday = addDays(today, -1); const wk = weekStartOf(today);
  const { data: ppl } = await sb.from('v_sales_people').select('id,name,team_id').eq('team_id', teamId).order('name');
  const people = (ppl ?? []) as { id: string; name: string }[]; if (!people.length) return null; const ids = people.map(p => p.id);
  const [t, y, kw] = await Promise.all([
    sb.rpc('leads_today_summary', { p_date: today }),
    sb.rpc('leads_day_summary', { p_date: yday }),
    supabaseAdmin().from('kw_contacts').select('claimed_by,result,result_at').in('claimed_by', ids).neq('result', '').gte('result_at', `${wk < yday ? wk : yday}T00:00:00+09:00`).limit(5000),
  ]);
  const group = (rows: Sm[] | null) => { const m: Record<string, Record<string, number>> = {}; for (const r of rows ?? []) { if (!r.assigned_to) continue; (m[r.assigned_to] ??= {})[r.status] = ((m[r.assigned_to] ?? {})[r.status] ?? 0) + r.cnt; } return m; };
  const T = group(t.data as Sm[] | null), Y = group(y.data as Sm[] | null);
  const dayOf = (s: string) => new Date(new Date(s).getTime() + 9 * 3600e3).toISOString().slice(0, 10); const K = (kw.data ?? []) as { claimed_by: string; result: string; result_at: string }[];
  const rows = people.map(p => { const c = T[p.id] ?? {}, yc = Y[p.id] ?? {}; const tot = Object.values(c).reduce((a, b) => a + b, 0); const left = c.assigned ?? 0; const ytot = Object.values(yc).reduce((a, b) => a + b, 0);
    const mine = K.filter(k => k.claimed_by === p.id);
    return { ...p, tot, left, done: tot - left, hot: c.interested ?? 0, won: c.won ?? 0, no: (c.rejected ?? 0) + (c.called ?? 0), ydone: ytot - (yc.assigned ?? 0), yhot: yc.interested ?? 0,
      kt: mine.filter(k => dayOf(k.result_at) === today).length, ky: mine.filter(k => dayOf(k.result_at) === yday).length, kw: mine.filter(k => dayOf(k.result_at) >= wk).length, khot: mine.filter(k => dayOf(k.result_at) >= wk && (k.result === '관심' || k.result === '계약')).length }; });
  const S = (f: (r: typeof rows[number]) => number) => rows.reduce((a, r) => a + f(r), 0); const n = { textAlign: 'right' as const }; const v = (x: number) => x || '-';
  const sep = { borderLeft: '2px solid var(--line, #E4E7EC)' };
  return <div className="card" style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}><b>팀원 콜 리스트 현황</b><span className="help">오늘 {fmtMD(today)} · 어제 {fmtMD(yday)} · 이번 주 {fmtMD(wk)}(월)부터 · 결과를 남긴 건 기준 — 지시한 수량과 바로 대조해 보세요</span></div>
    <div style={{ overflowX: 'auto' }}><table>
      <thead>
        <tr><th rowSpan={2}>이름</th><th colSpan={6} style={{ textAlign: 'center' }}>오늘의 콜 리스트 (오늘)</th><th colSpan={2} style={{ textAlign: 'center', ...sep }}>어제</th><th colSpan={4} style={{ textAlign: 'center', ...sep }}>키워드 콜 리스트</th><th rowSpan={2} /></tr>
        <tr><th style={n}>배분</th><th style={n}>남음</th><th style={n}>처리</th><th style={n}>관심</th><th style={n}>계약</th><th style={n}>거절·부재</th><th style={{ ...n, ...sep }}>처리</th><th style={n}>관심</th><th style={{ ...n, ...sep }}>오늘</th><th style={n}>어제</th><th style={n}>이번 주</th><th style={n}>관심·계약</th></tr>
      </thead>
      <tbody>
        {rows.map(r => <tr key={r.id}><td><b>{r.name}</b></td>
          <td style={n}>{v(r.tot)}</td><td style={n}>{v(r.left)}</td><td style={{ ...n, fontWeight: 700, color: r.tot && !r.done ? '#B42318' : undefined }}>{r.tot ? r.done : '-'}</td><td style={{ ...n, color: r.hot ? '#067647' : undefined }}>{v(r.hot)}</td><td style={{ ...n, color: r.won ? '#067647' : undefined }}>{v(r.won)}</td><td style={n}>{v(r.no)}</td>
          <td style={{ ...n, ...sep, fontWeight: 700 }}>{v(r.ydone)}</td><td style={n}>{v(r.yhot)}</td>
          <td style={{ ...n, ...sep, fontWeight: 700 }}>{v(r.kt)}</td><td style={n}>{v(r.ky)}</td><td style={n}>{v(r.kw)}</td><td style={{ ...n, color: r.khot ? '#067647' : undefined }}>{v(r.khot)}</td>
          <td><Link href={`/calls?u=${r.id}`} className="help">리스트 →</Link></td></tr>)}
        <tr style={{ fontWeight: 700 }}><td>합계</td><td style={n}>{S(r => r.tot)}</td><td style={n}>{S(r => r.left)}</td><td style={n}>{S(r => r.done)}</td><td style={n}>{S(r => r.hot)}</td><td style={n}>{S(r => r.won)}</td><td style={n}>{S(r => r.no)}</td>
          <td style={{ ...n, ...sep }}>{S(r => r.ydone)}</td><td style={n}>{S(r => r.yhot)}</td><td style={{ ...n, ...sep }}>{S(r => r.kt)}</td><td style={n}>{S(r => r.ky)}</td><td style={n}>{S(r => r.kw)}</td><td style={n}>{S(r => r.khot)}</td><td /></tr>
      </tbody>
    </table></div>
    <span className="help">「처리」 = 배분받은 것 중 결과(관심·계약·거절·부재)를 남긴 건수. 워크허브 밖에서 건 전화는 잡히지 않습니다. 키워드 콜 상세는 <Link href="/kw-calls">키워드 콜 리스트</Link> 맨 위 표에서 이름을 누르면 보입니다</span>
  </div>;
}
