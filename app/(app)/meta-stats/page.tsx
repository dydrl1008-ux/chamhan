// 메타 효율 — 메타팀 팀장 · 총괄 · 어드민만. 회사월(21일~20일) 단위. DB 숫자는 들어온 달, 결제 숫자는 결제한 달(결제 내역 · VAT 제외) 기준. 마감한 달은 저장본으로 고정
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getProfile } from '@/lib/auth/session';
import { todayKST, won, fmtKST } from '@/lib/date/kst';
import { bizMonthOf, prevBizMonth, nextBizMonth, bizLabel } from '@/lib/date/period';
import { metaAccess } from '@/lib/meta';
import { computeMetaStats, closedStats, statsSqlMsg, type MetaStats, type StatLine } from '@/lib/metaStats';
import { PageHeader } from '@/components/ui';
import { metaPeople } from '../meta-db/actions';
import SpendForm from './SpendForm';
import CloseButton from './CloseButton';
export const dynamic = 'force-dynamic';
const BASE = 2200000, RATE = 0.1;   // 메타팀 급여: 기본급 220만 + 그 달 결제 금액의 10% (10% 기준은 확인 전 — 결제 금액으로 가정)
const pct = (a: number, b: number) => b ? (a / b * 100).toFixed(1) + '%' : '—';
export default async function MetaStatsPage({ searchParams }: { searchParams: { m?: string } }) {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const a = await metaAccess(me); if (!a.lead) redirect(a.ok ? '/my-db' : '/');
  const cur = bizMonthOf(todayKST()); const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : cur;
  let live: MetaStats | null = null, closed: Awaited<ReturnType<typeof closedStats>> = null, err = '';
  try { live = await computeMetaStats(month, await metaPeople()); closed = await closedStats(month); } catch (e: any) { err = statsSqlMsg(String(e?.message ?? e)); }
  const st = closed?.snapshot ?? live; const drift = closed && live ? { amt: live.tot.amt - closed.snapshot.tot.amt, margin: (live.tot.amt - live.tot.cost) - (closed.snapshot.tot.amt - closed.snapshot.tot.cost), n: live.tot.n - closed.snapshot.tot.n } : null;
  const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }; const td = th;
  const row = (l: StatLine, bold = false) => { const ad = (st?.unit ?? 0) * l.valid; return <tr key={l.key} style={{ borderTop: '1px solid #EAECF0', fontWeight: bold ? 700 : 400, background: bold ? '#F9FAFB' : undefined }}>
    <td style={{ ...td, textAlign: 'left' }}>{l.name}</td><td style={td}>{l.n}</td><td style={td}>{l.valid}</td><td style={{ ...td, color: l.wait ? '#B54708' : '#98A2B3' }}>{l.wait}</td><td style={td}>{pct(l.reached, l.valid)}</td><td style={{ ...td, color: '#B42318', fontWeight: 700 }}>{pct(l.paidLeads, l.valid)}</td>
    <td style={{ ...td, borderLeft: '2px solid #EAECF0' }}>{l.newCnt ? `${l.newCnt}건 · ${won(l.newAmt)}` : '—'}</td><td style={td}>{l.reCnt ? `${l.reCnt}건 · ${won(l.reAmt)}` : '—'}</td><td style={{ ...td, fontWeight: 700 }}>{won(l.amt)}{l.refund ? <div style={{ fontSize: 11.5, color: '#B42318', fontWeight: 400 }}>환불 {won(l.refund)}</div> : null}</td><td style={td}>{won(l.cost)}</td><td style={{ ...td, color: '#067647', fontWeight: 700 }}>{won(l.amt - l.cost)}</td>
    <td style={{ ...td, borderLeft: '2px solid #EAECF0' }}>{st?.spend ? won(ad) : '—'}</td><td style={{ ...td, fontWeight: 700 }}>{st?.spend && ad ? Math.round(l.cohortAmt / ad * 100) + '%' : '—'}</td>
    {a.boss && <td style={{ ...td, color: '#475467' }}>{l.staff ? won(BASE + Math.max(0, l.amt) * RATE) : ''}</td>}</tr>; };
  const card = (label: string, v: string, sub?: string) => <div className="card" style={{ flex: '1 1 150px', minWidth: 150 }}><div style={{ fontSize: 12.5, color: '#667085' }}>{label}</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{v}</div>{sub && <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{sub}</div>}</div>;
  const t = st?.tot;
  return <>
    <PageHeader title="메타 효율" desc={`${bizLabel(month)} · DB 숫자는 이 기간에 들어온 것, 결제 숫자는 이 기간에 결제한 것(VAT 제외)`}
      badge={closed ? <span style={{ fontSize: 12.5, fontWeight: 700, color: '#067647', background: '#ECFDF3', padding: '3px 10px', borderRadius: 999 }}>마감됨 {fmtKST(closed.closed_at)}</span> : month < cur ? <span style={{ fontSize: 12.5, fontWeight: 700, color: '#B54708', background: '#FFFAEB', padding: '3px 10px', borderRadius: 999 }}>마감 전</span> : undefined}
      actions={<div style={{ display: 'flex', gap: 6 }}><Link className="btn ghost" href={`/meta-stats?m=${prevBizMonth(month)}`}>← 이전 달</Link>{month !== cur && <Link className="btn ghost" href="/meta-stats">이번 달</Link>}{month < cur && <Link className="btn ghost" href={`/meta-stats?m=${nextBizMonth(month)}`}>다음 달 →</Link>}{a.boss && month < cur && <CloseButton month={month} closed={!!closed} />}</div>} />
    {err && <div className="card" style={{ color: '#B42318', marginBottom: 12 }}>{err}</div>}
    {closed && drift && (drift.amt !== 0 || drift.margin !== 0 || drift.n !== 0) && <div className="card" style={{ marginBottom: 12, background: '#FFFAEB', fontSize: 13.5 }}><b>마감 후 변동</b> — 아래 표는 마감 시점 숫자 그대로입니다. 마감 뒤에 바뀐 것: 결제 금액 {drift.amt >= 0 ? '+' : ''}{won(drift.amt)} · 마진 {drift.margin >= 0 ? '+' : ''}{won(drift.margin)}{drift.n ? ` · 받은 DB ${drift.n > 0 ? '+' : ''}${drift.n}건` : ''} (환불 · 뒤늦게 넣은 결제 · 취소)</div>}
    {t && st && <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {card('받은 DB', String(t.n), `유효 ${t.valid} · 허수·중복 ${t.n - t.valid}`)}{card('결제율', pct(t.paidLeads, t.valid), `결제한 DB ${t.paidLeads}건 / 유효 ${t.valid}건`)}{card('이 달 결제 금액', won(t.amt), `신규 ${won(t.newAmt)} · 재결제 ${won(t.reAmt)}`)}{card('마진', won(t.amt - t.cost), st.spend ? `광고비 빼면 ${won(t.amt - t.cost - st.spend)}` : `상품비 ${won(t.cost)}`)}{card('광고비', st.spend ? won(st.spend) : '미입력', st.spend && t.valid ? `유효 DB 1건당 ${won(st.unit)}` : undefined)}{card('광고비 대비 매출', st.spend ? Math.round(t.cohortAmt / st.spend * 100) + '%' : '—', st.spend ? `이 달 DB 가 지금까지 낸 금액 ${won(t.cohortAmt)}` : undefined)}
      </div>
      {a.boss && !closed && <SpendForm month={month} amount={st.spend} />}
      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1240 }}>
          <thead><tr style={{ background: '#F9FAFB', color: '#475467', fontSize: 12.5 }}><th style={{ ...th, textAlign: 'left' }}>담당자</th>{['받은 DB', '유효 DB', '미연락', '연결률', '결제율'].map(h => <th key={h} style={th}>{h}</th>)}<th style={{ ...th, borderLeft: '2px solid #EAECF0' }}>신규 결제(1차)</th>{['재결제(2차~)', '결제 금액', '상품비', '마진'].map(h => <th key={h} style={th}>{h}</th>)}<th style={{ ...th, borderLeft: '2px solid #EAECF0' }}>광고비 부담</th><th style={th}>광고비 대비 매출</th>{a.boss && <th style={th}>예상 급여</th>}</tr></thead>
          <tbody>{st.lines.map(l => row(l))}{row(t, true)}{!t.n && !t.amt && <tr><td colSpan={a.boss ? 14 : 13} style={{ padding: 26, textAlign: 'center', color: '#98A2B3' }}>이 기간에 들어온 DB 도, 결제도 없습니다</td></tr>}</tbody>
        </table>
      </div>
      {st.src.length > 0 && <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
          <thead><tr style={{ background: '#F9FAFB', color: '#475467', fontSize: 12.5 }}><th style={{ ...th, textAlign: 'left' }}>유입 구분</th>{['받은 DB', '유효 DB', '연결률', '결제한 DB', '결제율', '지금까지 낸 금액'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{st.src.map(g => <tr key={g.name} style={{ borderTop: '1px solid #EAECF0' }}><td style={{ ...td, textAlign: 'left' }}>{g.name}</td><td style={td}>{g.n}</td><td style={td}>{g.valid}</td><td style={td}>{pct(g.reached, g.valid)}</td><td style={td}>{g.paidLeads}</td><td style={{ ...td, fontWeight: 700 }}>{pct(g.paidLeads, g.valid)}</td><td style={td}>{won(g.cohortAmt)}</td></tr>)}</tbody>
        </table>
      </div>}
    </>}
    <p style={{ fontSize: 12.5, color: '#667085', lineHeight: 1.7 }}>왼쪽(받은 DB ~ 결제율) = 이 회사월에 들어온 DB 기준. 결제율 = 한 번이라도 결제한 DB ÷ 유효 DB (재결제는 결제율을 올리지 않음) · 가운데(신규 ~ 마진) = 이 회사월에 결제한 내역 기준, 결제 시점 담당자의 실적. 금액은 VAT 제외 · 광고비 부담 = 광고비 ÷ 전체 유효 DB × 그 사람의 유효 DB · 광고비 대비 매출 = 이 달에 들어온 DB 가 지금까지 낸 금액(연장 포함) ÷ 광고비 부담 · 20일이 지난 달은 총괄이 「마감」하면 숫자가 고정됩니다{a.boss && <> · 예상 급여 = 기본급 220만 + 이 달 결제 금액의 10% (총괄 · 어드민에게만 보임)</>}</p>
  </>;
}
