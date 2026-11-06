'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { Status } from '@/components/ui';
import { requestName, reviseName, removeName } from './actions';
import { MAX_LEN, EFFECT_WORDS } from './shared';

export type NameTask = { id: number; title: string; status: string; result: string | null; created_at: string; requested_by: string | null; instruction: string };
const ST: Record<string, [string, 'ok' | 'wait' | 'bad' | 'off']> = { queued: ['AI 검토 대기', 'wait'], running: ['AI 검토 중', 'wait'], waiting: ['AI 검토 대기', 'wait'], review: ['AI 검토 중', 'wait'], done: ['AI 검토 완료', 'ok'], rejected: ['반려', 'bad'], failed: ['AI 검토 실패', 'bad'], cancelled: ['취소', 'off'] };
const kst = (s: string) => new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const clean = (n: string) => n.replace(/^[①②③④\d.)\s\-*#:：]+/, '').replace(/[*_`]/g, '').trim();
const effects = (n: string) => n.split(/\s+/).filter(w => EFFECT_WORDS.some(e => w.includes(e)));
/** "… (NN자)" 로 끝나는 줄 = 상품명. 글자수는 여기서 다시 셈 */
const pick = (txt: string) => Array.from(txt.matchAll(/^([^\n]*?)([가-힣A-Za-z0-9%][^\n]{8,80}?)\s*\(\s*\d{1,2}\s*자\s*\)/gm)).map(m => ({ label: m[1].replace(/[:：]\s*$/, '').trim(), name: clean(m[2]) })).filter((x, i, a) => a.findIndex(y => y.name === x.name) === i);
const fixCounts = (txt: string) => txt.replace(/^([^\n]*?)([가-힣A-Za-z0-9%][^\n]{8,80}?)\s*\(\s*\d{1,2}\s*자\s*\)/gm, (_m, pre, name) => { const n = clean(String(name)).length; return `${pre}${name} (${n}자${n > MAX_LEN ? ' ⚠초과' : ''})`; });
const drafts = (ins: string) => { const i = ins.indexOf('[초안]'); if (i < 0) return []; const block = ins.slice(i + 4, ins.indexOf('\n\n', i + 4) > 0 ? ins.indexOf('\n\n', i + 4) : undefined); return pick(block); };

function NameRow({ label, name, onCopy }: { label?: string; name: string; onCopy: (s: string) => void }) {
  const ef = effects(name); const over = name.length > MAX_LEN;
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: 'var(--bg)', borderRadius: 8, border: over ? '1px solid var(--bad, #c0392b)' : '1px solid transparent' }}>
    {label && <span className="help" style={{ minWidth: 92 }}>{label}</span>}
    <b style={{ flex: 1, minWidth: 200, fontSize: 15 }}>{name}</b>
    <span className="help" style={{ color: over ? 'var(--bad, #c0392b)' : undefined }}>{name.length}자{over ? ' 초과' : ''}</span>
    {ef.length > 0 && <span className="help" title="효능·부위 단어 — 심의 위험 참고">⚠ {ef.join(' ')}</span>}
    <button className="btn ghost" style={{ padding: '3px 10px' }} onClick={() => onCopy(name)}>복사</button>
  </div>;
}

