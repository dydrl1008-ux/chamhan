'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { Status } from '@/components/ui';
import { requestName, reviseName } from './actions';

export type NameTask = { id: number; title: string; status: string; result: string | null; created_at: string; requested_by: string | null; instruction: string };
const ST: Record<string, [string, 'ok' | 'wait' | 'bad' | 'off']> = { queued: ['대기', 'wait'], running: ['작성 중', 'wait'], waiting: ['대기', 'wait'], review: ['검토 중', 'wait'], done: ['완료', 'ok'], rejected: ['반려', 'bad'], failed: ['실패', 'bad'], cancelled: ['취소', 'off'] };
const kst = (s: string) => new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

export default function ProductNameClient({ tasks, adReady }: { tasks: NameTask[]; adReady: boolean }) {
  const r = useRouter(); const [busy, start] = useTransition();
  const [f, setF] = useState({ brand: '', main: '', must: '', optional: '', note: '' });
  const [open, setOpen] = useState<number | null>(tasks[0]?.id ?? null); const [fb, setFb] = useState<Record<number, string>>({});
  const pending = tasks.some(t => ['queued', 'running', 'waiting', 'review'].includes(t.status));
  useEffect(() => { if (!pending) return; const h = setInterval(() => r.refresh(), 12000); return () => clearInterval(h); }, [pending, r]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = () => start(async () => { const res = await requestName(f); notify(res.msg, res.ok ? 'ok' : 'bad'); if (res.ok) { setOpen(res.id ?? null); r.refresh(); } });
  const copy = async (t: string) => { await navigator.clipboard.writeText(t); notify('복사됨'); };
  // "… (NN자)" 로 끝나는 줄 = 상품명 후보. AI가 센 숫자는 믿지 않고 여기서 다시 셈
  const names = (txt: string) => Array.from(txt.matchAll(/^[^\n]*?([가-힣A-Za-z0-9%][^\n]{10,70}?)\s*\(\s*\d{1,2}\s*자\s*\)/gm)).map(m => m[1].replace(/^[①②③④\d.)\s\-*#:：]+/, '').replace(/[*_`]/g, '').trim()).filter((n, i, a) => a.indexOf(n) === i);
  const fixCounts = (txt: string) => txt.replace(/^([^\n]*?)([가-힣A-Za-z0-9%][^\n]{10,70}?)\s*\(\s*\d{1,2}\s*자\s*\)/gm, (_m, pre, name) => { const n = String(name).replace(/^[①②③④\d.)\s\-*#:：]+/, '').replace(/[*_`]/g, '').trim(); return `${pre}${name} (${n.length}자${n.length > 50 ? ' ⚠50자 초과' : ''})`; });

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <label>브랜드 <span style={{ color: 'var(--bad, #c0392b)' }}>*</span><input value={f.brand} onChange={set('brand')} placeholder="메이드인랩" /></label>
          <label>메인 키워드 <span style={{ color: 'var(--bad, #c0392b)' }}>*</span><input value={f.main} onChange={set('main')} placeholder="강아지 오메가3" /></label>
          <label>꼭 들어갈 단어<input value={f.must} onChange={set('must')} placeholder="순도90% 슈퍼EPA90" /></label>
          <label>넣을지 판단할 단어<input value={f.optional} onChange={set('optional')} placeholder="피부 관절 심장 소형견 60캡슐" /></label>
        </div>
        <label>메모<input value={f.note} onChange={set('note')} placeholder="예: 신제품, 리워드 바로 돌릴 예정, 가격 2만원대" /></label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy || !f.brand.trim() || !f.main.trim()} onClick={submit}>{busy ? '자료 모으는 중…' : '상품명 요청'}</button>
          <span className="help">검색광고 월 검색수{adReady ? '' : '(미설정)'} + 시크릿 지수 상위 100 상품명을 모아 AI팀에 넘깁니다 · 결과 1~3분 · 시크릿 지수 조회 1회 사용</span>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontWeight: 700 }}>요청 {tasks.length}건 {pending && <span className="help">· 진행 중인 건은 12초마다 새로고침</span>}</div>
        {tasks.length === 0 && <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>아직 요청이 없습니다.</div>}
        {tasks.map(t => { const o = open === t.id; const st = ST[t.status] ?? [t.status, 'off']; return (
          <div key={t.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <div onClick={() => setOpen(o ? null : t.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', cursor: 'pointer', flexWrap: 'wrap' }}>
              <b>#{t.id}</b><span style={{ flex: 1, minWidth: 160 }}>{t.title.replace('[상품명]', '').trim()}</span><Status kind={st[1]}>{st[0]}</Status><span className="help">{t.requested_by} · {kst(t.created_at)}</span>
            </div>
            {o && <div style={{ padding: '0 16px 14px', display: 'grid', gap: 10 }}>
              {t.result ? <>
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, background: 'var(--bg)', padding: 14, borderRadius: 8 }}>{fixCounts(t.result)}</pre>
                {names(t.result).length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{names(t.result).map((n, i) => <button key={i} className="btn ghost" onClick={() => copy(n)} style={{ padding: '4px 10px', borderColor: n.length > 50 ? 'var(--bad, #c0392b)' : undefined }}>복사 · {n.slice(0, 28)}{n.length > 28 ? '…' : ''} ({n.length}자{n.length > 50 ? ' 초과' : ''})</button>)}</div>}
                {['done', 'rejected'].includes(t.status) && <div style={{ display: 'flex', gap: 6 }}>
                  <input value={fb[t.id] ?? ''} onChange={e => setFb({ ...fb, [t.id]: e.target.value })} placeholder="고칠 점 (예: 심장 빼고 60캡슐 넣어줘)" style={{ flex: 1 }} />
                  <button className="btn ghost" disabled={busy || !(fb[t.id] ?? '').trim()} onClick={() => start(async () => { const res = await reviseName(t.id, fb[t.id] ?? ''); notify(res.msg, res.ok ? 'ok' : 'bad'); if (res.ok) { setFb({ ...fb, [t.id]: '' }); r.refresh(); } })}>고쳐줘</button>
                </div>}
              </> : <div className="help">{['failed', 'cancelled'].includes(t.status) ? '처리되지 않았습니다. 실행 PC(AI팀 실행기)가 켜져 있는지 확인하세요.' : 'AI팀이 작성 중입니다…'}</div>}
              <details><summary className="help" style={{ cursor: 'pointer' }}>AI팀에 넘긴 자료 보기</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>{t.instruction}</pre></details>
            </div>}
          </div>); })}
      </div>
    </div>
  );
}
