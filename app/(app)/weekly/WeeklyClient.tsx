'use client';
import { notify } from '@/components/Toast';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveReport, addPipeline, updatePipeline } from './actions';
import { won, man, fmtMD, fmtKST } from '@/lib/date/kst';
import type { Profile } from '@/lib/auth/session';
type K = { user_id: string; work_date: string; calls: number; new_cnt: number; margin: number; kakao_db: number; overtime: boolean; new_margin: number; work_report: string | null; feedback: string | null };
type P = { id: number; owner_id: string; client: string; stage: string; expected_margin: string | null; next_action: string | null; risk: string | null; support: string | null; memo: string | null };
type Rep = { id: number; goal_margin: number; issues: string | null; checkpoints: string[]; common_directive: string | null; status: string; submitted_at: string | null } | null;
const STAGES = ['콜', '연결', '카톡', '협상', '결제'];
const stageStyle: Record<string, React.CSSProperties> = { 콜: { background: 'var(--bg)', color: 'var(--muted)' }, 연결: { background: 'var(--bg)', color: 'var(--muted)' }, 카톡: {}, 협상: { background: '#FDF1DD', color: '#D97706' }, 결제: { background: 'var(--ok-soft)', color: 'var(--ok)' } };

export default function WeeklyClient(p: { me: Profile; teams: { id: number; name: string; leader_id: string | null }[]; teamId: number; ws: string; we: string; ps: string; pe: string; weeks: string[]; members: { id: string; name: string; position: string | null }[]; kpi: K[]; report: Rep; notes: { user_id: string; directive: string | null; feedback: string | null }[]; pipeline: P[]; targets: Record<string, number>; monthStart: string; monthEnd: string; monthKey: string }) {
  const { me, teams, teamId, ws, we, ps, pe, weeks, members, kpi, report, notes, pipeline, targets, monthStart, monthEnd, monthKey } = p;
  const r = useRouter(); const [msg, setMsg] = useState(''); const [cps, setCps] = useState<string[]>(report?.checkpoints?.length ? report.checkpoints : ['']);
  const canEdit = me.role === 'admin' || (me.role === 'manager' && me.team_id === teamId);
  const ids = members.map(m => m.id);
  const S = (rows: K[], k: keyof K) => rows.reduce((a, x) => a + Number(x[k] || 0), 0);
  const inW = (a: string, b: string) => kpi.filter(x => x.work_date >= a && x.work_date <= b);
  const cur = inW(ws, we), prev = inW(ps, pe), month = kpi.filter(x => x.work_date >= monthStart && x.work_date <= monthEnd); const mLabel = `${Number(monthKey.slice(5))}월(${monthStart.slice(5).replace('-', '/')}~${monthEnd.slice(5).replace('-', '/')})`;
  const goal = report?.goal_margin ?? 0; const mW = S(cur, 'margin'); const rate = goal ? mW / goal : 0;
  const nm = (id: string) => members.find(m => m.id === id)?.name ?? '-';
  const ro = (v: string | null | undefined) => <div style={{ whiteSpace: 'pre-wrap', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, minHeight: 36, fontSize: 13, color: v ? 'inherit' : 'var(--muted)' }}>{v || '미입력'}</div>;
  const ta = (name: string, v: string | null | undefined, rows = 3, ph = '') => canEdit ? <textarea name={name} rows={rows} defaultValue={v ?? ''} placeholder={ph} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, width: '100%' }} /> : ro(v);
  const Sec = ({ b, t, d, children, right }: { b: string; t: string; d?: string; children: React.ReactNode; right?: React.ReactNode }) => <div className="card"><div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}><span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{b}</span><div><div style={{ fontWeight: 700, fontSize: 15 }}>{t}</div>{d && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d}</div>}</div><div style={{ marginLeft: 'auto' }}>{right}</div></div>{children}</div>;
  const A = [['총 콜수', 'calls'], ['총 신규', 'new_cnt'], ['총 마진', 'margin'], ['카톡DB', 'kakao_db'], ['야근일수', 'overtime']] as const;
  const val = (rows: K[], k: string) => k === 'overtime' ? rows.filter(x => x.overtime).length : S(rows, k as keyof K);
  const fmt = (k: string, v: number) => k === 'margin' ? won(v) : v.toLocaleString();

  return (
    <form action={async fd => { const x = await saveReport(fd); { notify(x.msg); setMsg(x.msg); }; if (x.ok) r.refresh(); }} style={{ display: 'grid', gap: 18 }}>
      <input type="hidden" name="team_id" value={teamId} /><input type="hidden" name="week_start" value={ws} />
      <div style={{ background: 'linear-gradient(120deg,#101A4A,#26308F)', color: '#fff', borderRadius: 16, padding: '22px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
        <div><h1 style={{ margin: '0 0 4px', fontSize: 20 }}>영업팀 팀장 주간보고</h1><div style={{ fontSize: 12.5, opacity: .85, display: 'flex', gap: 14 }}><span>{teams.find(t => t.id === teamId)?.name}</span><span>{fmtMD(ws)} ~ {fmtMD(we)}</span><span>{report?.status === 'submitted' ? `제출 완료 ${fmtKST(report.submitted_at)}` : '작성 중'}</span></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {me.role !== 'manager' && <select value={teamId} onChange={e => r.push(`/weekly?team=${e.target.value}&w=${ws}`)} style={{ width: 110, padding: '7px 10px', background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>{teams.map(t => <option key={t.id} value={t.id} style={{ color: '#111' }}>{t.name}</option>)}</select>}
          <select value={ws} onChange={e => r.push(`/weekly?team=${teamId}&w=${e.target.value}`)} style={{ width: 170, padding: '7px 10px', background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>{weeks.map(w => <option key={w} value={w} style={{ color: '#111' }}>{fmtMD(w)} ~ {fmtMD(w.slice(0, 0) + addDaysStr(w, 6))}</option>)}</select>
          {canEdit && <><button name="submit" value="0" className="btn ghost" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>임시저장</button><button name="submit" value="1" className="btn" style={{ background: '#fff', color: '#1B2A8A' }}>제출</button></>}
        </div>
      </div>
      {msg && <div className="card" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <div className="card"><div style={{ fontSize: 12, color: 'var(--muted)' }}>주간 목표 마진</div>{canEdit ? <input name="goal_margin" type="number" defaultValue={goal} style={{ fontSize: 20, fontWeight: 800, padding: '4px 8px', marginTop: 4 }} /> : <div style={{ fontSize: 22, fontWeight: 800 }}>{won(goal)}</div>}</div>
        <div className="card"><div style={{ fontSize: 12, color: 'var(--muted)' }}>이번 주 마진</div><div style={{ fontSize: 22, fontWeight: 800, color: mW < 0 ? 'var(--bad)' : 'inherit' }}>{won(mW)}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>일간 KPI 자동 합산</div></div>
        <div className="card"><div style={{ fontSize: 12, color: 'var(--muted)' }}>주간 달성률</div><div style={{ fontSize: 22, fontWeight: 800, color: rate >= 1 ? 'var(--ok)' : rate >= .7 ? '#D97706' : 'var(--bad)' }}>{(rate * 100).toFixed(1)}%</div><div style={{ height: 8, background: 'var(--line)', borderRadius: 6 }}><div style={{ width: `${Math.min(100, rate * 100)}%`, height: '100%', background: rate >= 1 ? 'var(--ok)' : 'var(--accent)', borderRadius: 6 }} /></div></div>
        <div className="card"><div style={{ fontSize: 12, color: 'var(--muted)' }}>전주 대비</div><div style={{ fontSize: 22, fontWeight: 800, color: mW - S(prev, 'margin') >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{mW - S(prev, 'margin') >= 0 ? '+' : ''}{man(mW - S(prev, 'margin'))}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>전주 {fmtMD(ps)} ~ {fmtMD(pe)}</div></div>
      </div>
      <Sec b="A" t="팀 요약" d="이번주 / 전주 · 일간 KPI 자동 집계">
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 18 }}>
          <table><thead><tr><th>지표</th><th style={{ textAlign: 'right' }}>이번주</th><th style={{ textAlign: 'right' }}>전주</th><th style={{ textAlign: 'right' }}>증감</th><th style={{ textAlign: 'right' }}>증감%</th></tr></thead><tbody>{A.map(([l, k]) => { const a = val(cur, k), b = val(prev, k), d = a - b; const c = d > 0 ? 'var(--ok)' : d < 0 ? 'var(--bad)' : 'inherit'; return <tr key={k}><td>{l}</td><td style={{ textAlign: 'right' }}><b>{fmt(k, a)}</b></td><td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(k, b)}</td><td style={{ textAlign: 'right', color: c }}>{d > 0 ? '+' : ''}{fmt(k, d)}</td><td style={{ textAlign: 'right', color: c }}>{b ? (d / b * 100).toFixed(1) + '%' : '-'}</td></tr>; })}</tbody></table>
          <table><thead><tr><th>인원 ({mLabel} 누계)</th><th style={{ textAlign: 'right' }}>신규</th><th style={{ textAlign: 'right' }}>신규 마진</th><th style={{ textAlign: 'right' }}>마진</th></tr></thead><tbody>{members.map(m => { const rows = month.filter(x => x.user_id === m.id); return <tr key={m.id}><td><b>{m.name}</b></td><td style={{ textAlign: 'right' }}>{S(rows, 'new_cnt')}</td><td style={{ textAlign: 'right' }}>{won(S(rows, 'new_margin'))}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{won(S(rows, 'margin'))}</td></tr>; })}<tr style={{ fontWeight: 700, background: 'var(--bg)' }}><td>총합</td><td style={{ textAlign: 'right' }}>{S(month, 'new_cnt')}</td><td style={{ textAlign: 'right' }}>{won(S(month, 'new_margin'))}</td><td style={{ textAlign: 'right' }}>{won(S(month, 'margin'))}</td></tr></tbody></table>
        </div>
      </Sec>
      <Sec b="B" t="신규 가망건 파이프라인" d="단계: 콜 → 연결 → 카톡 → 협상 → 결제" right={<span className="pill">{pipeline.length}건</span>}>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>담당자</th><th>업체명</th><th>단계</th><th>예상 마진</th><th>다음 액션</th><th>리스크</th><th>필요 지원</th><th style={{ minWidth: 200 }}>비고</th>{canEdit && <th></th>}</tr></thead><tbody>
          {pipeline.map(x => <tr key={x.id}><td>{nm(x.owner_id)}</td><td><b>{x.client}</b></td><td>{canEdit ? <select value={x.stage} onChange={async e => { const res = await updatePipeline(x.id, { stage: e.target.value }); { notify(res.msg); setMsg(res.msg); }; r.refresh(); }} style={{ width: 80, padding: '4px 6px', fontSize: 12 }}>{STAGES.map(s => <option key={s}>{s}</option>)}</select> : <span className="pill" style={stageStyle[x.stage]}>{x.stage}</span>}</td><td>{x.expected_margin}</td><td>{x.next_action}</td><td>{x.risk || <span style={{ color: 'var(--muted)' }}>-</span>}</td><td>{x.support || <span style={{ color: 'var(--muted)' }}>-</span>}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{x.memo}</td>{canEdit && <td><button type="button" className="btn ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={async () => { if (!confirm('종료 처리할까요? (결제 완료·이탈)')) return; const res = await updatePipeline(x.id, { is_active: false }); { notify(res.msg); setMsg(res.msg); }; r.refresh(); }}>종료</button></td>}</tr>)}
          {pipeline.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>등록된 가망건 없음</td></tr>}
        </tbody></table></div>
        {canEdit && <PipelineAdd teamId={teamId} members={members} onDone={m => { setMsg(m); r.refresh(); }} />}
      </Sec>
      <Sec b="C" t="팀장 코멘트" d="이슈·요청사항과 다음주 체크포인트">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div><label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>이슈 / 요청사항 <span style={{ fontWeight: 400, color: 'var(--muted)' }}>총괄·대표에게</span></label>{ta('issues', report?.issues, 6, '없으면 비워두세요')}</div>
          <div><label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>다음주 체크포인트 / 지시</label>{cps.map((c, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, marginBottom: 8, alignItems: 'start' }}><span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, marginTop: 4 }}>{i + 1}</span>{canEdit ? <textarea name="checkpoint" rows={2} defaultValue={c} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8 }} /> : ro(c)}{canEdit && <button type="button" className="btn ghost" style={{ padding: '4px 8px', fontSize: 12, marginTop: 4 }} onClick={() => setCps(cps.filter((_, j) => j !== i))}>삭제</button>}</div>)}{canEdit && <button type="button" className="btn ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setCps([...cps, ''])}>+ 지시 추가</button>}</div>
        </div>
      </Sec>
      <Sec b="D" t="인원별 지시사항 · 피드백 · 이달 목표" d="공통 지시 + 인원별 지시/피드백 + 개인 월 목표(팀장이 배정, 저장 시 반영)">
        <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>이번 주 공통 지시</label>{ta('common_directive', report?.common_directive, 2)}</div>
        {members.map(m => { const n = notes.find(x => x.user_id === m.id); const mo = S(month.filter(x => x.user_id === m.id), 'margin'); const tg = targets[m.id] ?? 0; return (
          <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 1fr', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--line)', alignItems: 'start' }}>
            <div><input type="hidden" name="member_id" value={m.id} /><b>{m.name}</b><div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.position}</div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{mLabel} 목표 마진 (원) {canEdit && <span style={{ color: 'var(--accent)' }}>· 팀장 입력</span>}</div>{canEdit ? <input name="member_target" type="number" defaultValue={tg || ''} placeholder="15000000" style={{ padding: '5px 8px', fontSize: 13, fontWeight: 700 }} /> : <div style={{ fontWeight: 700 }}>{won(tg)}</div>}<div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{mLabel} 마진 <b style={{ color: 'var(--ink)' }}>{man(mo)}</b> / {man(tg)} ({tg ? Math.round(mo / tg * 100) : 0}%)</div><div style={{ height: 6, background: 'var(--line)', borderRadius: 4, marginTop: 4 }}><div style={{ width: `${tg ? Math.min(100, mo / tg * 100) : 0}%`, height: '100%', background: mo / (tg || 1) >= 1 ? 'var(--ok)' : 'var(--accent)', borderRadius: 4 }} /></div></div>
            <div><div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>주간 지시사항</div>{ta('directive', n?.directive, 4)}</div>
            <div><div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>피드백</div>{ta('feedback', n?.feedback, 4)}</div>
          </div>); })}
        {members.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>팀원이 없습니다.</div>}
      </Sec>
      <Sec b="E" t="일간 KPI 원문" d={`이번 주 ${cur.length}건`}>
        <details><summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>펼치기</summary>
          <div style={{ overflowX: 'auto', marginTop: 10 }}><table><thead><tr><th>이름</th><th>날짜</th><th style={{ textAlign: 'right' }}>콜</th><th style={{ textAlign: 'right' }}>신규</th><th style={{ textAlign: 'right' }}>마진</th><th style={{ textAlign: 'right' }}>카톡DB</th><th>야근</th><th style={{ textAlign: 'right' }}>신규마진</th><th style={{ minWidth: 260 }}>업무 보고</th><th style={{ minWidth: 200 }}>느낀점</th></tr></thead><tbody>{cur.map((x, i) => <tr key={i}><td>{nm(x.user_id)}</td><td>{fmtMD(x.work_date)}</td><td style={{ textAlign: 'right' }}>{x.calls}</td><td style={{ textAlign: 'right' }}>{x.new_cnt || '-'}</td><td style={{ textAlign: 'right', color: x.margin < 0 ? 'var(--bad)' : 'inherit' }}>{won(x.margin)}</td><td style={{ textAlign: 'right' }}>{x.kakao_db}</td><td>{x.overtime ? '야근' : '-'}</td><td style={{ textAlign: 'right' }}>{x.new_margin ? won(x.new_margin) : '-'}</td><td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{x.work_report}</td><td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{x.feedback}</td></tr>)}</tbody></table></div></details>
      </Sec>
      {canEdit && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button name="submit" value="0" className="btn ghost">임시저장</button><button name="submit" value="1" className="btn">제출</button></div>}
    </form>
  );
}
function addDaysStr(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
function PipelineAdd({ teamId, members, onDone }: { teamId: number; members: { id: string; name: string }[]; onDone: (m: string) => void }) {
  // form 중첩 방지: 별도 폼 대신 개별 입력 + 버튼으로 처리
  const [v, setV] = useState({ owner_id: members[0]?.id ?? '', client: '', stage: '콜', expected_margin: '', next_action: '', risk: '', support: '', memo: '' });
  const set = (k: string, x: string) => setV({ ...v, [k]: x });
  const inp = (k: keyof typeof v, ph: string, w?: string) => <input value={v[k]} onChange={e => set(k, e.target.value)} placeholder={ph} style={{ padding: '6px 9px', fontSize: 12.5, width: w }} />;
  return <div style={{ display: 'grid', gridTemplateColumns: '100px 1.2fr 80px 90px 1fr 90px 90px 1.2fr auto', gap: 6, marginTop: 10, padding: 10, background: 'var(--bg)', borderRadius: 10 }}>
    <select value={v.owner_id} onChange={e => set('owner_id', e.target.value)} style={{ padding: '6px 8px', fontSize: 12.5 }}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
    {inp('client', '업체명')}<select value={v.stage} onChange={e => set('stage', e.target.value)} style={{ padding: '6px 8px', fontSize: 12.5 }}>{STAGES.map(s => <option key={s}>{s}</option>)}</select>{inp('expected_margin', '10슬롯')}{inp('next_action', '다음 액션')}{inp('risk', '-')}{inp('support', '-')}{inp('memo', '비고')}
    <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={async () => { const fd = new FormData(); fd.set('team_id', String(teamId)); Object.entries(v).forEach(([k, x]) => fd.set(k, x)); const res = await addPipeline(fd); onDone(res.msg); if (res.ok) setV({ ...v, client: '', expected_margin: '', next_action: '', risk: '', support: '', memo: '' }); }}>추가</button>
  </div>;
}
