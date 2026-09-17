import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, addDays, fmtMD, won, man, weekStartOf } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange, prevBizMonth, nextBizMonth, bizLabel } from '@/lib/date/period';
import MarginFilter from './MarginFilter';
export const dynamic = 'force-dynamic';
type Row = { user_id: string; team_id: number | null; work_date: string; calls: number; new_cnt: number; margin: number; margin_auto: number; margin_manual: number; new_margin: number; kakao_db: number; work_report: string | null };
export default async function MarginPage({ searchParams }: { searchParams: { t?: string; team?: string; m?: string; u?: string } }) {
  const me = (await getProfile())!; const sb = supabaseServer(); const today = todayKST();
  const tab = ['day', 'week', 'month'].includes(searchParams.t ?? '') ? searchParams.t! : 'month';
  const curKey = bizMonthOf(today); const key = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m! : curKey;
  const [ms, me_] = bizMonthRange(key); const isCur = key === curKey;
  const ws = weekStartOf(today), we = addDays(ws, 6);
  const range: [string, string] = tab === 'day' ? [today, today] : tab === 'week' ? [ws, we] : [ms, isCur ? today : me_];
  const label = tab === 'day' ? `금일 (${fmtMD(today)})` : tab === 'week' ? `이번 주 (${fmtMD(ws)}~${fmtMD(we)})` : bizLabel(key);
  const [{ data: rowsAll }, { data: people }, { data: teams }, { data: targets }] = await Promise.all([
    sb.from('kpi_daily').select('user_id,team_id,work_date,calls,new_cnt,margin,margin_auto,margin_manual,new_margin,kakao_db,work_report').gte('work_date', ms).lte('work_date', me_).order('work_date', { ascending: false }),
    sb.from('profiles').select('id,name,team_id,role,position').eq('is_active', true).in('role', ['staff', 'manager']).order('team_id').order('name'),
    sb.from('teams').select('id,name,leader_id').eq('is_active', true).order('sort_order'),
    sb.from('monthly_targets').select('user_id,team_id,margin').eq('month', key + '-01'),
  ]);
  const fTeam = me.role === 'manager' ? (me.team_id ?? 0) : Number(searchParams.team) || 0; const fUser = searchParams.u || '';
  const all = ((rowsAll ?? []) as Row[]).filter(r => (!fTeam || r.team_id === fTeam) && (!fUser || r.user_id === fUser));
  const rows = all.filter(r => r.work_date >= range[0] && r.work_date <= range[1]);
  const pplAll = (people ?? []).filter(p => p.team_id !== null);
  const ppl = pplAll.filter(p => (!fTeam || p.team_id === fTeam) && (!fUser || p.id === fUser));
  const q = (k: string, v: string | number) => { const o = { t: tab, m: key, team: fTeam || '', u: fUser, [k]: v } as Record<string, string | number>; return '/margin?' + Object.entries(o).filter(([, x]) => x !== '' && x !== 0).map(([a, b]) => `${a}=${b}`).join('&'); };
  const nm = (id: string) => ppl.find(p => p.id === id)?.name ?? '-';
  const sum = (arr: Row[], k: keyof Row) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
  const tUser = (id: string) => Number(targets?.find(t => t.user_id === id)?.margin ?? 0);
  const tTeam = (id: number) => ppl.filter(x => x.team_id === id).reduce((a, x) => a + tUser(x.id), 0);   // 팀 목표 = 팀원 개인 목표 합계
  const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
  const color = (m: number) => m < 0 ? 'var(--bad)' : 'inherit';
  const Tab = ({ k, l }: { k: string; l: string }) => <a href={q('t', k)} style={{ padding: '7px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none', background: tab === k ? 'var(--accent-soft)' : 'transparent', color: tab === k ? 'var(--accent)' : 'var(--muted)' }}>{l}</a>;
  const kpi = (l: string, v: string, d?: string, c?: string) => <div className="card" style={{ padding: '14px 18px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>{d && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d}</div>}</div>;
  const bar = (p: number, c?: string) => <div style={{ height: 8, background: 'var(--line)', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, Math.max(0, p))}%`, height: '100%', background: c ?? 'var(--accent)' }} /></div>;

  let agg: React.ReactNode;
  const one = me.role === 'staff' ? me.id : fUser;
  if (one) {
    const mine = rows.filter(r => r.user_id === one), mineM = all.filter(r => r.user_id === one); const m = sum(mineM, 'margin'), tg = tUser(one); const oneName = one === me.id ? '내' : (pplAll.find(p => p.id === one)?.name ?? '') ;
    agg = <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>{kpi(`${label} ${oneName} 마진`, won(sum(mine, 'margin')), `신규 ${sum(mine, 'new_cnt')}건 · 신규 마진 ${won(sum(mine, 'new_margin'))}`, color(sum(mine, 'margin')))}{kpi(`${Number(key.slice(5))}월 누계 마진`, won(m), tg ? `목표 ${won(tg)}` : '목표 미설정', color(m))}<div className="card" style={{ padding: '14px 18px' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>이달 목표 달성률</div><div style={{ fontSize: 22, fontWeight: 800, color: pct(m, tg) >= 100 ? 'var(--ok)' : pct(m, tg) >= 70 ? '#D97706' : 'inherit' }}>{pct(m, tg)}%</div>{bar(pct(m, tg))}</div>{kpi(`${Number(key.slice(5))}월 일평균 마진`, won(mineM.length ? m / mineM.length : 0), `${mineM.length}일 입력`)}</div>;
  } else {
    const visibleTeams = (teams ?? []).filter(t => me.role !== 'manager' || t.id === me.team_id).filter(t => ppl.some(p => p.team_id === t.id));
    const teamAgg = visibleTeams.map(t => { const ids = ppl.filter(p => p.team_id === t.id).map(p => p.id); return { t, ids, s: sum(rows.filter(r => ids.includes(r.user_id)), 'margin'), m: sum(all.filter(r => ids.includes(r.user_id)), 'margin') }; });
    const total = teamAgg.reduce((a, b) => a + b.s, 0);
    agg = <>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, teamAgg.length + 1)},1fr)`, gap: 14 }}>{kpi(`${label} ${me.role === 'manager' ? '팀' : '전사'} 마진`, won(total), `신규 ${sum(rows, 'new_cnt')}건 · 신규 마진 ${won(sum(rows, 'new_margin'))} · 콜 ${sum(rows, 'calls').toLocaleString()}`, color(total))}{teamAgg.map(x => kpi(`${x.t.name} ${label}`, won(x.s), `${Number(key.slice(5))}월 ${man(x.m)} / 목표 ${man(tTeam(x.t.id))} · ${pct(x.m, tTeam(x.t.id))}%`, color(x.s)))}</div>
      <div style={{ display: 'grid', gridTemplateColumns: teamAgg.length > 1 ? '1fr 1fr' : '1fr', gap: 18 }}>{teamAgg.map(x => { const us = ppl.filter(p => x.ids.includes(p.id)); const mx = Math.max(1, ...us.map(u => Math.abs(sum(rows.filter(r => r.user_id === u.id), 'margin')))); return (
        <div className="card" key={x.t.id}><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{x.t.name} 직원별 마진 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{label}</span></h3>
          {us.map(u => { const s = sum(rows.filter(r => r.user_id === u.id), 'margin'), mo = sum(all.filter(r => r.user_id === u.id), 'margin'), tg = tUser(u.id); return <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 150px', gap: 10, alignItems: 'center', marginBottom: 10 }}><span><b>{u.name}</b>{u.role === 'manager' && <span style={{ fontSize: 11, color: 'var(--muted)' }}> 팀장</span>}</span>{bar(Math.abs(s) / mx * 100, s < 0 ? '#D97706' : undefined)}<span style={{ textAlign: 'right' }}><b style={{ color: color(s) }}>{won(s)}</b><div style={{ fontSize: 11, color: 'var(--muted)' }}>{Number(key.slice(5))}월 {man(mo)} / {man(tg)} ({pct(mo, tg)}%)</div></span></div>; })}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>팀 합계</span><span style={{ color: color(x.s) }}>{won(x.s)}</span></div></div>); })}</div>
    </>;
  }
  const scopeIds = me.role === 'staff' ? [me.id] : ppl.map(p => p.id);
  const daily = [...new Set(all.filter(r => scopeIds.includes(r.user_id)).map(r => r.work_date))].sort().map(d => ({ d, m: sum(all.filter(r => r.work_date === d && scopeIds.includes(r.user_id)), 'margin') }));
  const mx = Math.max(1, ...daily.map(x => Math.abs(x.m)));
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}><h1 style={{ fontSize: 20, margin: 0 }}>영업 마진</h1><div style={{ display: 'flex', gap: 4, background: 'var(--panel)', border: '1px solid var(--line)', padding: 4, borderRadius: 12 }}><Tab k="day" l="일" /><Tab k="week" l="주" /><Tab k="month" l="월" /></div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><a href={q('m', prevBizMonth(key))} className="btn ghost" style={{ padding: '4px 10px', textDecoration: 'none' }}>‹</a><b>{bizLabel(key)}</b><a href={q('m', nextBizMonth(key))} className="btn ghost" style={{ padding: '4px 10px', textDecoration: 'none' }}>›</a></div>{me.role !== 'staff' && <MarginFilter teams={(teams ?? []).filter(t => pplAll.some(p => p.team_id === t.id))} people={pplAll.filter(p => !fTeam || p.team_id === fTeam)} fTeam={fTeam} fUser={fUser} canTeam={me.role !== 'manager'} base={{ t: tab, m: key }} />}<span style={{ fontSize: 12, color: 'var(--muted)' }}>월 = 21일~20일 마감 · 정산 자동(÷1.1) + 추가분 · VAT 제외</span></div>
      {agg}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>마진 내역 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{label} · {rows.filter(r => scopeIds.includes(r.user_id)).length}건</span></h3>
          <div style={{ overflowX: 'auto', maxHeight: 480 }}><table><thead><tr><th>날짜</th>{me.role !== 'staff' && !fUser && <th>담당</th>}<th style={{ textAlign: 'right' }}>콜</th><th style={{ textAlign: 'right' }}>신규</th><th style={{ textAlign: 'right' }}>정산 자동</th><th style={{ textAlign: 'right' }}>추가</th><th style={{ textAlign: 'right' }}>금일 마진</th><th>업무 보고</th></tr></thead>
            <tbody>{rows.filter(r => scopeIds.includes(r.user_id)).map((r, i) => <tr key={i}><td>{fmtMD(r.work_date)}</td>{me.role !== 'staff' && !fUser && <td><b>{nm(r.user_id)}</b></td>}<td style={{ textAlign: 'right' }}>{r.calls}</td><td style={{ textAlign: 'right' }}>{r.new_cnt || '-'}</td><td style={{ textAlign: 'right', color: color(r.margin_auto) }}>{won(r.margin_auto)}</td><td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.margin_manual ? won(r.margin_manual) : '-'}</td><td style={{ textAlign: 'right', fontWeight: 700, color: color(r.margin) }}>{won(r.margin)}</td><td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.work_report ?? ''}>{r.work_report}</td></tr>)}
            {rows.filter(r => scopeIds.includes(r.user_id)).length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>해당 기간 KPI 입력 없음</td></tr>}</tbody></table></div></div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{bizLabel(key)} 일별 마진 추이</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160 }}>{daily.map(x => <div key={x.d} title={`${x.d} ${won(x.m)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)' }}><div style={{ display: 'flex', alignItems: 'flex-end', width: '100%', height: 130 }}><div style={{ width: '100%', height: `${Math.abs(x.m) / mx * 100}%`, background: x.m < 0 ? 'var(--bad)' : 'var(--accent)', borderRadius: '4px 4px 0 0' }} /></div>{Number(x.d.slice(8))}</div>)}{daily.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>데이터 없음</div>}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>빨강 = 마이너스 마진</div></div>
      </div>
    </div>
  );
}
