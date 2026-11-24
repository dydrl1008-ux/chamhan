// 키워드 콜 리스트 — 팀원 현황 (팀장=자기 팀, 총괄·어드민=전체). 결과를 남긴 업체 기준이라 결과를 안 누른 통화는 잡히지 않는다
import { supabaseAdmin } from '@/lib/supabase/admin';
import { todayKST, addDays, weekStartOf, fmtKST } from '@/lib/date/kst';
import type { Profile } from '@/lib/auth/session';
const RES = ['부재', '거절', '재연락', '관심', '계약'];
type Row = { id: number; claimed_by: string; result: string; result_at: string; store_name: string; keywords: string[]; memo: string };
export default async function TeamStats({ me }: { me: Profile }) {
  const boss = me.role === 'head' || me.role === 'admin'; if (!boss && me.role !== 'manager') return null;
  const sb = supabaseAdmin(); const today = todayKST(); const yday = addDays(today, -1); const wk = weekStartOf(today); const from = wk < yday ? wk : yday;
  const q = sb.from('v_sales_people').select('id,name,team_id').order('name');
  const { data: ppl } = boss ? await q : await q.eq('team_id', me.team_id ?? -1);
  const people = (ppl ?? []) as { id: string; name: string; team_id: number | null }[]; if (!people.length) return null;
  const { data, error } = await sb.from('kw_contacts').select('id,claimed_by,result,result_at,store_name,keywords,memo').in('claimed_by', people.map(p => p.id)).neq('result', '').gte('result_at', `${from}T00:00:00+09:00`).order('result_at', { ascending: false }).limit(5000);
  if (error) return null;
  // 다른 직원이 이어받은 업체의 전 담당자 기록(0091) 도 그 사람 콜로 센다
  const { data: lg } = await sb.from('kw_contact_logs').select('contact_id,user_id,result,memo,created_at').in('user_id', people.map(p => p.id)).neq('result', '').gte('created_at', `${from}T00:00:00+09:00`).limit(5000);
  const rows = [...(data ?? []) as Row[], ...(lg ?? []).map((l: any) => ({ id: -l.contact_id, claimed_by: l.user_id, result: l.result, result_at: l.created_at, store_name: '(이어받은 업체)', keywords: [], memo: l.memo }) as unknown as Row)].sort((a, b) => a.result_at < b.result_at ? 1 : -1); const dayOf = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const stat = people.map(p => { const mine = rows.filter(r => r.claimed_by === p.id); const by = (rs: Row[]) => Object.fromEntries(RES.map(k => [k, rs.filter(r => r.result === k).length])) as Record<string, number>;
    const t = mine.filter(r => dayOf(r.result_at) === today), y = mine.filter(r => dayOf(r.result_at) === yday), w = mine.filter(r => dayOf(r.result_at) >= wk);
    return { ...p, today: t.length, yday: y.length, week: w.length, wby: by(w), last: mine[0]?.result_at ?? null, recent: mine.slice(0, 40) }; }).sort((a, b) => b.week - a.week || b.today - a.today || a.name.localeCompare(b.name));
  const sum = (f: (s: typeof stat[number]) => number) => stat.reduce((a, s) => a + f(s), 0);
  const num = { textAlign: 'right' as const };
  return <div className="card" style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}><b>{boss ? '전체' : '우리 팀'} 키워드 콜 현황</b>
      <span className="help">결과를 남긴 업체 수 기준 · 이번 주 = {wk.slice(5).replace('-', '/')}(월)부터 · 이름을 누르면 최근 연락 내역</span></div>
    <div style={{ overflowX: 'auto' }}><table>
      <thead><tr><th>이름</th><th style={num}>오늘</th><th style={num}>어제</th><th style={num}>이번 주</th>{RES.map(k => <th key={k} style={num}>{k}</th>)}<th>마지막 기록</th></tr></thead>
      <tbody>
        {stat.map(s => <tr key={s.id} style={{ opacity: s.week ? 1 : .55 }}>
          <td><details><summary style={{ cursor: 'pointer', fontWeight: 700 }}>{s.name}</summary>
            {s.recent.length ? <div style={{ display: 'grid', gap: 3, margin: '6px 0', fontSize: 12.5, minWidth: 420 }}>{s.recent.map(r => <div key={r.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="cell-sub">{fmtKST(r.result_at)}</span><b style={{ color: r.result === '계약' ? '#067647' : r.result === '관심' ? '#B54708' : undefined }}>{r.result}</b><span>{r.store_name}</span><span className="cell-sub">{(r.keywords ?? []).slice(0, 2).join(', ')}</span>{r.memo && <span className="cell-sub">· {r.memo.slice(0, 60)}</span>}</div>)}</div>
              : <div className="cell-sub" style={{ margin: '6px 0' }}>이번 주 기록 없음</div>}
          </details></td>
          <td style={num}>{s.today || '-'}</td><td style={num}>{s.yday || '-'}</td><td style={{ ...num, fontWeight: 700 }}>{s.week || '-'}</td>
          {RES.map(k => <td key={k} style={{ ...num, color: s.wby[k] && (k === '관심' || k === '계약') ? '#067647' : undefined }}>{s.wby[k] || '-'}</td>)}
          <td className="cell-sub">{s.last ? fmtKST(s.last) : '기록 없음'}</td>
        </tr>)}
        <tr style={{ fontWeight: 700 }}><td>합계</td><td style={num}>{sum(s => s.today)}</td><td style={num}>{sum(s => s.yday)}</td><td style={num}>{sum(s => s.week)}</td>{RES.map(k => <td key={k} style={num}>{sum(s => s.wby[k])}</td>)}<td /></tr>
      </tbody>
    </table></div>
    <span className="help">오늘의 콜 리스트(자동 배분) 현황은 「오늘의 콜 리스트」에서 사람을 골라 볼 수 있습니다. 여기는 키워드 콜 리스트에 남긴 결과만 셉니다 — 워크허브 밖에서 건 전화는 잡히지 않습니다</span>
  </div>;
}
