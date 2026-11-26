'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { EDU_DOCS, SCRIPT_PARTS, STAGE_LABEL, PASS_SCORE, type EduRow, type EduStage } from '@/lib/metaEduShared';
import { eduStep1, eduRetake, eduDeploy, eduUndeploy, eduScriptBack, eduScriptSave } from './actions';
const md = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ');
const box: React.CSSProperties = { border: '1px solid #D0D5DD', borderRadius: 6, padding: '8px 10px', fontSize: 13.5, width: '100%', fontFamily: 'inherit', lineHeight: 1.6 };
const SC: Record<EduStage, string> = { step1: '#667085', docs: '#175CD3', exam: '#175CD3', locked: '#B42318', script: '#B54708', review: '#B54708', done: '#067647' };
type Wrong = { subject: string; q: string; mine: string; answer: string; why: string };

function Step({ n, title, state, children }: { n: number; title: string; state: 'done' | 'now' | 'wait'; children?: React.ReactNode }) {
  const c = state === 'done' ? '#067647' : state === 'now' ? '#175CD3' : '#98A2B3';
  return <div className="card" style={{ marginBottom: 10, opacity: state === 'wait' ? .6 : 1, borderLeft: `4px solid ${c}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 26, height: 26, borderRadius: 13, background: c, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{state === 'done' ? '✓' : n}</span>
      <b style={{ fontSize: 15 }}>{title}</b><span style={{ fontSize: 12.5, color: c, fontWeight: 700 }}>{state === 'done' ? '완료' : state === 'now' ? '지금 할 일' : '앞 단계를 마치면 열립니다'}</span>
    </div>
    {state !== 'wait' && children && <div style={{ marginTop: 10 }}>{children}</div>}
  </div>;
}
/** 사원 화면 — 내 진행 상황 */
export function EduMine({ stage, row, exams, wrong, lastPassed }: { stage: EduStage; row: EduRow; exams: { at: string; score: number; passed: boolean }[]; wrong: Wrong[]; lastPassed: boolean }) {
  const router = useRouter(); const [sc, setSc] = useState<Record<string, string>>(row.script ?? {}); const [busy, setBusy] = useState(false);
  const order: EduStage[] = ['step1', 'docs', 'exam', 'script', 'review', 'done']; const at = order.indexOf(stage === 'locked' ? 'exam' : stage); const st = (i: number): 'done' | 'now' | 'wait' => at > i ? 'done' : at === i ? 'now' : 'wait';
  const save = async (submit: boolean) => { setBusy(true); const r = await eduScriptSave(sc, submit); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok && submit) router.refresh(); };
  const passed = exams.some(e => e.passed);
  return <div style={{ maxWidth: 860 }}>
    <div className="card" style={{ marginBottom: 12, background: stage === 'done' ? '#ECFDF3' : '#F5F8FF' }}><b style={{ color: SC[stage] }}>{STAGE_LABEL[stage]}</b>{stage === 'done' && <> — <Link href="/meta-db" style={{ color: '#175CD3', fontWeight: 700 }}>인바운드 DB 로 가기 →</Link></>}</div>
    <Step n={1} title="1차 교육 (팀장 대면 교육)" state={st(0)}>{stage === 'step1' ? <span style={{ fontSize: 13.5, color: '#475467' }}>팀장에게 교육을 받으면 팀장이 완료로 체크하고, 교육자료가 열립니다.</span> : <span style={{ fontSize: 13, color: '#667085' }}>{row.step1_at ? md(row.step1_at) + ' 완료' : ''}</span>}</Step>
    <Step n={2} title="2차 교육자료 학습" state={st(1)}>
      <div style={{ fontSize: 13, color: '#475467', marginBottom: 8 }}>위에서부터 순서대로 읽습니다. 새 창으로 열리고, 열어 본 자료는 「읽음」으로 표시됩니다. 5개를 모두 읽어야 시험이 열립니다.</div>
      {EDU_DOCS.map((d, i) => <div key={d.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i ? '1px solid #F2F4F7' : undefined }}>
        <span style={{ width: 20, color: '#98A2B3', fontSize: 13 }}>{i + 1}</span><a href={`/meta-edu/doc/${d.slug}`} target="_blank" rel="noreferrer" onClick={() => setTimeout(() => router.refresh(), 1500)} style={{ fontWeight: 600, color: '#175CD3' }}>{d.title}</a>
        <span style={{ fontSize: 12.5, color: row.docs?.[d.slug] ? '#067647' : '#98A2B3' }}>{row.docs?.[d.slug] ? '읽음 ' + md(row.docs[d.slug]) : '아직 안 읽음'}</span></div>)}
    </Step>
    <Step n={3} title={`3차 시험 (20문제 · ${PASS_SCORE}점 이상 합격)`} state={passed ? 'done' : st(2)}>
      {!passed && stage === 'exam' && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><Link href="/meta-edu/exam" className="btn">시험 보기</Link><span style={{ fontSize: 13, color: '#475467' }}>객관식 20문제, 응시할 때마다 문제가 바뀝니다. 불합격하면 재시험은 팀장 허락 후에 볼 수 있습니다.</span></div>}
      {stage === 'locked' && <div style={{ fontSize: 13.5, color: '#B42318', fontWeight: 600 }}>불합격했습니다. 아래 틀린 문제를 교육자료에서 다시 확인하고, 팀장에게 재시험 허락을 받아 주세요.</div>}
      {exams.length > 0 && <div style={{ marginTop: 8, fontSize: 13 }}>{exams.map((e, i) => <span key={i} style={{ marginRight: 12, color: e.passed ? '#067647' : '#B42318', fontWeight: 600 }}>{i + 1}회 {e.score}점 {e.passed ? '합격' : '불합격'} <span style={{ color: '#98A2B3', fontWeight: 400 }}>{md(e.at)}</span></span>)}</div>}
      {wrong.length > 0 && <details style={{ marginTop: 10 }} open={!lastPassed}><summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>마지막 시험에서 틀린 문제 {wrong.length}개</summary>
        {wrong.map((w, i) => <div key={i} style={{ marginTop: 8, padding: 10, background: '#F9FAFB', borderRadius: 6, fontSize: 13, lineHeight: 1.6 }}><div><b>[{w.subject}]</b> {w.q}</div><div style={{ color: '#B42318' }}>내 답: {w.mine}</div><div style={{ color: '#067647' }}>정답: {w.answer}</div><div style={{ color: '#475467' }}>{w.why}</div></div>)}</details>}
    </Step>
    <Step n={4} title="영업 스크립트 작성 (팀장 승인)" state={stage === 'done' ? 'done' : stage === 'review' || stage === 'script' ? 'now' : 'wait'}>
      {stage === 'done' ? <span style={{ fontSize: 13, color: '#667085' }}>승인됨</span> : <>
        <div style={{ fontSize: 13, color: '#475467', marginBottom: 8 }}>교육자료의 「상담 따라하기」를 참고해 <b>내 말투로</b> 직접 써 봅니다. 순위 · 성공률 · 안전을 보장하는 말은 쓰지 않습니다. 팀장이 확인하고 승인하면 투입됩니다.</div>
        {row.script_back && <div style={{ padding: 10, background: '#FEF3F2', borderRadius: 6, color: '#B42318', fontSize: 13, marginBottom: 10 }}><b>팀장 의견:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{row.script_back}</span></div>}
        {SCRIPT_PARTS.map(p => <div key={p.key} style={{ marginBottom: 10 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{p.label}</div><div style={{ fontSize: 12, color: '#98A2B3', margin: '2px 0 4px' }}>{p.hint}</div>
          <textarea disabled={stage === 'review'} style={{ ...box, minHeight: 110, background: stage === 'review' ? '#F9FAFB' : '#fff' }} value={sc[p.key] ?? ''} onChange={e => setSc(s => ({ ...s, [p.key]: e.target.value }))} /></div>)}
        {stage === 'review' ? <div style={{ fontSize: 13.5, color: '#B54708', fontWeight: 600 }}>제출했습니다 ({row.script_at ? md(row.script_at) : ''}) — 팀장 승인을 기다리는 중입니다.</div>
          : <div style={{ display: 'flex', gap: 8 }}><button className="btn ghost" disabled={busy} onClick={() => save(false)}>임시 저장</button><button className="btn" disabled={busy} onClick={() => save(true)}>팀장에게 제출</button></div>}
      </>}
    </Step>
    <Step n={5} title="영업 투입" state={stage === 'done' ? 'done' : 'wait'}><span style={{ fontSize: 13.5 }}>인바운드 DB 가 배정됩니다. 통화 후 상태 · 메모 · 다음 연락일을 바로 남겨 주세요.</span></Step>
  </div>;
}
export type BoardRow = { id: string; name: string; stage: EduStage; step1: boolean; docs: number; tries: number; best: number | null; lastScore: number | null; script: Record<string, string> | null; scriptAt: string | null; scriptBack: string; deployedAt: string | null };
/** 팀장 · 총괄 화면 — 사람별 진행 관리 */
export function EduBoard({ rows, hard, docs }: { rows: BoardRow[]; hard: { subject: string; q: string; n: number }[]; docs: { slug: string; title: string }[] }) {
  const router = useRouter(); const [busy, setBusy] = useState(''); const [open, setOpen] = useState(''); const [why, setWhy] = useState('');
  const run = async (key: string, f: () => Promise<{ ok: boolean; msg: string }>) => { if (busy) return; setBusy(key); const r = await f(); setBusy(''); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { setOpen(''); setWhy(''); router.refresh(); } };
  const td: React.CSSProperties = { padding: '10px 10px', whiteSpace: 'nowrap' };
  return <>
    <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
        <thead><tr style={{ background: '#F9FAFB', color: '#475467', fontSize: 12.5, textAlign: 'left' }}>{['이름', '단계', '1차 교육', '자료 열람', '시험', '스크립트', '할 일'].map(h => <th key={h} style={td}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => <Fragment key={r.id}><tr style={{ borderTop: '1px solid #EAECF0' }}>
            <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
            <td style={{ ...td, color: SC[r.stage], fontWeight: 700 }}>{STAGE_LABEL[r.stage]}</td>
            <td style={td}>{r.step1 ? '완료' : '—'}</td>
            <td style={td}>{r.docs}/{docs.length}</td>
            <td style={td}>{r.tries ? <>{r.tries}회 · 최고 {r.best}점{r.lastScore != null && r.lastScore !== r.best ? ` (최근 ${r.lastScore}점)` : ''}</> : '—'}</td>
            <td style={td}>{r.script ? <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 12.5 }} onClick={() => setOpen(o => o === r.id ? '' : r.id)}>{r.scriptAt ? '제출됨 — 보기' : '작성 중 — 보기'}</button> : '—'}</td>
            <td style={td}><div style={{ display: 'flex', gap: 6 }}>
              {r.stage === 'step1' && <button className="btn" disabled={!!busy} onClick={() => run(r.id, () => eduStep1(r.id, true))}>1차 완료 체크</button>}
              {r.stage === 'docs' && r.docs === 0 && <button className="btn ghost" disabled={!!busy} onClick={() => run(r.id, () => eduStep1(r.id, false))}>1차 완료 취소</button>}
              {r.stage === 'locked' && <button className="btn" disabled={!!busy} onClick={() => run(r.id, () => eduRetake(r.id))}>재시험 허락</button>}
              {r.stage === 'review' && <button className="btn" onClick={() => setOpen(r.id)}>스크립트 확인 → 투입 승인</button>}
              {r.stage === 'done' && <><span style={{ color: '#067647', fontSize: 12.5, alignSelf: 'center' }}>투입 {r.deployedAt ? md(r.deployedAt) : ''}</span><button className="btn ghost" disabled={!!busy} style={{ padding: '3px 8px', fontSize: 12.5 }} onClick={() => run(r.id, () => eduUndeploy(r.id))}>투입 취소</button></>}
            </div></td>
          </tr>
          {open === r.id && r.script && <tr><td colSpan={7} style={{ padding: 14, background: '#F9FAFB' }}>
            {SCRIPT_PARTS.map(p => <div key={p.key} style={{ marginBottom: 10 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: '#475467' }}>{p.label}</div><div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, background: '#fff', border: '1px solid #EAECF0', borderRadius: 6, padding: 10, marginTop: 4 }}>{r.script?.[p.key] || '(비어 있음)'}</div></div>)}
            {r.stage === 'review' && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <button className="btn" disabled={!!busy} onClick={() => run(r.id, () => eduDeploy(r.id))}>승인 — 영업 투입</button>
              <textarea placeholder="돌려보낼 때: 고칠 부분을 적어 주세요" value={why} onChange={e => setWhy(e.target.value)} style={{ ...box, flex: '1 1 300px', minHeight: 40 }} />
              <button className="btn ghost" disabled={!!busy} onClick={() => run(r.id, () => eduScriptBack(r.id, why))}>돌려보내기</button>
            </div>}
          </td></tr>}</Fragment>)}
          {!rows.length && <tr><td colSpan={7} style={{ padding: 26, textAlign: 'center', color: '#98A2B3' }}>메타팀 사원이 아직 없습니다 — 「사용자 · 팀」에서 팀을 메타팀으로 지정하면 여기에 나타납니다</td></tr>}
        </tbody>
      </table>
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div className="card" style={{ flex: '1 1 320px' }}><b style={{ fontSize: 13.5 }}>교육자료</b>
        {docs.map((d, i) => <div key={d.slug} style={{ padding: '6px 0', fontSize: 13.5 }}>{i + 1}. <a href={`/meta-edu/doc/${d.slug}`} target="_blank" rel="noreferrer" style={{ color: '#175CD3', fontWeight: 600 }}>{d.title}</a></div>)}
        <div style={{ marginTop: 8 }}><Link href="/meta-edu/bank" className="btn ghost">시험 문제은행 보기</Link></div></div>
      <div className="card" style={{ flex: '1 1 320px' }}><b style={{ fontSize: 13.5 }}>자주 틀리는 문제</b>
        {hard.length ? hard.map((h, i) => <div key={i} style={{ padding: '6px 0', fontSize: 13, lineHeight: 1.5 }}><span style={{ color: '#B42318', fontWeight: 700 }}>{h.n}회</span> [{h.subject}] {h.q}</div>) : <div style={{ fontSize: 13, color: '#98A2B3', marginTop: 6 }}>아직 응시 기록이 없습니다</div>}</div>
    </div>
  </>;
}
