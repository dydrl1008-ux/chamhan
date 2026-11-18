'use client';
import { useState } from 'react';
import { notify } from '@/components/Toast';
import { thState, thConnect, thSave, thGenerate, thAdd, thEdit, thPostNow, thRelease, thDisconnect, type ThView, type ThPost } from './actions';
type St = { acc: ThView | null; queue: ThPost[]; done: ThPost[]; aiTask: number; rvTask: number };
const kst = (t: string | null) => t ? new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : '-';
export default function ThreadsClient({ init, err }: { init: St | null; err: string }) {
  const [st, setSt] = useState<St | null>(init); const [msg, setMsg] = useState(err); const [busy, setBusy] = useState('');
  const [token, setToken] = useState(''); const [text, setText] = useState(''); const [edit, setEdit] = useState<Record<number, string>>({});
  const a = st?.acc ?? null;
  const [f, setF] = useState({ enabled: a?.enabled ?? false, per_day: String(a?.per_day ?? 3), hours: a?.hours ?? '9,13,20', tail: a?.tail ?? '', tone: a?.tone ?? '' });
  const reload = async (syncForm = false) => { const r = await thState(); if (!r.ok) return setMsg(r.msg); setMsg(''); setSt({ acc: r.acc, queue: r.queue, done: r.done, aiTask: r.aiTask, rvTask: r.rvTask }); setEdit({}); if (syncForm && r.acc) setF({ enabled: r.acc.enabled, per_day: String(r.acc.per_day), hours: r.acc.hours, tail: r.acc.tail, tone: r.acc.tone }); };
  const run = async (key: string, fn: () => Promise<{ ok: boolean; msg: string }>, sync = false) => { if (busy) return; setBusy(key); try { const r = await fn(); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) await reload(sync); else setMsg(r.msg); } catch (e: any) { notify('오류: ' + String(e?.message ?? e).slice(0, 80), 'bad'); } finally { setBusy(''); } };
  const daysLeft = a?.token_expires_at ? Math.round((new Date(a.token_expires_at).getTime() - Date.now()) / 86400e3) : null;
  return <div style={{ display: 'grid', gap: 16 }}>
    {msg && <div className="card" style={{ color: '#B42318' }}>{msg}</div>}
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <b>① 계정 {a ? <span style={{ color: '#067647' }}>@{a.username} 연결됨</span> : <span style={{ color: '#B54708' }}>연결 안 됨</span>}</b>
      {a ? <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="help">토큰 만료까지 약 {daysLeft ?? '?'}일 — 자동 발행이 켜져 있으면 만료 10일 전부터 스스로 갱신합니다</span>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={() => { if (window.confirm('연결을 해제하면 대기열과 발행 내역도 같이 지워집니다. 해제할까요?')) run('dis', thDisconnect, true); }}>연결 해제</button>
      </div> : <div className="help">Threads API 의 장기 액세스 토큰(60일짜리)을 아래에 붙여 넣으세요. 토큰은 암호화해서 저장하고 화면에 다시 보여 주지 않습니다. 발행 권한(threads_content_publish)이 있는 토큰이어야 합니다.</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder={a ? '토큰을 바꾸려면 새 토큰을 붙여 넣기' : '액세스 토큰 붙여 넣기'} style={{ flex: 1, minWidth: 260 }} />
        <button type="button" className="btn" disabled={!!busy || token.trim().length < 30} onClick={() => run('con', async () => { const r = await thConnect(token); if (r.ok) setToken(''); return r; }, true)}>{busy === 'con' ? '확인 중…' : a ? '토큰 교체' : '연결'}</button>
      </div>
    </div>
    {a && <>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <b>② 발행 설정</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <label>하루 글 수<input type="number" min={1} max={10} value={f.per_day} onChange={e => setF(v => ({ ...v, per_day: e.target.value }))} /></label>
          <label>발행 시각 (시, 콤마로)<input value={f.hours} onChange={e => setF(v => ({ ...v, hours: e.target.value }))} placeholder="9,13,20" /></label>
        </div>
        <label>말투 메모 (선택) <span className="help" style={{ fontWeight: 400 }}>AI 가 글 쓸 때 참고합니다</span><input value={f.tone} onChange={e => setF(v => ({ ...v, tone: e.target.value }))} placeholder="예: 반말, 짧게, 현장에서 본 얘기처럼" /></label>
        <label>글 끝에 붙일 문구 (선택) <span className="help" style={{ fontWeight: 400 }}>모든 글 맨 아래에 붙습니다 — 비워 두면 안 붙음</span><input value={f.tail} onChange={e => setF(v => ({ ...v, tail: e.target.value }))} placeholder="예: 키워드 궁금하면 댓글 주세요" /></label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}><input type="checkbox" checked={f.enabled} onChange={e => setF(v => ({ ...v, enabled: e.target.checked }))} style={{ width: 'auto' }} /> 자동 발행 켜기</label>
          <button type="button" className="btn" disabled={!!busy} onClick={() => run('save', () => thSave({ enabled: f.enabled, per_day: Number(f.per_day), hours: f.hours, tail: f.tail, tone: f.tone }), true)}>{busy === 'save' ? '저장 중…' : '설정 저장'}</button>
          <span className="help">{a.enabled ? '켜짐 — 대기열의 글이 시각이 되면 올라가고, 글이 떨어져 가면 AI 워커에 새 글을 요청합니다' : '꺼짐 — 글은 쌓이지만 자동으로 올라가지 않습니다 (「지금 발행」은 가능)'}</span>
        </div>
      </div>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b>③ 대기열 <span className="cell-sub" style={{ fontWeight: 400 }}>발행 대기 {st!.queue.filter(p => p.status === 'queued').length}개 · 보류 {st!.queue.filter(p => p.status === 'hold').length}개</span></b>
          <button type="button" className="btn" disabled={!!busy || !!st!.aiTask || !!st!.rvTask} onClick={() => run('gen', thGenerate)}>{st!.aiTask ? `AI 작업 #${st!.aiTask} 쓰는 중…` : st!.rvTask ? `AI 작업 #${st!.rvTask} 검수 중…` : busy === 'gen' ? '요청 중…' : 'AI 로 글 만들기'}</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => reload()}>새로고침</button>
          <span className="help">AI 워커가 글을 쓰고 → 다시 검수해서 통과한 글만 발행 시각을 받습니다. 떨어진 글은 사유와 함께 「보류」로 남습니다</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="직접 쓴 글을 대기열에 넣기 (5~480자)" style={{ flex: 1, minWidth: 260 }} />
          <button type="button" className="btn ghost" disabled={!!busy || text.trim().length < 5} onClick={() => run('add', async () => { const r = await thAdd(text); if (r.ok) setText(''); return r; })}>대기열에 추가</button>
        </div>
        {st!.queue.map(p => { const v = edit[p.id] ?? p.text; return <div key={p.id} style={{ border: '1px solid var(--line, #E4E7EC)', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            {p.status === 'hold' ? <b style={{ color: '#B54708' }}>보류</b> : <b>{kst(p.scheduled_at)}</b>}{p.keyword && <span className="chip">{p.keyword}</span>}<span className="cell-sub">{v.length}자</span>{p.status === 'hold' && p.error && <span style={{ color: '#B54708' }}>{p.error}</span>}
            <span style={{ flex: 1 }} />
            {p.status === 'hold' && <button type="button" className="btn ghost xs" disabled={!!busy || v !== p.text} onClick={() => run('r' + p.id, () => thRelease(p.id))}>확인함 · 대기열로</button>}
            {v !== p.text && <button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => run('e' + p.id, () => thEdit(p.id, { text: v }))}>수정 저장</button>}
            <button type="button" className="btn ghost xs" disabled={!!busy || v !== p.text} onClick={() => { if (window.confirm('이 글을 지금 바로 쓰레드에 올립니다. 올릴까요?')) run('p' + p.id, () => thPostNow(p.id)); }}>{busy === 'p' + p.id ? '올리는 중…' : '지금 발행'}</button>
            <button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => run('d' + p.id, () => thEdit(p.id, { del: true }))}>삭제</button>
          </div>
          <textarea value={v} onChange={e => setEdit(m => ({ ...m, [p.id]: e.target.value }))} rows={Math.min(9, Math.max(3, Math.ceil(v.length / 46)))} style={{ fontSize: 13.5, lineHeight: 1.6 }} />
        </div>; })}
        {!st!.queue.length && <div className="cell-sub">대기 중인 글이 없습니다 — 「AI 로 글 만들기」를 누르거나 직접 써서 넣어 주세요</div>}
      </div>
      <div className="card">
        <b>④ 발행 내역 <span className="cell-sub" style={{ fontWeight: 400 }}>최근 {st!.done.length}개</span></b>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{st!.done.map(p => <div key={p.id} style={{ display: 'grid', gap: 3, fontSize: 13, paddingBottom: 8, borderBottom: '1px solid var(--line, #E4E7EC)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ color: p.status === 'posted' ? '#067647' : '#B42318' }}>{p.status === 'posted' ? '발행됨' : '실패'}</b><span className="cell-sub">{kst(p.posted_at ?? p.scheduled_at)}</span>{p.keyword && <span className="chip">{p.keyword}</span>}
            {p.status === 'failed' && <><span style={{ color: '#B42318' }}>{p.error}</span><button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => run('p' + p.id, () => thPostNow(p.id))}>다시 발행</button><button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => run('d' + p.id, () => thEdit(p.id, { del: true }))}>삭제</button></>}</div>
          <div style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{p.text}</div></div>)}
          {!st!.done.length && <div className="cell-sub">아직 발행한 글이 없습니다</div>}</div>
      </div>
    </>}
  </div>;
}
