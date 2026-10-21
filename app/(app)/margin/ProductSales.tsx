import { supabaseServer } from '@/lib/supabase/server';
import { won } from '@/lib/date/kst';
import { bizMonthRange, prevBizMonth } from '@/lib/date/period';

type Row = { month_key: string; prod_name: string; gubun: string; approved: boolean; refund: boolean; cnt: number; inflow: number; sale_total: number; profit: number };
type Agg = { n: number; renew: number; neu: number; etc: number; inflow: number; sale: number; profit: number; refund: number; pending: number };
const zero = (): Agg => ({ n: 0, renew: 0, neu: 0, etc: 0, inflow: 0, sale: 0, profit: 0, refund: 0, pending: 0 });
const R = { textAlign: 'right' as const };
const vat = (n: number) => Math.ceil(n / 1.1);   // 정산 사이트 영업이익은 VAT 포함 → 마진 화면과 같게 ÷1.1

/** 상품별 판매 수량 — 고른 달 상세 + 최근 6개월 추이 (요청일 기준, 승인요청 포함) */
export default async function ProductSales({ userId, who, monthKey }: { userId: string; who: string; monthKey: string }) {
  const months: string[] = [monthKey]; for (let i = 0; i < 5; i++) months.unshift(prevBizMonth(months[0]));
  const from = bizMonthRange(months[0])[0], to = bizMonthRange(monthKey)[1];
  const { data, error } = await supabaseServer().rpc('product_sales', { p_from: from, p_to: to, p_user: userId });
  if (error) return <div className="card"><h3 style={{ margin: 0, fontSize: 15 }}>상품별 판매 수량</h3><div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>불러오지 못함: {error.message}</div></div>;
  const rows = (data ?? []) as Row[];

  const cur: Record<string, Agg> = {}; const trend: Record<string, Record<string, Agg>> = {};
  for (const r of rows) {
    const t = ((trend[r.prod_name] ??= {})[r.month_key] ??= zero());
    if (r.refund) { t.refund += r.cnt; } else { t.n += r.cnt; t.inflow += Number(r.inflow); }
    if (r.month_key !== monthKey) continue;
    const a = (cur[r.prod_name] ??= zero());
    a.profit += Number(r.profit);
    if (r.refund) { a.refund += r.cnt; continue; }
    a.n += r.cnt; a.inflow += Number(r.inflow); a.sale += Number(r.sale_total);
    if (!r.approved) a.pending += r.cnt;
    if (/연장/.test(r.gubun)) a.renew += r.cnt; else if (/신규/.test(r.gubun)) a.neu += r.cnt; else a.etc += r.cnt;
  }
  const prods = Object.keys(cur).sort((a, b) => cur[b].n - cur[a].n || a.localeCompare(b));
  const tot = prods.reduce((s, p) => { const a = cur[p]; (Object.keys(s) as (keyof Agg)[]).forEach(k => { s[k] += a[k]; }); return s; }, zero());
  const tProds = Object.keys(trend).sort((a, b) => months.reduce((s, m) => s + (trend[b][m]?.n ?? 0), 0) - months.reduce((s, m) => s + (trend[a][m]?.n ?? 0), 0));
  const mLabel = (k: string) => `${Number(k.slice(5))}월`;

  return (
    <div className="card">
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{who} 상품별 판매 수량 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{mLabel(monthKey)} · 정산 요청일 기준 · 승인 대기 포함</span></h3>
      <div style={{ overflowX: 'auto' }}><table>
        <thead><tr><th>상품</th><th style={R}>신규</th><th style={R}>연장</th><th style={R}>기타</th><th style={R}>합계</th><th style={R}>슬롯(유입수)</th><th style={R}>판매총액</th><th style={R}>마진(VAT 제외)</th><th style={R}>환불</th></tr></thead>
        <tbody>
          {prods.map(p => { const a = cur[p]; return <tr key={p}>
            <td><b>{p}</b>{a.pending ? <span style={{ fontSize: 11, color: 'var(--muted)' }}> · 대기 {a.pending}</span> : null}</td>
            <td style={R}>{a.neu || '-'}</td><td style={R}>{a.renew || '-'}</td><td style={R}>{a.etc || '-'}</td>
            <td style={{ ...R, fontWeight: 700 }}>{a.n}건</td><td style={R}>{a.inflow.toLocaleString()}</td>
            <td style={R}>{won(a.sale)}</td><td style={{ ...R, color: a.profit < 0 ? 'var(--bad)' : undefined }}>{won(vat(a.profit))}</td><td style={{ ...R, color: 'var(--muted)' }}>{a.refund || '-'}</td>
          </tr>; })}
          {prods.length > 1 && <tr style={{ fontWeight: 700, borderTop: '2px solid var(--line)' }}><td>합계</td><td style={R}>{tot.neu}</td><td style={R}>{tot.renew}</td><td style={R}>{tot.etc}</td><td style={R}>{tot.n}건</td><td style={R}>{tot.inflow.toLocaleString()}</td><td style={R}>{won(tot.sale)}</td><td style={R}>{won(vat(tot.profit))}</td><td style={R}>{tot.refund || '-'}</td></tr>}
          {!prods.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>이 달 정산 건 없음 (정산 계정 연결 확인)</td></tr>}
        </tbody>
      </table></div>

      {tProds.length > 0 && <>
        <h3 style={{ margin: '18px 0 4px', fontSize: 14 }}>최근 6개월 추이 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>건수 · 아래 작은 숫자 = 슬롯</span></h3>
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>상품</th>{months.map(m => <th key={m} style={{ ...R, color: m === monthKey ? 'var(--accent)' : undefined }}>{mLabel(m)}</th>)}<th style={R}>6개월</th></tr></thead>
          <tbody>{tProds.map(p => <tr key={p}>
            <td><b>{p}</b></td>
            {months.map(m => { const a = trend[p][m]; return <td key={m} style={{ ...R, background: m === monthKey ? 'var(--accent-soft)' : undefined }}>
              {a?.n ? <><div style={{ fontWeight: 700 }}>{a.n}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.inflow.toLocaleString()}</div></> : <span style={{ color: 'var(--muted)' }}>-</span>}
            </td>; })}
            <td style={{ ...R, fontWeight: 700 }}>{months.reduce((s, m) => s + (trend[p][m]?.n ?? 0), 0)}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </div>
  );
}
