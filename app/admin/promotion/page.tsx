import { todayKST, won } from '@/lib/date/kst';
import { evaluatePeople } from '@/lib/eval';
export const dynamic = 'force-dynamic';
export default async function PromotionPage() {
  const today = todayKST(); const { people, teams } = await evaluatePeople(today);
  const tn = (id: number | null) => teams.find(t => t.id === id)?.name ?? '-';
  const c = (ok: boolean) => ({ color: ok ? 'var(--ok)' : 'var(--bad)', fontWeight: 600 });
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>진급 도달 현황 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>{today.slice(0, 7)} · 실시간 계산 (KPI·근태 승인분 기준)</span></h1>
      <div className="card"><div style={{ overflowX: 'auto' }}><table><thead><tr><th>이름</th><th>팀</th><th>직급 → 대상</th><th style={{ textAlign: 'right' }}>이달 마진</th><th style={{ textAlign: 'right' }}>기준</th><th style={{ textAlign: 'right' }}>도달</th><th>연속</th><th style={{ textAlign: 'right' }}>연 누계</th><th>지각</th><th>결근</th><th>병가</th><th>근태</th><th>재직</th><th>종합</th><th style={{ textAlign: 'right' }}>예상 인센티브</th></tr></thead>
        <tbody>{people.map(p => <tr key={p.id}><td><b>{p.name}</b></td><td>{tn(p.team_id)}</td>
          {p.promo ? <><td>{p.promo.c.from_position} → {p.promo.c.to_position}</td><td style={{ textAlign: 'right' }}>{won(p.monthMargin)}</td><td style={{ textAlign: 'right' }}>{won(p.promo.c.monthly_margin_min)}</td><td style={{ textAlign: 'right', ...c(p.promo.salesOk) }}>{Math.round(p.monthMargin / Number(p.promo.c.monthly_margin_min) * 100)}%</td><td>{p.consecutiveOk ? '○' : '✕'}</td><td style={{ textAlign: 'right' }}>{won(p.yearMargin)}{p.promo.c.yearly_margin_min ? ` / ${won(p.promo.c.yearly_margin_min)}` : ''}</td><td style={c(p.late <= p.promo.c.max_late)}>{p.late}/{p.promo.c.max_late}</td><td style={c(p.absent <= p.promo.c.max_absent)}>{p.absent}/{p.promo.c.max_absent}</td><td style={c(p.sick <= p.promo.c.max_sick)}>{p.sick}/{p.promo.c.max_sick}</td><td style={c(p.promo.attOk)}>{p.promo.attOk ? '통과' : '미달'}</td><td style={c(p.promo.tenOk)}>{p.tenure}/{p.promo.c.min_tenure_months}개월</td><td><span className="pill" style={p.promo.ok ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : { background: 'var(--bad-soft)', color: 'var(--bad)' }}>{p.promo.ok ? '도달' : '미도달'}</span></td></>
            : <><td>{p.position ?? '-'}</td><td style={{ textAlign: 'right' }}>{won(p.monthMargin)}</td><td colSpan={10} style={{ color: 'var(--muted)', fontSize: 12 }}>기준 없음{p.role === 'manager' ? ' (팀장 · 팀 합계 마진)' : ` — 직급 '${p.position ?? '미설정'}'에 해당하는 기준을 어드민 › 기준 관리에서 추가`}</td></>}
          <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(p.inc.total)}<div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{p.inc.tier?.label}</div></td></tr>)}</tbody></table></div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>지각·병가는 이달, 무단결근·연 누계 마진은 올해. 팀장 인센티브는 팀 합계 마진 구간.</div></div>
    </div>
  );
}
