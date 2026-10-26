'use client';
// 월간 계획서 — 팀 탭(목표·전략·주차 리뷰) / 인원 탭(결과→판단→①②④③→실행 기록) / 요약 탭(빨간불·결정·사람별 한 줄)
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { notify } from '@/components/Toast';
import { PageHeader, Section, Status, Empty } from '@/components/ui';
import { won, man, fmtMD, fmtKST, addDays } from '@/lib/date/kst';
import { bizLabel, prevBizMonth, nextBizMonth } from '@/lib/date/period';
import type { Profile } from '@/lib/auth/session';
import type { PlanData } from '@/lib/monthly';
import { savePlan, addActivityType, type PlanState, type MemberState } from './actions';

type Props = { me: Profile; teams: { id: number; name: string; leader: string }[]; teamId: number; bm: string; curBm: string; nextBm: string; data: PlanData | null; summaries: any[]; canEdit: boolean; tab: string };
const nz = (v: unknown) => { const x = Number(String(v ?? '0').replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : 0; };
const MARK = { o: '○', t: '△', x: '✕' } as const;
const DEFAULT_ACTS = ['콜 (DB)', '메일 발송', '제안서 발송'];
const ta: React.CSSProperties = { width: '100%', border: '1px dashed var(--wait)', background: 'var(--wait-soft)', borderRadius: 10, padding: '8px 12px', fontSize: 14, lineHeight: 1.55, minHeight: 64 };
const inp: React.CSSProperties = { width: '100%', padding: '5px 8px', fontSize: 13, textAlign: 'right' };

export default function MonthlyClient({ me, teams, teamId, bm, curBm, nextBm, data, summaries, canEdit, tab }: Props) {
  const r = useRouter(); const [t, setT] = useState<'team' | 'people' | 'exec'>(tab === 'people' ? 'people' : tab === 'exec' ? 'exec' : (!teamId ? 'exec' : 'team'));
  const [busy, setBusy] = useState(false);
  const go = (q: Record<string, string | number>) => r.push('/monthly?' + Object.entries({ team: teamId, m: bm, ...q }).filter(([, v]) => v !== '' && v !== 0).map(([k, v]) => `${k}=${v}`).join('&'));
  const [st, setSt] = useState<PlanState>(() => init(data));
  let [person, setPerson] = useState<string>(data?.auto[0]?.user_id ?? '');
  const d = data; const weeks = d?.weeks ?? []; const cur = d?.curWeek ?? null; const today = d?.today ?? '';
  const wT = d?.cfg.wT ?? 0.5; const w = (m: 'o' | 't' | 'x') => m === 'o' ? 1 : m === 't' ? wT : 0;

  // ---------- 파생 금액 ----------
  const calc = useMemo(() => {
    if (!d) return null;
    const per: Record<string, { renew: number; pipe: number; new: number; upsell: number; target: number; keepW: Record<number, number>; newW: Record<number, number> }> = {};
    for (const m of d.auto) {
      const ms = st.members[m.user_id]; const keepW: Record<number, number> = {}, newW: Record<number, number> = {};
      let renew = 0, pipe = 0, upsell = 0, nw = 0;
      for (const rn of d.renewals.filter(x => x.user_id === m.user_id)) { const amt = Math.round(nz(rn.sale_total) * w(ms?.renew[rn.settle_no] ?? 'o')); renew += amt; if (rn.week_no) keepW[rn.week_no] = (keepW[rn.week_no] ?? 0) + amt; }
      for (const p of d.pipes.filter(x => x.owner_id === m.user_id)) { const c = ms?.pipes[String(p.id)]; if (c?.checked) { pipe += p.amount; const wk = c.week_no ?? cur ?? 1; keepW[wk] = (keepW[wk] ?? 0) + p.amount; } }
      for (const u of ms?.upsells ?? []) { upsell += nz(u.amount); const wk = u.week_no ?? cur ?? 1; keepW[wk] = (keepW[wk] ?? 0) + nz(u.amount); }
      for (const wk of weeks) { const x = ms?.weeks[String(wk.no)]; const a = nz(x?.new_amt); nw += a; newW[wk.no] = a; }
      per[m.user_id] = { renew, pipe, new: nw, upsell, target: renew + pipe + nw + upsell, keepW, newW };
    }
    const teamW: Record<number, { plan: number; actual: number; done: boolean; carry: number }> = {}; let carry = 0;
    for (const wk of weeks) {
      const plan = d.auto.reduce((a, m) => a + (per[m.user_id].keepW[wk.no] ?? 0) + (per[m.user_id].newW[wk.no] ?? 0), 0);
      const actual = d.auto.reduce((a, m) => a + (m.weeks[wk.no]?.margin ?? 0), 0); const done = wk.end < today;
      teamW[wk.no] = { plan: plan + (wk.no === cur ? carry : 0), actual, done, carry: wk.no === cur ? carry : 0 };
      if (done) carry += Math.max(0, plan - actual);
    }
    const target = d.auto.reduce((a, m) => a + per[m.user_id].target, 0);
    const confirmed = d.auto.reduce((a, m) => a + m.month.margin, 0);
    return { per, teamW, target, confirmed, sum: { renew: d.auto.reduce((a, m) => a + per[m.user_id].renew, 0), pipe: d.auto.reduce((a, m) => a + per[m.user_id].pipe, 0), new: d.auto.reduce((a, m) => a + per[m.user_id].new, 0), upsell: d.auto.reduce((a, m) => a + per[m.user_id].upsell, 0) } };
  }, [d, st, weeks, cur, today, wT]);

  const upd = (f: (s: PlanState) => void) => setSt(s => { const c = structuredClone(s); f(c); return c; });
  const EMPTY_M: MemberState = { renew: {}, pipes: {}, upsells: [], activities: [], weeks: {}, verdict: '', strategy: '', target_note: '' };
  const mem = (uid: string) => st.members[uid] ?? EMPTY_M;
  const save = async (mode: 'save' | 'submit' | 'review') => {
    if (!d || !calc) return; if (mode === 'submit' && !confirm('제출하면 개인 목표가 홈·현황 달성률 기준으로 반영됩니다. 제출할까요?')) return;
    setBusy(true);
    // 주차 계획은 파생값을 저장
    const s2 = structuredClone(st); for (const wk of weeks) { s2.weeks[String(wk.no)] = { ...(s2.weeks[String(wk.no)] ?? { issue: '', fix: '', focus: '', support: '', risk: '' }), plan_margin: calc.teamW[wk.no].plan }; for (const m of d.auto) { const mw = s2.members[m.user_id].weeks[String(wk.no)] ?? { new_cnt: 0, new_amt: 0, keep_amt: 0, goal: '', tried: '', judged: '', changed: '' }; mw.keep_amt = calc.per[m.user_id].keepW[wk.no] ?? 0; s2.members[m.user_id].weeks[String(wk.no)] = mw; } }
    const x = await savePlan(teamId, bm, s2, { renewals: d.renewals.map(x => ({ settle_no: x.settle_no, user_id: x.user_id, cust_name: x.cust_name, prod_name: x.prod_name, amount: nz(x.sale_total), date_to: x.date_to })), pipes: d.pipes.map(p => ({ id: p.id, owner_id: p.owner_id, amount: p.amount })), weightT: wT }, mode);
    setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh();
  };

  // ---------- 헤더 ----------
  const teamName = teams.find(x => x.id === teamId)?.name ?? '전사';
  const lastDone = weeks.filter(x => x.end < today).at(-1);
  const head = (
    <PageHeader title={`${teamName} ${Number(bm.slice(5))}월 계획서`} desc={`업무월 ${d ? `${fmtMD(d.ms)} → ${fmtMD(d.me)}` : ''} · ${d?.plan ? (d.plan.status === 'submitted' ? `제출 ${fmtKST(d.plan.submitted_at)}` : '작성 중') : '아직 작성 전'}${d?.plan?.last_review_at ? ` · 마지막 리뷰 ${fmtKST(d.plan.last_review_at)}` : ''}${cur ? ` · ${cur}주차 진행 중` : ''}`}
      actions={<>
        {me.role !== 'manager' && <select value={teamId} onChange={e => go({ team: e.target.value, tab: t })} style={{ width: 140 }}><option value={0}>전사 보기</option>{teams.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><button className="btn ghost" onClick={() => go({ m: prevBizMonth(bm), tab: t })}>‹</button><b style={{ minWidth: 90, textAlign: 'center' }}>{bizLabel(bm)}</b><button className="btn ghost" disabled={bm >= nextBm} onClick={() => go({ m: nextBizMonth(bm), tab: t })}>›</button></div>
        {canEdit && d && <><button className="btn ghost" disabled={busy} onClick={() => save('save')}>임시저장</button>{lastDone && <button className="btn ghost" disabled={busy} onClick={() => save('review')}>{lastDone.no}주 리뷰 저장</button>}<button className="btn" disabled={busy} onClick={() => save('submit')}>{d.plan?.status === 'submitted' ? '다시 제출' : '제출'}</button></>}
      </>} />);

  const tabs = (
    <div style={{ display: 'flex', gap: 4, background: 'var(--panel)', border: '1px solid var(--line)', padding: 5, borderRadius: 14, position: 'sticky', top: 0, zIndex: 5 }}>
      {([['team', '팀', '목표 · 영업 전략 · 주차 리뷰'], ['people', '인원', '개인별 결과 · 판단 · 실행 기록'], ['exec', '요약', '빨간불 · 결정 필요']] as const).filter(x => teamId || x[0] === 'exec').map(([k, l, s]) => <button key={k} onClick={() => setT(k)} style={{ flex: 1, border: 0, borderRadius: 10, padding: '10px 8px', minHeight: 44, cursor: 'pointer', background: t === k ? 'var(--ink)' : 'transparent', color: t === k ? '#fff' : 'var(--muted)', fontWeight: 700, fontSize: 14 }}>{l}<span style={{ display: 'block', fontWeight: 500, fontSize: 11.5, opacity: .8 }}>{s}</span></button>)}
    </div>);

  // ---------- 전사 요약 (팀 선택 안 함) ----------
  if (!teamId || !d || !calc) return <div style={{ display: 'grid', gap: 20 }}>{head}
    <Section title="팀별 진행" sub={bizLabel(bm)} flush>
      <div style={{ overflowX: 'auto' }}><table><thead><tr><th>팀</th><th style={{ textAlign: 'right' }}>목표</th><th style={{ textAlign: 'right' }}>확정</th><th>진행</th><th style={{ textAlign: 'right' }}>지난 주 계획 / 실제</th><th>리뷰</th><th></th></tr></thead><tbody>
        {summaries.map((s: any) => { const bad = s.lastRatio != null && s.lastRatio < 0.5; return <tr key={s.team.id}><td><b>{s.team.name}</b> <span className="cell-sub" style={{ display: 'inline' }}>{teams.find(x => x.id === s.team.id)?.leader}</span></td><td className="num" style={{ textAlign: 'right' }}>{s.hasPlan ? won(s.target) : <span className="cell-sub">계획서 없음</span>}</td><td className="num" style={{ textAlign: 'right' }}>{won(s.confirmed)}</td><td style={{ minWidth: 130 }}>{s.hasPlan ? <><div className="bar"><i style={{ width: `${Math.min(100, s.pct)}%`, background: s.pct < 30 && s.lastWeek?.no > 2 ? 'var(--bad)' : undefined }} /></div><span className="cell-sub">{s.pct}%</span></> : '-'}</td><td className="num" style={{ textAlign: 'right' }}>{s.lastWeek ? <>{won(s.lastPlan)} / <span style={{ color: bad ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>{won(s.lastActual)}</span></> : '-'}</td><td>{!s.hasPlan ? <Status kind="bad">미작성</Status> : !s.lastWeek ? <Status kind="off">1주차</Status> : s.reviewed ? <Status kind="ok">{s.lastWeek.no}주 리뷰 완료</Status> : <Status kind={s.overdue >= (d?.cfg.reviewDays ?? 3) ? 'bad' : 'wait'}>{s.lastWeek.no}주 리뷰 안 함{s.overdue > 0 ? ` · ${s.overdue}일 지연` : ''}</Status>}</td><td><Link href={`/monthly?team=${s.team.id}&m=${bm}`} className="help">열기 →</Link></td></tr>; })}
        {summaries.length === 0 && <tr><td colSpan={7}><Empty>팀 없음</Empty></td></tr>}</tbody></table></div>
    </Section></div>;

  // ---------- 팀 탭 ----------
  const sum = calc.sum; const act1 = d.auto.reduce((a, m) => a + (lastDone ? m.weeks[lastDone.no]?.calls ?? 0 : 0), 0);
  const ren = d.renewals; const renStat = { o: ren.filter(x => (mem(x.user_id)?.renew[x.settle_no] ?? 'o') === 'o').length, t: ren.filter(x => mem(x.user_id)?.renew[x.settle_no] === 't').length, x: ren.filter(x => mem(x.user_id)?.renew[x.settle_no] === 'x').length, done: ren.filter(x => x.renewed).length, lost: ren.filter(x => !x.renewed && x.date_to < today && mem(x.user_id)?.renew[x.settle_no] !== 'x').length };
  const planCalls = d.auto.reduce((a, m) => a + (mem(m.user_id)?.activities.find(x => x.activity === '콜 (DB)')?.plan ? Object.values(mem(m.user_id).activities.find(x => x.activity === '콜 (DB)')!.plan).reduce((p, q) => p + nz(q), 0) : 0), 0);
  const teamTab = (<>
    <Section title="11월 목표" sub="숫자는 이 셋만 — 매출 · 재계약 · 영업활동">
      <div className="grid3">
        <div className="card" style={{ background: 'var(--bg)', borderColor: 'transparent' }}><div className="cell-sub" style={{ fontWeight: 700 }}>매출 (마진)</div><div className="num" style={{ fontSize: 26, fontWeight: 900 }}>{won(calc.target)} <span className="cell-sub" style={{ display: 'inline' }}>목표</span></div><div className="bar"><i style={{ width: `${calc.target ? Math.min(100, calc.confirmed / calc.target * 100) : 0}%`, background: 'var(--ok)' }} /></div><div className="cell-sub">현재 확정 <b className="num">{won(calc.confirmed)}</b> ({calc.target ? Math.round(calc.confirmed / calc.target * 100) : 0}%) · 구성 재계약 {man(sum.renew)} · 파이프 {man(sum.pipe)} · 신규 {man(sum.new)} · 업셀 {man(sum.upsell)}</div></div>
        <div className="card" style={{ background: 'var(--bg)', borderColor: 'transparent' }}><div className="cell-sub" style={{ fontWeight: 700 }}>재계약</div><div className="num" style={{ fontSize: 26, fontWeight: 900 }}>{ren.length}건 <span className="cell-sub" style={{ display: 'inline' }}>이달 종료</span></div><div className="cell-sub">○{renStat.o} △{renStat.t} ✕{renStat.x} · <b style={{ color: 'var(--ok-ink)' }}>연장됨 {renStat.done}</b>{renStat.lost ? <> · <b style={{ color: 'var(--bad-ink)' }}>종료됐는데 연장 없음 {renStat.lost}</b></> : null}</div></div>
        <div className="card" style={{ background: 'var(--bg)', borderColor: 'transparent' }}><div className="cell-sub" style={{ fontWeight: 700 }}>영업활동</div><div className="num" style={{ fontSize: 26, fontWeight: 900 }}>콜 {planCalls.toLocaleString()} <span className="cell-sub" style={{ display: 'inline' }}>월 계획</span></div><div className="cell-sub">{lastDone ? `${lastDone.no}주 실제 콜 ${act1.toLocaleString()}` : '아직 지난 주 없음'} · 이달 누적 콜 {d.auto.reduce((a, m) => a + m.month.calls, 0).toLocaleString()} · 신규 {d.auto.reduce((a, m) => a + m.month.new_cnt, 0)}건</div></div>
      </div>
    </Section>
    <Section title="이번 달 영업 전략" sub="월초에 쓰고, 리뷰 때 고침 · 팀장">
      <textarea style={ta} rows={5} disabled={!canEdit} value={st.strategy} onChange={e => upd(s => { s.strategy = e.target.value; })} placeholder={'1. 재계약 먼저 (1~2주) — …\n2. 신규는 소개·메일로 (2~3주) — …\n3. 사람별로 다르게 — …\n4. 업셀링 — …'} />
    </Section>
    <Section title="주차 리뷰" sub="매주 월요일 · 실제는 자동 · 미흡/보완만 씀" flush>
      <div style={{ display: 'grid' }}>{weeks.map(wk => { const tw = calc.teamW[wk.no]; const x = st.weeks[String(wk.no)] ?? { plan_margin: 0, issue: '', fix: '', focus: '', support: '', risk: '' }; const isCur = wk.no === cur; const done = tw.done; const ratio = tw.plan ? tw.actual / tw.plan : null;
        return <div key={wk.no} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, padding: '14px 22px', borderTop: '1px solid var(--line)', background: isCur ? 'var(--accent-soft)' : undefined }}>
          <div><b>{wk.no}주</b> {done ? <Status kind="ok">완료</Status> : isCur ? <Status kind="wait">진행 중</Status> : null}<div className="cell-sub num">{fmtMD(wk.start)} ~ {fmtMD(wk.end)}</div></div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="num" style={{ fontSize: 14 }}>계획 <b>{won(tw.plan)}</b>{tw.carry ? <span className="cell-sub" style={{ display: 'inline' }}> (이월 +{man(tw.carry)})</span> : null}{done || isCur ? <> → 실제 <b style={{ color: done && ratio != null && ratio < d.cfg.weekRatio ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>{won(tw.actual)}</b>{done && ratio != null ? ` (${Math.round(ratio * 100)}%)` : ''}</> : null}</div>
            {(done || isCur || canEdit) && <div className="grid2">
              {(done || x.issue) && <div><div className="cell-sub" style={{ fontWeight: 700, marginBottom: 2 }}>미흡 · 원인</div><textarea style={{ ...ta, minHeight: 56 }} rows={3} disabled={!canEdit} value={x.issue} onChange={e => upd(s => { s.weeks[String(wk.no)] = { ...x, issue: e.target.value }; })} placeholder="뭐가 안 됐고 왜" /></div>}
              <div><div className="cell-sub" style={{ fontWeight: 700, marginBottom: 2 }}>{done ? '그래서 다음 주 보완' : '이 주 보완 · 집중할 것'}</div><textarea style={{ ...ta, minHeight: 56 }} rows={3} disabled={!canEdit} value={x.fix} onChange={e => upd(s => { s.weeks[String(wk.no)] = { ...x, fix: e.target.value }; })} placeholder="뭘 바꾸는지 · 이 주에 집중할 것" /></div>
            </div>}
            {(isCur || x.support || x.risk) && <div className="grid2">
              <div><div className="cell-sub" style={{ fontWeight: 700, marginBottom: 2 }}>지원 요청 (대표·총괄·관리팀)</div><textarea style={{ ...ta, minHeight: 44 }} rows={2} disabled={!canEdit} value={x.support} onChange={e => upd(s => { s.weeks[String(wk.no)] = { ...x, support: e.target.value }; })} placeholder="한 줄에 하나 — 요약 탭 '결정 필요'에 올라감" /></div>
              <div><div className="cell-sub" style={{ fontWeight: 700, marginBottom: 2 }}>리스크</div><textarea style={{ ...ta, minHeight: 44 }} rows={2} disabled={!canEdit} value={x.risk} onChange={e => upd(s => { s.weeks[String(wk.no)] = { ...x, risk: e.target.value }; })} /></div>
            </div>}
          </div></div>; })}</div>
      <div className="cell-sub" style={{ padding: '10px 22px' }}>주차 계획 합 = 월 목표 {won(calc.target)} · 지난 주에서 빠진 금액은 이번 주에 이월로 얹힘</div>
    </Section>
  </>);

  // ---------- 인원 탭 ----------
  const pm = d.auto.find(m => m.user_id === person) ?? d.auto[0]; if (pm && pm.user_id !== person) { person = pm.user_id; } const ms = person ? mem(person) : null; const pc = person ? calc.per[person] : null;
  const typeOf = (uid: string) => (mem(uid)?.verdict ?? '').split(/[.。—\n]/)[0].trim().slice(0, 14);
  const peopleTab = pm && ms && pc ? (<>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{d.auto.map(m => <button key={m.user_id} onClick={() => setPerson(m.user_id)} className="btn ghost" style={{ borderRadius: 999, background: person === m.user_id ? 'var(--accent)' : undefined, color: person === m.user_id ? '#fff' : undefined, borderColor: person === m.user_id ? 'var(--accent)' : undefined }}>{m.name}{typeOf(m.user_id) ? <span style={{ fontSize: 11.5, fontWeight: 500, opacity: .85, marginLeft: 6 }}>{typeOf(m.user_id)}</span> : null}</button>)}</div>
    <Section title={<>{pm.name} <span className="cell-sub" style={{ display: 'inline', fontWeight: 500 }}>{pm.position ?? ''} · 지난달 {won(pm.prev.margin)}{pm.prev.target ? ` (목표 ${Math.round(pm.prev.margin / pm.prev.target * 100)}%)` : ''} · 신규 {pm.prev.margin ? Math.round(pm.prev.new_margin / pm.prev.margin * 100) : 0}% · 전환 {pm.prev.conv != null ? (pm.prev.conv * 100).toFixed(1) + '%' : '-'}</span></>} right={<span>이달 개인 목표 <b className="num" style={{ fontSize: 17, color: 'var(--accent)' }}>{won(pc.target)}</b> <span className="cell-sub" style={{ display: 'inline' }}>재계약 {man(pc.renew)} · 파이프 {man(pc.pipe)} · 신규 {man(pc.new)} · 업셀 {man(pc.upsell)}</span></span>}>
      <div className="grid3">
        {[['매출 (마진)', lastDone ? won(pm.weeks[lastDone.no]?.margin ?? 0) : won(pm.month.margin), lastDone ? `${lastDone.no}주 실제 · 계획 ${won((pc.keepW[lastDone.no] ?? 0) + (pc.newW[lastDone.no] ?? 0))} · 신규 ${man(pm.weeks[lastDone.no]?.new_margin ?? 0)} / 기존 ${man(pm.weeks[lastDone.no]?.keep_margin ?? 0)}` : '이달 누적'],
          ['재계약', `${ren.filter(x => x.user_id === person && x.renewed).length} / ${ren.filter(x => x.user_id === person).length}건`, ren.filter(x => x.user_id === person).slice(0, 3).map(x => `${x.cust_name} ${x.renewed ? '연장' : x.date_to < today ? '종료·미연장' : fmtMD(x.date_to)}`).join(' · ') || '이달 종료 없음'],
          ['영업활동', lastDone ? `콜 ${pm.weeks[lastDone.no]?.calls ?? 0}` : `콜 ${pm.month.calls}`, lastDone ? `${lastDone.no}주 · 계획 ${nz(ms.activities.find(a => a.activity === '콜 (DB)')?.plan[String(lastDone.no)])} · 신규 ${pm.weeks[lastDone.no]?.new_cnt ?? 0}건` : '이달 누적']].map(([l, v, s]) => <div key={String(l)} className="card" style={{ background: 'var(--bg)', borderColor: 'transparent' }}><div className="cell-sub" style={{ fontWeight: 700 }}>{l}</div><div className="num" style={{ fontSize: 24, fontWeight: 900 }}>{v}</div><div className="cell-sub">{s}</div></div>)}
      </div>
    </Section>
    <Section title="이 사람은 · 일 배분" sub="팀장 — 결과를 보고 유형과 무슨 일을 줄지 한 줄">
      <textarea style={ta} rows={3} disabled={!canEdit} value={ms.verdict} onChange={e => upd(s => { s.members[person].verdict = e.target.value; })} placeholder="재계약형. 기존 고객 유지·업셀이 강함 … → 일 배분: 이월 재계약 8건 + 업셀 2건은 전부 이 사람" />
    </Section>
    <Section title="주차별 실행 기록 — 시도 → 결과 → 변경" sub="실제 숫자는 자동 · 판단·변경은 팀장" flush>
      <div>{weeks.map(wk => { const x = ms.weeks[String(wk.no)] ?? { new_cnt: 0, new_amt: 0, keep_amt: 0, goal: '', tried: '', judged: '', changed: '' }; const a = pm.weeks[wk.no]; const done = wk.end < today; const isCur = wk.no === cur; const planAmt = (pc.keepW[wk.no] ?? 0) + nz(x.new_amt);
        return <div key={wk.no} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 14, padding: '12px 22px', borderTop: '1px solid var(--line)', background: isCur ? 'var(--accent-soft)' : undefined }}>
          <div><b>{wk.no}주</b><div className="cell-sub num">{fmtMD(wk.start)}~{fmtMD(wk.end)}</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '6px 10px', alignItems: 'start', fontSize: 14 }}>
            <span className="cell-sub" style={{ fontWeight: 700, paddingTop: 8 }}>마진</span><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span className="cell-sub">신규</span><input style={{ ...inp, width: 60 }} disabled={!canEdit} value={x.new_cnt || ''} onChange={e => upd(s => { s.members[person].weeks[String(wk.no)] = { ...x, new_cnt: nz(e.target.value) }; })} placeholder="건" title="신규 예상 건 (선택)" /><span className="cell-sub">건 ·</span><input style={{ ...inp, width: 110 }} disabled={!canEdit} value={x.new_amt ? x.new_amt.toLocaleString() : ''} onChange={e => upd(s => { s.members[person].weeks[String(wk.no)] = { ...x, new_amt: nz(e.target.value) }; })} placeholder="신규 마진" /><span className="cell-sub">+ 기존(재계약·파이프·업셀) <b className="num">{won(pc.keepW[wk.no] ?? 0)}</b> = <b className="num">{won(planAmt)}</b></span>{(done || isCur) && a && <span className="num" style={{ marginLeft: 6 }}>→ 실제 <b style={{ color: done && planAmt && a.margin < planAmt * d.cfg.weekRatio ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>{won(a.margin)}</b> <span className="cell-sub" style={{ display: 'inline' }}>(신규 {man(a.new_margin)} · 기존 {man(a.keep_margin)} · 콜 {a.calls} · 신규 {a.new_cnt}건)</span></span>}</div>
            <span className="cell-sub" style={{ fontWeight: 700, paddingTop: 8 }}>목표</span><textarea style={{ ...ta, minHeight: 40 }} rows={1} disabled={!canEdit} value={x.goal} onChange={e => upd(s => { s.members[person].weeks[String(wk.no)] = { ...x, goal: e.target.value }; })} placeholder="이 주 목표 — 사람마다 다르게 (재계약 9건 마감 · 업셀 2건 · 신규 3건 · 콜 220 …)" />
            <span className="cell-sub" style={{ fontWeight: 700, paddingTop: 8 }}>시도</span><textarea style={{ ...ta, minHeight: 40 }} rows={1} disabled={!canEdit} value={x.tried} onChange={e => upd(s => { s.members[person].weeks[String(wk.no)] = { ...x, tried: e.target.value }; })} placeholder="이 주에 하기로 한 것 (콜 220 · 메일 150 · 재계약 9건 마감 …)" />
            {(done || x.judged) && <><span className="cell-sub" style={{ fontWeight: 700, paddingTop: 8 }}>결과</span><textarea style={{ ...ta, minHeight: 40 }} rows={1} disabled={!canEdit} value={x.judged} onChange={e => upd(s => { s.members[person].weeks[String(wk.no)] = { ...x, judged: e.target.value }; })} placeholder="효과 있던 것 / 없던 것 · 원인" /></>}
            {(done || x.changed) && <><span className="cell-sub" style={{ fontWeight: 700, paddingTop: 8 }}>변경</span><textarea style={{ ...ta, minHeight: 40 }} rows={1} disabled={!canEdit} value={x.changed} onChange={e => upd(s => { s.members[person].weeks[String(wk.no)] = { ...x, changed: e.target.value }; })} placeholder="→ 다음 주 이렇게 바꿈" /></>}
          </div></div>; })}</div>
    </Section>
    <div className="grid2">
      <Section title="① 재계약" sub="슬롯 자동 · ○△✕ 팀장 · 결과 자동">
        {ren.filter(x => x.user_id === person).length ? <table style={{ fontSize: 13 }}><thead><tr><th>이달 종료</th><th>상품</th><th style={{ textAlign: 'right' }}>금액</th><th>연장</th><th>결과</th></tr></thead><tbody>
          {ren.filter(x => x.user_id === person).map(x => { const mk = ms.renew[x.settle_no] ?? 'o'; return <tr key={x.settle_no}><td><b>{x.cust_name}</b> <span className="cell-sub" style={{ display: 'inline' }}>{fmtMD(x.date_to)} 종료</span></td><td className="cell-sub">{x.prod_name}</td><td className="num" style={{ textAlign: 'right' }}>{nz(x.sale_total).toLocaleString()}</td><td><span style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 7, overflow: 'hidden' }}>{(['o', 't', 'x'] as const).map(k => <button key={k} type="button" disabled={!canEdit} onClick={() => upd(s => { s.members[person].renew[x.settle_no] = k; })} style={{ border: 0, padding: '2px 8px', cursor: canEdit ? 'pointer' : 'default', fontSize: 12, fontWeight: 700, background: mk === k ? (k === 'o' ? 'var(--ok)' : k === 't' ? 'var(--wait)' : 'var(--bad)') : 'transparent', color: mk === k ? '#fff' : 'var(--muted)' }}>{MARK[k]}</button>)}</span></td><td>{x.renewed ? <Status kind="ok">연장됨 {fmtMD(x.renewed.date_from)}부터</Status> : x.date_to < today ? <Status kind={mk === 'x' ? 'off' : 'bad'}>{mk === 'x' ? '이탈 (예상)' : '종료 · 연장 없음'}</Status> : <Status kind="off">{x.week_no}주 마감</Status>}</td></tr>; })}
        </tbody></table> : <Empty>이달 종료 슬롯 없음</Empty>}
        <div className="cell-sub" style={{ marginTop: 8, textAlign: 'right' }}>재계약 예상 <b className="num" style={{ color: 'var(--ink)', fontSize: 14 }}>{won(pc.renew)}</b> <span>(○100% · △{Math.round(wT * 100)}% · ✕0%)</span></div>
      </Section>
      <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        <Section title="② 파이프라인" sub="가망건 자동 · 체크·결제 주차 팀장">
          {d.pipes.filter(p => p.owner_id === person).length ? <table style={{ fontSize: 13 }}><thead><tr><th>업체</th><th>단계</th><th style={{ textAlign: 'right' }}>예상</th><th>이달</th><th>주</th></tr></thead><tbody>
            {d.pipes.filter(p => p.owner_id === person).map(p => { const c = ms.pipes[String(p.id)] ?? { checked: false, week_no: null }; return <tr key={p.id}><td><b>{p.client}</b></td><td><Status kind={p.stage === '결제' ? 'ok' : p.stage === '협상' ? 'wait' : 'off'}>{p.stage}</Status></td><td className="num" style={{ textAlign: 'right' }}>{p.amount.toLocaleString()}</td><td><input type="checkbox" disabled={!canEdit} checked={c.checked} onChange={e => upd(s => { s.members[person].pipes[String(p.id)] = { ...c, checked: e.target.checked, week_no: c.week_no ?? cur ?? 1 }; })} style={{ width: 18, height: 18 }} /></td><td><select disabled={!canEdit || !c.checked} value={c.week_no ?? ''} onChange={e => upd(s => { s.members[person].pipes[String(p.id)] = { ...c, week_no: Number(e.target.value) || null }; })} style={{ width: 64, padding: '3px 6px' }}><option value="">-</option>{weeks.map(w2 => <option key={w2.no} value={w2.no}>{w2.no}주</option>)}</select></td></tr>; })}
          </tbody></table> : <Empty>가망건 없음 — 주간보고 화면에서 등록</Empty>}
          <div className="cell-sub" style={{ marginTop: 8, textAlign: 'right' }}>전환 예상 <b className="num" style={{ color: 'var(--ink)', fontSize: 14 }}>{won(pc.pipe)}</b></div>
        </Section>
        <Section title="④ 기존 고객 업셀링" sub="팀장 — 추가 제안할 상품·금액·시점">
          {ms.upsells.map((u, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 110px 64px 28px', gap: 6, marginBottom: 6 }}><input disabled={!canEdit} value={u.cust_name} placeholder="고객" onChange={e => upd(s => { s.members[person].upsells[i].cust_name = e.target.value; })} /><input disabled={!canEdit} value={u.proposal} placeholder="추가 제안" onChange={e => upd(s => { s.members[person].upsells[i].proposal = e.target.value; })} /><input disabled={!canEdit} style={inp} value={u.amount ? u.amount.toLocaleString() : ''} placeholder="금액" onChange={e => upd(s => { s.members[person].upsells[i].amount = nz(e.target.value); })} /><select disabled={!canEdit} value={u.week_no ?? ''} onChange={e => upd(s => { s.members[person].upsells[i].week_no = Number(e.target.value) || null; })} style={{ padding: '3px 6px' }}><option value="">주</option>{weeks.map(w2 => <option key={w2.no} value={w2.no}>{w2.no}주</option>)}</select>{canEdit && <button type="button" className="btn ghost" style={{ padding: '2px 6px' }} onClick={() => upd(s => { s.members[person].upsells.splice(i, 1); })}>×</button>}</div>)}
          {canEdit && <button type="button" className="btn ghost" style={{ fontSize: 12.5 }} onClick={() => upd(s => { s.members[person].upsells.push({ cust_name: '', proposal: '', amount: 0, week_no: cur ?? 1 }); })}>+ 업셀 건 추가</button>}
          <div className="cell-sub" style={{ marginTop: 8, textAlign: 'right' }}>업셀 예상 <b className="num" style={{ color: 'var(--ink)', fontSize: 14 }}>{won(pc.upsell)}</b></div>
        </Section>
      </div>
    </div>
    <Section title="③ 신규 개척 — 주차별 활동" sub="계획은 팀장 · 실제는 콜·신규 자동, 나머지는 리뷰 때 입력 · 활동 종류 자유 추가" flush>
      <div style={{ overflowX: 'auto' }}><table style={{ fontSize: 13 }}><thead><tr><th style={{ minWidth: 150 }}>활동</th>{weeks.map(wk => <th key={wk.no} style={{ textAlign: 'right', background: wk.no === cur ? 'var(--accent-soft)' : wk.end < today ? 'var(--ok-soft)' : undefined }}>{wk.no}주 <span className="cell-sub" style={{ display: 'inline' }}>{wk.end < today ? '계획/실제' : wk.no === cur ? '진행' : ''}</span></th>)}<th style={{ textAlign: 'right' }}>월</th>{canEdit && <th></th>}</tr></thead><tbody>
        {ms.activities.map((a, i) => { const isCall = a.activity === '콜 (DB)'; const tot = weeks.reduce((s, wk) => s + nz(a.plan[String(wk.no)]), 0); return <tr key={i}><td><b>{a.activity}</b>{isCall && <div className="cell-sub">실제 = KPI 콜 자동</div>}</td>{weeks.map(wk => { const k = String(wk.no); const done = wk.end < today; const actual = isCall ? (pm.weeks[wk.no]?.calls ?? 0) : nz(a.actual[k]); const plan = nz(a.plan[k]); return <td key={k} style={{ textAlign: 'right' }}><input style={{ ...inp, width: 64, display: 'inline-block' }} disabled={!canEdit} value={plan || ''} placeholder="·" onChange={e => upd(s => { s.members[person].activities[i].plan[k] = nz(e.target.value); })} />{(done || wk.no === cur) && <div className="num" style={{ fontSize: 12, marginTop: 2, color: done && plan && actual < plan ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>실제 {isCall ? actual : <input style={{ ...inp, width: 56, display: 'inline-block', padding: '1px 4px', fontSize: 12 }} disabled={!canEdit} value={a.actual[k] ?? ''} placeholder="?" onChange={e => upd(s => { s.members[person].activities[i].actual[k] = nz(e.target.value); })} />}</div>}</td>; })}<td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{tot.toLocaleString()}</td>{canEdit && <td><button type="button" className="btn ghost" style={{ padding: '2px 6px' }} onClick={() => upd(s => { s.members[person].activities.splice(i, 1); })}>×</button></td>}</tr>; })}
        <tr className="total"><td>→ 신규 예상 (건 · 마진)</td>{weeks.map(wk => { const x = ms.weeks[String(wk.no)] ?? { new_cnt: 0, new_amt: 0 }; const a = pm.weeks[wk.no]; const done = wk.end < today; return <td key={wk.no} className="num" style={{ textAlign: 'right' }}>{nz(x?.new_cnt)}건 · {man(x?.new_amt)}{(done || wk.no === cur) && a ? <div style={{ fontSize: 12, color: done && nz(x?.new_cnt) && a.new_cnt < nz(x?.new_cnt) ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>실제 {a.new_cnt}건 · {man(a.new_margin)}</div> : null}</td>; })}<td className="num" style={{ textAlign: 'right' }}>{weeks.reduce((s, wk) => s + nz(ms.weeks[String(wk.no)]?.new_cnt), 0)}건 · {man(pc.new)}</td>{canEdit && <td />}</tr>
      </tbody></table></div>
      {canEdit && <AddActivity types={d.types} used={ms.activities.map(a => a.activity)} onAdd={name => upd(s => { s.members[person].activities.push({ activity: name, plan: {}, actual: {} }); })} />}
      <div style={{ padding: '0 22px 16px' }}><div className="cell-sub" style={{ fontWeight: 700, marginBottom: 2 }}>타깃 · 방법 · 근거 <span style={{ fontWeight: 400 }}>— 전환율을 지난달({pm.prev.conv != null ? (pm.prev.conv * 100).toFixed(1) + '%' : '-'})보다 크게 잡으면 근거를</span></div><textarea style={{ ...ta, minHeight: 48 }} rows={2} disabled={!canEdit} value={ms.target_note} onChange={e => upd(s => { s.members[person].target_note = e.target.value; })} placeholder="숙박·펜션 · 리워드+플레이스 묶음. 소개 요청은 재계약 ○ 고객 대상 …" /></div>
    </Section>
    <Section title="개인 영업 전략" sub="팀장">
      <textarea style={ta} rows={3} disabled={!canEdit} value={ms.strategy} onChange={e => upd(s => { s.members[person].strategy = e.target.value; })} placeholder="이 사람이 이 달에 어떻게 팔 건지 — 타깃, 상품, 순서" />
    </Section>
  </>) : <Empty>팀원이 없습니다</Empty>;

  // ---------- 요약 탭 (규칙 기반) ----------
  const execTab = (() => {
    const alerts: { lv: 'r' | 'y'; t: string }[] = []; const asks: string[] = [];
    if (lastDone) { const tw = calc.teamW[lastDone.no]; if (tw.plan && tw.actual < tw.plan * d.cfg.weekRatio) { alerts.push({ lv: 'r', t: `${lastDone.no}주 실제 ${won(tw.actual)} — 계획 ${won(tw.plan)}의 ${Math.round(tw.actual / tw.plan * 100)}%. 이월 ${man(calc.teamW[cur ?? lastDone.no]?.carry ?? 0)}이 이번 주에 얹힘.` }); asks.push(`${lastDone.no}주 미달분 ${man(tw.plan - tw.actual)} — 이번 주에 회복 가능한 근거는? (결제 약속 건별 날짜·금액)`); } }
    if (renStat.lost) { const l = ren.filter(x => !x.renewed && x.date_to < today && mem(x.user_id)?.renew[x.settle_no] !== 'x'); alerts.push({ lv: 'r', t: `종료됐는데 연장 없는 재계약 ${l.length}건 (${l.slice(0, 4).map(x => `${x.cust_name} ${man(x.sale_total)}`).join(', ')}${l.length > 4 ? ' …' : ''}) — ○/△로 잡혀 있던 것.` }); asks.push('종료 후 연장 안 된 건 — 밀린 건지 잃은 건지 건별로.'); }
    const lostX = ren.filter(x => mem(x.user_id)?.renew[x.settle_no] === 'x'); if (lostX.length) alerts.push({ lv: 'y', t: `이탈 예상 ✕ ${lostX.length}건 ${won(lostX.reduce((a, x) => a + nz(x.sale_total), 0))} — 메꾸는 계획이 ③·④에 있는지.` });
    for (const m of d.auto) { const s = mem(m.user_id); const pc2 = calc.per[m.user_id]; const planCalls2 = weeks.reduce((a, wk) => a + nz(s.activities.find(x => x.activity === '콜 (DB)')?.plan[String(wk.no)]), 0); const planNew = weeks.reduce((a, wk) => a + nz(s.weeks[String(wk.no)]?.new_cnt), 0); const conv = planCalls2 ? planNew / planCalls2 : null;
      if (conv != null && m.prev.conv != null && m.prev.conv > 0 && conv > m.prev.conv * d.cfg.convMult) alerts.push({ lv: 'y', t: `${m.name} 전환율 가정 ${(conv * 100).toFixed(1)}% — 지난달 ${(m.prev.conv * 100).toFixed(1)}%의 ${(conv / m.prev.conv).toFixed(1)}배. 근거: ${s.target_note?.trim() || '(없음)'}` });
      if (lastDone) { const a = m.weeks[lastDone.no]; const pl = (pc2.keepW[lastDone.no] ?? 0) + (pc2.newW[lastDone.no] ?? 0); if (pl && a && a.margin < pl * d.cfg.weekRatio) alerts.push({ lv: a.margin === 0 ? 'r' : 'y', t: `${m.name} ${lastDone.no}주 ${won(a.margin)} / 계획 ${won(pl)} · 콜 ${a.calls} · 신규 ${a.new_cnt}건${s.weeks[String(lastDone.no)]?.changed ? ` → 변경: ${s.weeks[String(lastDone.no)].changed}` : ' → 변경 기록 없음'}` }); }
    }
    const curW = cur ? st.weeks[String(cur)] : null; const reviewDue = lastDone && d.plan && !d.detail?.weeks?.find((x: any) => x.week_no === lastDone.no)?.reviewed_at; const overdue = lastDone ? Math.round((new Date(today + 'T00:00:00Z').getTime() - new Date(addDays(lastDone.end, 1) + 'T00:00:00Z').getTime()) / 864e5) : 0;
    if (reviewDue && overdue >= d.cfg.reviewDays) alerts.push({ lv: 'r', t: `${lastDone!.no}주 리뷰 안 함 — ${overdue}일 지연` });
    const supports = weeks.flatMap(wk => (st.weeks[String(wk.no)]?.support ?? '').split('\n').map(x => x.trim()).filter(Boolean).map(x => ({ wk: wk.no, t: x }))).filter(x => !lastDone || x.wk >= (cur ?? lastDone.no));
    const oneLine = lastDone ? `${lastDone.no}주 계획 ${man(calc.teamW[lastDone.no].plan)} 중 ${man(calc.teamW[lastDone.no].actual)} (${calc.teamW[lastDone.no].plan ? Math.round(calc.teamW[lastDone.no].actual / calc.teamW[lastDone.no].plan * 100) : 0}%). 목표 ${man(calc.target)} · 현재 확정 ${man(calc.confirmed)} (${calc.target ? Math.round(calc.confirmed / calc.target * 100) : 0}%).` : `월초 — 목표 ${man(calc.target)} (재계약 ${man(sum.renew)} · 파이프 ${man(sum.pipe)} · 신규 ${man(sum.new)} · 업셀 ${man(sum.upsell)})`;
    return (<>
      <Section title={`${teamName} · ${lastDone ? `${lastDone.no}주 리뷰` : '월초 계획'}`} sub={d.plan?.last_review_at ? `마지막 리뷰 ${fmtKST(d.plan.last_review_at)}` : d.plan ? '리뷰 전' : '계획서 없음'} right={!d.plan ? <Status kind="bad">미작성</Status> : reviewDue ? <Status kind={overdue >= d.cfg.reviewDays ? 'bad' : 'wait'}>리뷰 대기</Status> : <Status kind="ok">리뷰 완료</Status>}>
        <p style={{ margin: 0, fontSize: 15 }}><b>한 줄:</b> {oneLine}{curW?.fix ? ` 이번 주: ${curW.fix.split('\n')[0]}` : ''}</p>
      </Section>
      <Section title="빨간불" sub={`기준 — 주 실적 ${Math.round(d.cfg.weekRatio * 100)}% 미만 · 종료 후 미연장 · 전환율 가정 ${d.cfg.convMult}배↑ · 리뷰 ${d.cfg.reviewDays}일 지연`}>
        {alerts.length ? alerts.map((a, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 8, padding: '8px 12px', borderRadius: 10, marginBottom: 6, background: a.lv === 'r' ? 'var(--bad-soft)' : 'var(--wait-soft)' }}><b style={{ textAlign: 'center' }}>{a.lv === 'r' ? '!' : '△'}</b><span>{a.t}</span></div>) : <Empty>빨간불 없음</Empty>}
      </Section>
      <div className="grid2">
        <Section title="결정 · 확인 필요 (대표 · 총괄)" sub="주차 리뷰의 '지원 요청'에서">
          {supports.length ? supports.map((x, i) => <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', fontSize: 14 }}><input type="checkbox" style={{ width: 18, height: 18, marginTop: 3 }} /><span>{x.t} <span className="cell-sub" style={{ display: 'inline' }}>· {x.wk}주</span></span></label>) : <Empty>요청 없음</Empty>}
        </Section>
        <Section title="사람별 한 줄">
          {d.auto.map(m => { const s = mem(m.user_id); const pc2 = calc.per[m.user_id]; const a = lastDone ? m.weeks[lastDone.no] : null; const pl = lastDone ? (pc2.keepW[lastDone.no] ?? 0) + (pc2.newW[lastDone.no] ?? 0) : 0; return <div key={m.user_id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, padding: '7px 0', borderTop: '1px solid var(--line-soft)', fontSize: 14 }}><b>{m.name}</b><span>{typeOf(m.user_id) ? `${typeOf(m.user_id)} · ` : ''}{a ? <>{lastDone!.no}주 <b style={{ color: pl && a.margin < pl * d.cfg.weekRatio ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>{man(a.margin)}</b>(계획 {man(pl)}) · 신규 {a.new_cnt}건 · </> : ''}목표 {man(pc2.target)}{(s.weeks[String(cur ?? 0)]?.goal || s.weeks[String(cur ?? 0)]?.tried) ? ` · 이번 주: ${(s.weeks[String(cur ?? 0)].goal || s.weeks[String(cur ?? 0)].tried).slice(0, 40)}` : ''}</span></div>; })}
        </Section>
      </div>
      <Section title="팀장에게 물어볼 것" sub="빨간불에서 자동 생성 · 리뷰 미팅용">
        {asks.length ? <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>{asks.map((q, i) => <li key={i}>{q}</li>)}</ol> : <Empty>없음</Empty>}
        {cur && weeks[cur] && <div className="cell-sub" style={{ marginTop: 10 }}>다음 리뷰 {fmtMD(addDays(weeks[cur - 1].end, 1))} (월) · 그때 볼 것: {cur}주 계획 {won(calc.teamW[cur].plan)} 달성 여부 · 미연장 재계약 · 사람별 변경 기록</div>}
      </Section>
    </>);
  })();

  return <div style={{ display: 'grid', gap: 18 }}>
    {head}{tabs}
    {t === 'team' && teamTab}
    {t === 'people' && peopleTab}
    {t === 'exec' && execTab}
    {!canEdit && d.plan && <div className="cell-sub" style={{ textAlign: 'center' }}>열람 전용 — {teams.find(x => x.id === teamId)?.leader || '팀장'}이 작성</div>}
  </div>;
}

function AddActivity({ types, used, onAdd }: { types: string[]; used: string[]; onAdd: (n: string) => void }) {
  const [open, setOpen] = useState(false); const [v, setV] = useState('');
  const avail = types.filter(t => !used.includes(t));
  return <div style={{ padding: '10px 22px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    {avail.map(t => <button key={t} type="button" className="btn ghost" style={{ fontSize: 12.5, padding: '4px 10px' }} onClick={() => onAdd(t)}>+ {t}</button>)}
    {!open ? <button type="button" className="btn ghost" style={{ fontSize: 12.5, padding: '4px 10px', borderStyle: 'dashed' }} onClick={() => setOpen(true)}>+ 새 활동 종류</button>
      : <span style={{ display: 'inline-flex', gap: 6 }}><input value={v} onChange={e => setV(e.target.value)} placeholder="예: 업셀 콜, 방문, 동석 콜" style={{ width: 180, padding: '4px 8px' }} /><button type="button" className="btn" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={async () => { const nm = v.trim(); if (!nm) return; const x = await addActivityType(nm); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { onAdd(nm); setV(''); setOpen(false); } }}>추가</button></span>}
  </div>;
}

function init(d: PlanData | null): PlanState {
  const s: PlanState = { strategy: d?.plan?.strategy ?? '', weeks: {}, members: {} };
  if (!d) return s;
  for (const wk of d.weeks) { const x = d.detail?.weeks?.find((y: any) => y.week_no === wk.no); s.weeks[String(wk.no)] = { plan_margin: Number(x?.plan_margin ?? 0), issue: x?.issue ?? '', fix: x?.fix ?? '', focus: x?.focus ?? '', support: x?.support ?? '', risk: x?.risk ?? '' }; }
  for (const m of d.auto) {
    const dm = d.detail?.members?.find((y: any) => y.user_id === m.user_id);
    const ms: MemberState = { renew: {}, pipes: {}, upsells: [], activities: [], weeks: {}, verdict: dm?.verdict ?? '', strategy: dm?.strategy ?? '', target_note: dm?.target_note ?? '' };
    for (const r of d.renewals.filter(x => x.user_id === m.user_id)) ms.renew[r.settle_no] = (d.detail?.renewals?.find((y: any) => y.settle_no === r.settle_no)?.mark ?? 'o');
    for (const p of d.pipes.filter(x => x.owner_id === m.user_id)) { const y = d.detail?.pipes?.find((z: any) => z.pipeline_id === p.id); ms.pipes[String(p.id)] = { checked: !!y?.checked, week_no: y?.week_no ?? null }; }
    ms.upsells = (d.detail?.upsells ?? []).filter((u: any) => u.user_id === m.user_id).map((u: any) => ({ cust_name: u.cust_name, proposal: u.proposal ?? '', amount: Number(u.amount), week_no: u.week_no }));
    const acts = (d.detail?.activities ?? []).filter((a: any) => a.user_id === m.user_id);
    ms.activities = acts.length ? acts.map((a: any) => ({ activity: a.activity, plan: a.plan ?? {}, actual: a.actual ?? {} })) : DEFAULT_ACTS.filter(x => d.types.includes(x) || x === '콜 (DB)').map(a => ({ activity: a, plan: {}, actual: {} }));
    for (const wk of d.weeks) { const y = (d.detail?.memberWeeks ?? []).find((z: any) => z.user_id === m.user_id && z.week_no === wk.no); ms.weeks[String(wk.no)] = { new_cnt: Number(y?.new_cnt ?? 0), new_amt: Number(y?.new_amt ?? 0), keep_amt: Number(y?.keep_amt ?? 0), goal: y?.goal ?? '', tried: y?.tried ?? '', judged: y?.judged ?? '', changed: y?.changed ?? '' }; }
    s.members[m.user_id] = ms;
  }
  return s;
}
