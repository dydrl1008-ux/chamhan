// 메타 효율 — 메타팀 팀장 · 총괄 · 어드민만. 회사월(21일~20일)에 들어온 DB 기준으로 사람별 결제율 · DB 단가 · 광고비 대비 매출
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { todayKST, won } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, prevBizMonth, nextBizMonth, bizLabel } from '@/lib/date/period';
import { metaAccess } from '@/lib/meta';
import { PageHeader } from '@/components/ui';
import { metaPeople } from '../meta-db/actions';
import SpendForm from './SpendForm';
export const dynamic = 'force-dynamic';
const BASE = 2200000, RATE = 0.1;   // 메타팀 급여: 기본급 220만 + 결제 금액의 10% (10% 기준은 확인 전 — 결제 금액으로 가정)
type Agg = { n: number; valid: number; reached: number; paid: number; amt: number; cost: number; wait: number };
const zero = (): Agg => ({ n: 0, valid: 0, reached: 0, paid: 0, amt: 0, cost: 0, wait: 0 });
const pct = (a: number, b: number) => b ? (a / b * 100).toFixed(1) + '%' : '—';
export default async function MetaStatsPage({ searchParams }: { searchParams: { m?: string } }) {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const a = await metaAccess(me); if (!a.lead) redirect(a.ok ? '/meta-db' : '/');
  const cur = bizMonthOf(todayKST()); const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : cur; const [from, to] = bizMonthRange(month);
  const sb = supabaseAdmin(); const people = await metaPeople(); const rows: any[] = []; let err = '';
  for (let f = 0; f < 50000; f += 1000) { const { data, error } = await sb.from('meta_leads').select('owner_id,source,status,paid_amt,cost_amt').gte('received_on', from).lte('received_on', to).order('id').range(f, f + 999); if (error) { err = /cost_amt/.test(error.message) ? '0102 SQL(상품비 칸 · 메타 보고)을 먼저 실행해 주세요' : /meta_leads/.test(error.message) ? '0100 SQL(메타팀 표)을 먼저 실행해 주세요' : error.message; break; } rows.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  const { data: sp } = await sb.from('meta_ad_spend').select('amount').eq('month', month).eq('source', '전체').maybeSingle(); const spend = Number(sp?.amount ?? 0);
  const by = new Map<string, Agg>(), src = new Map<string, Agg>(), tot = zero();
  const put = (g: Agg, r: any) => { g.n++; if (r.status === '허수' || r.status === '중복') return; g.valid++; if (r.status === '미연락') g.wait++; if (r.status !== '미연락' && r.status !== '부재') g.reached++; if (r.status === '결제') { g.paid++; g.amt += Number(r.paid_amt ?? 0); g.cost += Number(r.cost_amt ?? 0); } };
  for (const r of rows) { const k = r.owner_id ?? 'none'; if (!by.has(k)) by.set(k, zero()); put(by.get(k)!, r); if (!src.has(r.source)) src.set(r.source, zero()); put(src.get(r.source)!, r); put(tot, r); }
  const unit = tot.valid ? spend / tot.valid : 0;   // 유효 DB 1건당 광고비 (허수·중복은 빼고 나눈다)
  const lines = [...people.map(p => ({ key: p.id, name: p.name + (p.role === 'manager' ? ' (팀장)' : ''), g: by.get(p.id) ?? zero() })), ...[...by.keys()].filter(k => k !== 'none' && !people.some(p => p.id === k)).map(k => ({ key: k, name: '(팀 밖 · 퇴사)', g: by.get(k)! })), ...(by.has('none') ? [{ key: 'none', name: '미배정', g: by.get('none')! }] : [])];
  const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }; const td: React.CSSProperties = { padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' };
  const row = (name: React.ReactNode, g: Agg, key: string, bold = false, pay = false) => { const cost = unit * g.valid; return <tr key={key} style={{ borderTop: '1px solid #EAECF0', fontWeight: bold ? 700 : 400, background: bold ? '#F9FAFB' : undefined }}>
    <td style={{ ...td, textAlign: 'left' }}>{name}</td><td style={td}>{g.n}</td><td style={td}>{g.valid}</td><td style={{ ...td, color: g.wait ? '#B54708' : '#98A2B3' }}>{g.wait}</td><td style={td}>{pct(g.reached, g.valid)}</td><td style={td}>{g.paid}</td><td style={{ ...td, color: '#B42318', fontWeight: 700 }}>{pct(g.paid, g.valid)}</td><td style={td}>{won(g.amt)}</td><td style={td}>{won(g.cost)}</td><td style={{ ...td, color: '#067647', fontWeight: 700 }}>{won(g.amt - g.cost)}</td>
    <td style={td}>{spend ? won(cost) : '—'}</td><td style={td}>{spend && g.paid ? won(cost / g.paid) : '—'}</td><td style={{ ...td, fontWeight: 700 }}>{spend && cost ? Math.round(g.amt / cost * 100) + '%' : '—'}</td>
    {a.boss && <td style={{ ...td, color: '#475467' }}>{pay ? won(BASE + g.amt * RATE) : ''}</td>}</tr>; };
  const card = (label: string, v: string, sub?: string) => <div className="card" style={{ flex: '1 1 150px', minWidth: 150 }}><div style={{ fontSize: 12.5, color: '#667085' }}>{label}</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{v}</div>{sub && <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{sub}</div>}</div>;
  return <>
    <PageHeader title="메타 효율" desc={`${bizLabel(month)} 에 들어온 DB 기준 · 허수 · 중복은 유효 DB 에서 뺍니다`} actions={<div style={{ display: 'flex', gap: 6 }}><Link className="btn ghost" href={`/meta-stats?m=${prevBizMonth(month)}`}>← 이전 달</Link>{month !== cur && <Link className="btn ghost" href="/meta-stats">이번 달</Link>}{month < cur && <Link className="btn ghost" href={`/meta-stats?m=${nextBizMonth(month)}`}>다음 달 →</Link>}</div>} />
    {err && <div className="card" style={{ color: '#B42318', marginBottom: 12 }}>{err}</div>}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      {card('받은 DB', String(tot.n), `유효 ${tot.valid} · 허수·중복 ${tot.n - tot.valid}`)}{card('결제율', pct(tot.paid, tot.valid), `결제 ${tot.paid}건 / 유효 ${tot.valid}건`)}{card('결제 금액', won(tot.amt), `상품비 ${won(tot.cost)}`)}{card('마진', won(tot.amt - tot.cost), spend ? `광고비 빼면 ${won(tot.amt - tot.cost - spend)}` : '결제 금액 - 상품비')}{card('광고비', spend ? won(spend) : '미입력', spend && tot.valid ? `유효 DB 1건당 ${won(unit)}` : undefined)}{card('광고비 대비 매출', spend ? Math.round(tot.amt / spend * 100) + '%' : '—', spend && tot.paid ? `결제 1건당 광고비 ${won(spend / tot.paid)}` : undefined)}
    </div>
    {a.boss && <SpendForm month={month} amount={spend} />}
    <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1160 }}>
        <thead><tr style={{ background: '#F9FAFB', color: '#475467', fontSize: 12.5 }}><th style={{ ...th, textAlign: 'left' }}>담당자</th>{['받은 DB', '유효 DB', '미연락', '연결률', '결제', '결제율', '결제 금액', '상품비', '마진', '광고비 부담', '결제당 광고비', '광고비 대비 매출'].concat(a.boss ? ['예상 급여'] : []).map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{lines.map(l => row(l.name, l.g, l.key, false, people.some(p => p.id === l.key)))}{row('합계', tot, 'tot', true)}{!rows.length && !err && <tr><td colSpan={a.boss ? 14 : 13} style={{ padding: 26, textAlign: 'center', color: '#98A2B3' }}>이 기간에 들어온 DB 가 없습니다</td></tr>}</tbody>
      </table>
    </div>
    {src.size > 0 && <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
        <thead><tr style={{ background: '#F9FAFB', color: '#475467', fontSize: 12.5 }}><th style={{ ...th, textAlign: 'left' }}>유입 구분</th>{['받은 DB', '유효 DB', '연결률', '결제', '결제율', '결제 금액'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{[...src].map(([k, g]) => <tr key={k} style={{ borderTop: '1px solid #EAECF0' }}><td style={{ ...td, textAlign: 'left' }}>{k}</td><td style={td}>{g.n}</td><td style={td}>{g.valid}</td><td style={td}>{pct(g.reached, g.valid)}</td><td style={td}>{g.paid}</td><td style={{ ...td, fontWeight: 700 }}>{pct(g.paid, g.valid)}</td><td style={td}>{won(g.amt)}</td></tr>)}</tbody>
      </table>
    </div>}
    <p style={{ fontSize: 12.5, color: '#667085', lineHeight: 1.7 }}>연결률 = 유효 DB 중 통화가 된 것(상담중 · 결제 · 종료) · 결제율 = 결제 ÷ 유효 DB · 마진 = 결제 금액 - 상품비(인바운드 DB 에서 입력) · 광고비 부담 = 광고비 ÷ 전체 유효 DB × 그 사람의 유효 DB · 결제는 DB 가 들어온 달에 잡힙니다(다음 달에 결제해도 들어온 달 실적){a.boss && <> · 예상 급여 = 기본급 220만 + 결제 금액의 10% (총괄 · 어드민에게만 보임)</>}</p>
  </>;
}