export default function ProductNameClient({ tasks }: { tasks: NameTask[] }) {
  const r = useRouter(); const [busy, start] = useTransition();
  const [f, setF] = useState({ brand: '', main: '', must: '', optional: '', note: '' });
  const [open, setOpen] = useState<number | null>(tasks[0]?.id ?? null); const [fb, setFb] = useState<Record<number, string>>({});
  const pending = tasks.some(t => ['queued', 'running', 'waiting', 'review'].includes(t.status));
  useEffect(() => { if (!pending) return; const h = setInterval(() => r.refresh(), 12000); return () => clearInterval(h); }, [pending, r]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = () => start(async () => { const res = await requestName(f); notify(res.msg, res.ok ? 'ok' : 'bad'); if (res.ok) { setOpen(res.id ?? null); r.refresh(); } });
  const copy = async (t: string) => { await navigator.clipboard.writeText(t); notify('복사됨'); };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <label>브랜드 <span style={{ color: 'var(--bad, #c0392b)' }}>*</span><input value={f.brand} onChange={set('brand')} placeholder="메이드인랩" /></label>
          <label>메인 키워드 <span style={{ color: 'var(--bad, #c0392b)' }}>*</span><input value={f.main} onChange={set('main')} placeholder="강아지 오메가3" /></label>
          <label>꼭 들어갈 단어<input value={f.must} onChange={set('must')} placeholder="순도90% 슈퍼EPA90" /></label>
          <label>넣을지 판단할 단어<input value={f.optional} onChange={set('optional')} placeholder="피부 관절 심장 소형견 60캡슐" /></label>
        </div>
        <label>메모 (AI 검토 참고)<input value={f.note} onChange={set('note')} placeholder="예: 신제품, 리워드 바로 돌릴 예정, 가격 2만원대" /></label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy || !f.brand.trim() || !f.main.trim()} onClick={submit}>{busy ? '만드는 중…' : '상품명 만들기'}</button>
          <span className="help">브랜드·메인 키워드 맨 앞 고정 → 검색량·상위 10 사용 빈도 순으로 {MAX_LEN}자까지 채움 (즉시) → AI팀이 불필요·중복 단어 검토 (1~2분)</span>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700 }}>요청 {tasks.length}건 {pending && <span className="help">· AI 검토 중인 건은 12초마다 새로고침</span>}</div>
        {tasks.length === 0 && <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>아직 요청이 없습니다.</div>}
        {tasks.map(t => { const o = open === t.id; const st = ST[t.status] ?? [t.status, 'off']; const ds = drafts(t.instruction); const ai = t.result ? pick(t.result) : []; return (
          <div key={t.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <div onClick={() => setOpen(o ? null : t.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', cursor: 'pointer', flexWrap: 'wrap' }}>
              <b>#{t.id}</b><span style={{ flex: 1, minWidth: 160 }}>{t.title.replace('[상품명]', '').trim()}</span><Status kind={st[1]}>{st[0]}</Status><span className="help">{t.requested_by} · {kst(t.created_at)}</span>
              <button className="btn ghost" style={{ padding: '2px 8px' }} disabled={busy} onClick={e => { e.stopPropagation(); start(async () => { const res = await removeName(t.id); notify(res.msg, res.ok ? 'ok' : 'bad'); r.refresh(); }); }}>삭제</button>
            </div>
            {o && <div style={{ padding: '0 16px 14px', display: 'grid', gap: 12 }}>
              {ds.length > 0 && <div style={{ display: 'grid', gap: 6 }}>
                <div className="help" style={{ fontWeight: 700 }}>초안 (코드 조립 · 즉시)</div>
                {ds.map((d, i) => <NameRow key={i} label={d.label} name={d.name} onCopy={copy} />)}
              </div>}
              {t.result ? <div style={{ display: 'grid', gap: 6 }}>
                <div className="help" style={{ fontWeight: 700 }}>AI 검토</div>
                {ai.map((d, i) => <NameRow key={i} label={d.label || undefined} name={d.name} onCopy={copy} />)}
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>{fixCounts(t.result)}</pre>
                {['done', 'rejected', 'failed'].includes(t.status) && <div style={{ display: 'flex', gap: 6 }}>
                  <input value={fb[t.id] ?? ''} onChange={e => setFb({ ...fb, [t.id]: e.target.value })} placeholder="고칠 점 (예: 심장 빼고 60캡슐 넣어줘)" style={{ flex: 1 }} />
                  <button className="btn ghost" disabled={busy || !(fb[t.id] ?? '').trim()} onClick={() => start(async () => { const res = await reviseName(t.id, fb[t.id] ?? ''); notify(res.msg, res.ok ? 'ok' : 'bad'); if (res.ok) { setFb({ ...fb, [t.id]: '' }); r.refresh(); } })}>고쳐줘</button>
                </div>}
              </div> : <div className="help">{['failed', 'cancelled'].includes(t.status) ? 'AI 검토가 처리되지 않았습니다 (실행 PC 확인). 초안은 그대로 쓸 수 있습니다.' : 'AI팀이 검토 중입니다…'}</div>}
              <details><summary className="help" style={{ cursor: 'pointer' }}>AI팀에 넘긴 자료 보기</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>{t.instruction}</pre></details>
            </div>}
          </div>); })}
      </div>
    </div>
  );
}
