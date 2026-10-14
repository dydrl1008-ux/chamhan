import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, won, man, fmtMD } from '@/lib/date/kst';
import { evaluatePeople } from '@/lib/eval';
import { bizMonthOf, bizLabel } from '@/lib/date/period';
import PasswordChange from '@/components/PasswordChange';
import SettleLink from '@/components/SettleLink';
import { PageHeader, Stat, Section, Empty } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function MePage() {
  const me = (await getProfile())!; const sb = supabaseServer(); const today = todayKST(); const year = Number(today.slice(0, 4)); const ms = bizMonthOf(today) + '-01';
  const [{ people, tiers }, { data: yl }, { data: pr }, { data: dir }, { data: tgt }, { data: teams }] = await Promise.all([
    evaluatePeople(today, me.id),
    sb.from('v_leave_yearly').select('*').eq('user_id', me.id).eq('year', year).maybeSingle(),
    sb.from('v_plan_rate').select('type,total,done').eq('user_id', me.id).eq('month', ms),
    sb.rpc('my_directives', { p_limit: 4 }),
    sb.from('monthly_targets').select('margin').eq('user_id', me.id).eq('month', ms).maybeSingle(),
    sb.from('teams').select('id,name'),
  ]);
  const p = people[0]; const { data: prof } = await sb.from('profiles').select('annual_leave_granted').eq('id', me.id).single();
  const { data: cred } = await sb.from('settlement_credentials').select('settle_user_id,verified_at,last_error').eq('user_id', me.id).maybeSingle();
  const granted = Number(prof?.annual_leave_granted ?? 0), used = Number(yl?.annual_used ?? 0);
  const tg = Number(tgt?.margin ?? 0);
  const bar = (v: number, c?: string) => <div style={{ height: 8, background: 'var(--line)', borderRadius: 6 }}><div style={{ width: `${Math.min(100, Math.max(0, v))}%`, height: '100%', background: c ?? 'var(--accent)', borderRadius: 6 }} /></div>;
  const rate = (t: string) => { const x = (pr ?? []).find(a => a.type === t); return x && Number(x.total) ? Math.round(Number(x.done) / Number(x.total) * 100) : null; };
  const isMgr = p ? p.inc.items[0]?.name.startsWith('팀') : me.role === 'manager'; const myScope = p?.inc.scope ?? '';
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <PageHeader title="내 정보" desc={`${me.name} · ${me.position ?? '-'}${me.team_id ? ' · ' + teams?.find(t => t.id === me.team_id)?.name : ''} · 입사 ${p?.hired_at ?? '-'} · ${bizLabel(bizMonthOf(today))} 기준`} actions={<><a href="/kpi" className="btn ghost">KPI 제출</a><a href="/leave" className="btn ghost">근태 · 휴가</a></>} />
      <div className="grid4">
        <Stat label={`업무월 ${isMgr ? '팀' : '내'} 마진`} value={won(p?.monthMargin)} pending={p?.monthPending ? won(p.monthPending) : undefined} pct={tg ? Math.round((p?.monthMargin ?? 0) / tg * 100) : undefined} desc={tg ? `목표 ${man(tg)} · ${Math.round((p?.monthMargin ?? 0) / tg * 100)}%` : '목표 미배정'} />
        <Stat label="잔여 연차" value={`${granted - used}일`} desc={`부여 ${granted} · 사용 ${used} · 올해 지각 ${Number(yl?.late_cnt ?? 0)} · 결근 ${Number(yl?.absent_cnt ?? 0)}`} href="/leave" />
        <Stat label="예상 인센티브" value={won(p?.inc.total ?? 0)} desc={p?.inc.tier ? `${myScope} · ${p.inc.tier.label}${p.inc.next ? ` · 다음 구간까지 ${man(Number(p.inc.next.min_margin) - p.monthMargin)}` : ''}` : '기준 없음'} />
        <Stat label="계획 달성" value={(() => { const vs = ['daily', 'weekly', 'monthly'].map(t => rate(t)).filter((x): x is number => x !== null); return vs.length ? `${Math.round(vs.reduce((a, b) => a + b, 0) / vs.length)}%` : '-'; })()} desc={`일일 ${rate('daily') ?? '-'}${rate('daily') !== null ? '%' : ''} · 주간 ${rate('weekly') ?? '-'}${rate('weekly') !== null ? '%' : ''} · 월 ${rate('monthly') ?? '-'}${rate('monthly') !== null ? '%' : ''}`} href="/plans" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>진급 기준 도달 {p?.promo ? <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{p.promo.c.from_position} → {p.promo.c.to_position}</span> : <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>해당 기준 없음</span>}</h3>
          {p?.promo ? <>
            <div style={{ marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>이달 마진</span><span>{won(p.monthMargin)} / {won(p.promo.c.monthly_margin_min)}</span></div>{bar(p.monthMargin / Number(p.promo.c.monthly_margin_min) * 100, p.promo.salesOk ? 'var(--ok)' : '#D97706')}<div style={{ fontSize: 11.5, color: 'var(--muted)' }}>직전 {p.promo.c.consecutive_months}개월 연속 충족: {p.consecutiveOk ? '○' : '✕'} (이달 제외)</div></div>
            {p.promo.c.yearly_margin_min && <div style={{ marginBottom: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>연 누계 마진</span><span>{won(p.yearMargin)} / {won(p.promo.c.yearly_margin_min)}</span></div>{bar(p.yearMargin / Number(p.promo.c.yearly_margin_min) * 100)}</div>}
            <table style={{ fontSize: 13 }}><tbody>
              <tr><td>지각 (이달)</td><td style={{ color: p.late <= p.promo.c.max_late ? 'var(--ok)' : 'var(--bad)' }}>{p.late}회 / 허용 {p.promo.c.max_late}</td></tr>
              <tr><td>무단결근 (연)</td><td style={{ color: p.absent <= p.promo.c.max_absent ? 'var(--ok)' : 'var(--bad)' }}>{p.absent}회 / 허용 {p.promo.c.max_absent}</td></tr>
              <tr><td>병가 (이달)</td><td style={{ color: p.sick <= p.promo.c.max_sick ? 'var(--ok)' : 'var(--bad)' }}>{p.sick}회 / 허용 {p.promo.c.max_sick}</td></tr>
              <tr><td>재직</td><td style={{ color: p.promo.tenOk ? 'var(--ok)' : 'var(--bad)' }}>{p.tenure}개월 / 최소 {p.promo.c.min_tenure_months}</td></tr></tbody></table>
            <div style={{ marginTop: 10 }}><span className="pill" style={p.promo.ok ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : { background: '#FDF1DD', color: '#D97706' }}>{p.promo.ok ? '이달 기준 도달' : '미도달 — ' + p.promo.fails.join(', ')}</span></div>
          </> : <div style={{ fontSize: 13, color: 'var(--muted)' }}>직급({me.position ?? '미설정'})에 해당하는 진급 기준이 없습니다.</div>}</div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>이달 예상 인센티브 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{myScope} 기준{p?.inc.tier ? ` · 현재 ${p.inc.tier.label}` : ''} · 마감 전 추정</span></h3>
          {p && <>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiers.filter(t => t.scope === myScope).length},1fr)`, gap: 4, marginBottom: 10 }}>{tiers.filter(t => t.scope === myScope).map(t => { const cur = p.inc.tier?.id === t.id; const past = p.inc.tier && t.sort_order < p.inc.tier.sort_order; return <div key={t.id} style={{ textAlign: 'center', padding: '6px 3px', borderRadius: 8, border: `1px solid ${cur ? 'var(--accent)' : 'var(--line)'}`, background: cur ? 'var(--accent-soft)' : past ? 'var(--ok-soft)' : 'var(--bg)' }}><div style={{ fontSize: 14, fontWeight: 800, color: cur ? 'var(--accent)' : past ? 'var(--ok)' : 'var(--ink)' }}>{(Number(t.rate) * 100).toFixed(0)}%</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>{t.label}</div></div>; })}</div>
            <table style={{ fontSize: 13 }}><tbody>{p.inc.items.map((x, i) => <tr key={i}><td>{x.name}</td><td style={{ textAlign: 'right' }}>{won(x.amt)}</td></tr>)}<tr style={{ fontWeight: 700, background: 'var(--bg)' }}><td>예상 합계</td><td style={{ textAlign: 'right' }}>{won(p.inc.total)}</td></tr></tbody></table>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{p.inc.next ? `다음 구간(${p.inc.next.label} ${(Number(p.inc.next.rate) * 100).toFixed(0)}%)까지 ${won(Number(p.inc.next.min_margin) - p.monthMargin)} 남음` : '최고 구간'} · 마이너스 마진은 0으로 계산</div>
          </>}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}><PasswordChange /><SettleLink linked={!!cred} settleId={cred?.settle_user_id ?? ''} verifiedAt={cred?.verified_at ?? null} lastError={cred?.last_error ?? null} /></div>
      {me.role === 'staff' && <Section title="팀장 지시사항 · 피드백" sub="제출된 주간보고 기준 · 최근 4주" flush>
        {(dir ?? []).length ? <table><thead><tr><th>주</th><th>공통 지시</th><th>개인 지시</th><th>피드백</th></tr></thead><tbody>{(dir ?? []).map((d: any, i: number) => <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{fmtMD(d.week_start)} 주</td><td>{d.common_directive || <span className="cell-sub">-</span>}</td><td>{d.directive || <span className="cell-sub">-</span>}</td><td style={{ color: 'var(--muted)' }}>{d.feedback || '-'}</td></tr>)}</tbody></table> : <div style={{ padding: 22 }}><Empty>아직 제출된 주간보고가 없습니다.</Empty></div>}
      </Section>}
    </div>
  );
}
