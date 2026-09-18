import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { won, man } from '@/lib/date/kst';
import { scopeFor, isTeamScope, type Criteria, type Tier } from '@/lib/rules';
import Simulator from './Simulator';
export const dynamic = 'force-dynamic';
export default async function CriteriaPage() {
  const me = (await getProfile())!; const sb = supabaseServer();
  const [{ data: crit }, { data: tiers }, { data: set }] = await Promise.all([
    sb.from('promotion_criteria').select('*').eq('is_active', true).order('sort_order'),
    sb.from('incentive_tiers').select('*').eq('is_active', true).order('scope').order('sort_order'),
    sb.from('app_settings').select('key,value').in('key', ['new_margin_bonus_rate', 'promotion_doc', 'incentive_doc', 'incentive_team_scopes']),
  ]);
  const v = (k: string) => set?.find(s => s.key === k)?.value ?? '';
  const newRate = Number(v('new_margin_bonus_rate') || 0);
  const teamScopes = v('incentive_team_scopes').split(',').map((x: string) => x.trim()).filter(Boolean);
  const T = (tiers as Tier[]) ?? [];
  const canSeeAll = me.role === 'admin' || me.role === 'head';
  const myScope = scopeFor(T, me.position, me.role);
  const scopes = canSeeAll ? [...new Set(T.map(t => t.scope))] : [myScope];
  const range = (t: Tier) => t.max_margin === null ? `${man(t.min_margin)} 이상` : Number(t.min_margin) === 0 ? `${man(t.max_margin)} 미만` : `${man(t.min_margin)} ~ ${man(t.max_margin)}`;
  const myCrit = (crit as Criteria[] ?? []).filter(c => canSeeAll || c.from_position === me.position);
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>진급 · 인센티브 기준 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>{canSeeAll ? '전체 직급' : `${me.position ?? '직급 미설정'} 기준 · 도달 현황은 마이페이지`}</span></h1>
      <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>진급 기준</h3>
        {myCrit.length ? <div style={{ overflowX: 'auto' }}><table><thead><tr><th>현재</th><th>진급</th><th style={{ textAlign: 'right' }}>월 마진</th><th>연속</th><th style={{ textAlign: 'right' }}>연 누계</th><th>허용 지각(월)</th><th>허용 결근(연)</th><th>허용 병가(월)</th><th>최소 재직</th></tr></thead>
        <tbody>{myCrit.map(c => <tr key={c.id}><td>{c.from_position}</td><td><b>{c.to_position}</b></td><td style={{ textAlign: 'right' }}>{won(c.monthly_margin_min)}</td><td>{c.consecutive_months}개월</td><td style={{ textAlign: 'right' }}>{c.yearly_margin_min ? won(c.yearly_margin_min) : '-'}</td><td>{c.max_late}회</td><td>{c.max_absent}회</td><td>{c.max_sick}회</td><td>{c.min_tenure_months}개월</td></tr>)}</tbody></table></div> : <div style={{ fontSize: 13, color: 'var(--muted)' }}>직급 '{me.position ?? '미설정'}'에 해당하는 진급 기준이 없습니다.</div>}
        {v('promotion_doc') && <div style={{ whiteSpace: 'pre-wrap', marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>{v('promotion_doc')}</div>}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>마진 = 정산 자동 + 추가분(VAT 제외). 근태는 승인된 건만. 연속 개월 = 기준 월 마진을 N개월 연속 충족.</div></div>
      {scopes.map(sc => { const ts = T.filter(t => t.scope === sc); const team = isTeamScope(sc, teamScopes); return (
        <div className="card" key={sc}><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>인센티브 — {sc} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{team ? '팀 합계 마진 기준' : `해당 구간 요율 × 본인 월 마진${newRate ? ` + 신규 마진 ${(newRate * 100).toFixed(0)}%` : ''} + 구간 보너스`}{sc === myScope && !canSeeAll ? ' · 내 기준' : ''}</span></h3>
          <table><thead><tr><th>구간</th><th>{team ? '팀 월 마진' : '월 마진'}</th><th style={{ textAlign: 'right' }}>요율</th><th style={{ textAlign: 'right' }}>보너스</th><th style={{ textAlign: 'right' }}>예) 구간 하단</th></tr></thead><tbody>{ts.map(t => <tr key={t.id}><td><b>{t.label}</b></td><td>{range(t)}</td><td style={{ textAlign: 'right' }}><b>{(Number(t.rate) * 100).toFixed(0)}%</b></td><td style={{ textAlign: 'right' }}>{Number(t.bonus) ? won(t.bonus) : '-'}</td><td style={{ textAlign: 'right' }}>{won(Number(t.min_margin) * Number(t.rate) + Number(t.bonus))}</td></tr>)}</tbody></table>
          {!team && <Simulator tiers={ts} newRate={newRate} scope={sc} />}
        </div>); })}
      {v('incentive_doc') && <div className="card" style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--muted)' }}>{v('incentive_doc')}</div>}
    </div>
  );
}
