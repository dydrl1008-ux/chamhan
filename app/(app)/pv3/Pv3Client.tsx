'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { Section, Status } from '@/components/ui';
import { fmtKST } from '@/lib/date/kst';
import { LEAK_LABEL } from '@/lib/proposalV3';
import { buildKeyword, prepareAll, collect, rerender, storesOf, workerRaw, removeKw, saveSetting, addKnowledge, collectKnowledge, distillPrinciples, removeKnowledge, type KwRow, type KnRow } from './actions';

const AI: Record<string, [string, 'ok' | 'wait' | 'bad' | 'off']> = { none: ['요청 전', 'off'], queued: ['워커 작업 중', 'wait'], done: ['글 완료', 'ok'], fallback: ['기본 문장', 'bad'] };
type StoreRow = { id: number; store_name: string; leak: string; rank: number | null; ai: boolean; images: number; headline: string };

export default function Pv3Client({ rows, kakao: k0, style: s0, knowledge, principles }: { rows: KwRow[]; kakao: string; style: string; knowledge: KnRow[]; principles: { id: number; text: string; category: string }[] }) {
  const r = useRouter(); const [busy, start] = useTransition();
  const [kw, setKw] = useState(''); const [n, setN] = useState(30);
  const [open, setOpen] = useState<string | null>(null); const [stores, setStores] = useState<Record<string, StoreRow[]>>({}); const [raw, setRaw] = useState<Record<string, { id: number; title: string; status: string; result: string }[]>>({});
  const [kakao, setKakao] = useState(k0); const [style, setStyle] = useState(s0);
  const [kt, setKt] = useState(''); const [ku, setKu] = useState(''); const [kr, setKr] = useState('');
  const go = (f: () => Promise<{ ok: boolean; msg: string }>) => start(async () => { const x = await f(); notify(x.msg, x.ok ? 'ok' : 'bad'); r.refresh(); });
  const toggle = async (keyword: string) => { if (open === keyword) { setOpen(null); return; } setOpen(keyword); if (!stores[keyword]) { const x = await storesOf(keyword); if (x.ok) setStores(s => ({ ...s, [keyword]: x.rows! })); } };
  const view = (kind: 'keyword' | 'store', ref: string | number, page: number) => `/pv3/view?kind=${kind}&ref=${encodeURIComponent(String(ref))}&page=${page}`;

  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px 14px' }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>키워드<input value={kw} onChange={e => setKw(e.target.value)} placeholder="예: 토퍼" style={{ width: 200 }} onKeyDown={e => { if (e.key === 'Enter' && kw.trim()) go(() => buildKeyword(kw, n)); }} /></label>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>업체 수 (메일 대상 중)<input type="number" value={n} onChange={e => setN(Number(e.target.value) || 0)} style={{ width: 110 }} /></label>
      <button className="btn" disabled={busy || !kw.trim()} onClick={() => go(() => buildKeyword(kw, n))}>{busy ? '처리 중…' : '① 키워드 만들기'}</button>
      <button className="btn ghost" disabled={busy} onClick={() => go(collect)}>② 워커 결과 수거 + 렌더 요청</button>
      <button className="btn ghost" disabled={busy} onClick={() => { if (confirm(`메일 대상 있는 키워드 전부(최대 60개) × 업체 ${n}곳을 워커 큐에 올립니다. 몇 시간 걸립니다 (전날 저녁 추천). 진행?`)) go(() => prepareAll(n)); }} style={{ marginLeft: 'auto' }}>메일 키워드 전체 미리 준비</button>
      <span className="help">업체 0 이면 키워드 공통 4장만 · 수거는 워커가 끝난 뒤 (보통 2~5분)</span>
    </div>

    <Section title={`키워드 ${rows.length}개`} flush>
      {rows.length === 0 ? <div style={{ padding: 16, color: 'var(--muted)' }}>아직 없음</div> : <table><thead><tr><th>키워드</th><th className="num">월 검색</th><th>기본 판정</th><th>키워드 글</th><th>업체 (글/이미지)</th><th>공통 이미지</th><th>갱신</th><th></th></tr></thead><tbody>
        {rows.map(x => { const st = AI[x.ai_status] ?? [x.ai_status, 'off']; return <>
          <tr key={x.keyword} style={{ cursor: 'pointer' }} onClick={() => toggle(x.keyword)}>
            <td><b>{x.keyword}</b></td><td className="num">{x.volume ? x.volume.toLocaleString('ko-KR') : '-'}</td><td>{LEAK_LABEL[x.leak as keyof typeof LEAK_LABEL] ?? '-'}</td>
            <td><Status kind={st[1]}>{st[0]}</Status>{x.ai_task_id && <span className="cell-sub"> #{x.ai_task_id}</span>}</td>
            <td>{x.stores}곳 ({x.storesAi}/{x.storesImg})</td><td>{x.images.length >= 4 ? <Status kind="ok">{x.images.length}장</Status> : <span className="cell-sub">{x.images.length}/4</span>}</td>
            <td className="cell-sub">{fmtKST(x.updated_at)}</td>
            <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(p => <a key={p} href={view('keyword', x.keyword, p)} target="_blank" rel="noreferrer" className="btn ghost xs" style={{ padding: '2px 6px', marginRight: 2 }} title={`${p}장 미리보기 (업체 정보 없는 버전)`}>{p}</a>)}
              <button className="btn ghost xs" style={{ marginLeft: 6 }} disabled={busy} onClick={() => go(() => buildKeyword(x.keyword, n, true))}>다시 계산</button>
              <button className="btn ghost xs" style={{ marginLeft: 4 }} disabled={busy} onClick={() => go(() => rerender(x.keyword))}>다시 렌더</button>
              <button className="btn ghost xs" style={{ marginLeft: 4 }} onClick={async () => { if (raw[x.keyword]) { setRaw(r => { const n = { ...r }; delete n[x.keyword]; return n; }); return; } const w = await workerRaw(x.keyword); if (w.ok) setRaw(r => ({ ...r, [x.keyword]: w.items! })); }}>워커 원문</button>
              <button className="btn ghost xs" style={{ marginLeft: 4 }} disabled={busy} onClick={() => { if (confirm(`'${x.keyword}' 삭제?`)) go(() => removeKw(x.keyword)); }}>삭제</button></td></tr>
          {raw[x.keyword] && <tr key={x.keyword + '_r'}><td colSpan={8} style={{ background: '#FFFBEB', padding: 10 }}>
            {raw[x.keyword].length === 0 ? <span className="help">워커 작업 없음</span> : raw[x.keyword].map(t => <details key={t.id} open style={{ marginBottom: 8 }}><summary style={{ cursor: 'pointer', fontSize: 12.5 }}><b>#{t.id}</b> {t.title} · <Status kind={t.status === 'done' ? 'ok' : /fail|reject|cancel/.test(t.status) ? 'bad' : 'wait'}>{t.status}</Status></summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, margin: '6px 0 0', maxHeight: 320, overflow: 'auto', background: '#fff', padding: 8, borderRadius: 6 }}>{t.result || '(결과 없음)'}</pre></details>)}
          </td></tr>}
          {open === x.keyword && <tr key={x.keyword + '_s'}><td colSpan={8} style={{ background: 'var(--bg)', padding: 10 }}>
            {!stores[x.keyword] ? <span className="help">불러오는 중…</span> : stores[x.keyword].length === 0 ? <span className="help">업체 없음</span> : <table><thead><tr><th>업체</th><th>순위</th><th>새는 곳</th><th>헤드라인 (워커)</th><th>이미지</th><th></th></tr></thead><tbody>
              {stores[x.keyword].map(s => <tr key={s.id}><td><b>{s.store_name}</b></td><td>{s.rank ?? '-'}</td><td>{LEAK_LABEL[s.leak as keyof typeof LEAK_LABEL] ?? s.leak}</td><td style={{ fontSize: 12.5, maxWidth: 420 }}>{s.ai ? s.headline : <span className="cell-sub">워커 작업 중</span>}</td><td>{s.images >= 4 ? <Status kind="ok">{s.images}장</Status> : <span className="cell-sub">{s.images}/4</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{[1, 2, 5, 7].map(p => <a key={p} href={view('store', s.id, p)} target="_blank" rel="noreferrer" className="btn ghost xs" style={{ padding: '2px 6px', marginRight: 2 }}>{p}</a>)}</td></tr>)}
            </tbody></table>}
          </td></tr>}
        </>; })}
      </tbody></table>}
    </Section>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div className="card" style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
        <b style={{ fontSize: 13 }}>설정</b>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>카카오톡 오픈채팅 링크 (8장 마지막)<div style={{ display: 'flex', gap: 6 }}><input value={kakao} onChange={e => setKakao(e.target.value)} placeholder="https://open.kakao.com/o/…" style={{ flex: 1 }} /><button className="btn ghost" disabled={busy} onClick={() => go(() => saveSetting('kakao_open', kakao))}>저장</button></div></label>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>문체 레퍼런스 (회신 잘 왔던 제안서 문구 — 워커가 이 톤을 따름)<textarea value={style} onChange={e => setStyle(e.target.value)} rows={6} style={{ fontSize: 13 }} /><button className="btn ghost" disabled={busy} onClick={() => go(() => saveSetting('style_ref', style))} style={{ justifySelf: 'start' }}>저장</button></label>
      </div>
      <div className="card" style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
        <b style={{ fontSize: 13 }}>지식베이스에 글 넣기 <span className="cell-sub" style={{ fontWeight: 400 }}>— 워커가 요약·인사이트·태그를 뽑아 제안서 글에 참고</span></b>
        <input value={kt} onChange={e => setKt(e.target.value)} placeholder="제목" /><input value={ku} onChange={e => setKu(e.target.value)} placeholder="출처 URL (선택)" />
        <textarea value={kr} onChange={e => setKr(e.target.value)} rows={6} placeholder="본문 붙여넣기 (80자 이상)" style={{ fontSize: 13 }} />
        <div style={{ display: 'flex', gap: 6 }}><button className="btn" disabled={busy || kr.trim().length < 80} onClick={() => go(async () => { const x = await addKnowledge(kt, ku, kr); if (x.ok) { setKt(''); setKu(''); setKr(''); } return x; })}>넣기</button><button className="btn ghost" disabled={busy} onClick={() => go(collectKnowledge)}>수거</button><button className="btn ghost" disabled={busy} onClick={() => go(distillPrinciples)}>원칙 증류 요청</button></div>
      </div>
    </div>

    <Section title={`지식 ${knowledge.length}건 · 원칙 ${principles.length}개`} flush>
      {knowledge.length === 0 && principles.length === 0 ? <div style={{ padding: 16, color: 'var(--muted)' }}>아직 없음 — 없어도 제안서는 만들어집니다</div> : <div style={{ padding: 12, display: 'grid', gap: 10 }}>
        {principles.length > 0 && <div style={{ fontSize: 12.5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{principles.map(p => <span key={p.id} className="chip" title={p.category}>{p.text}</span>)}</div>}
        {knowledge.length > 0 && <table><thead><tr><th>제목</th><th>카테고리</th><th>요약</th><th>태그</th><th>상태</th><th></th></tr></thead><tbody>
          {knowledge.map(k => <tr key={k.id}><td><b>{k.title}</b>{k.source_url && <a href={k.source_url} target="_blank" rel="noreferrer" className="cell-sub" style={{ marginLeft: 6 }}>출처</a>}</td><td>{k.category}</td><td style={{ fontSize: 12.5, maxWidth: 420 }}>{k.summary}{k.insights?.length ? <div className="cell-sub">{k.insights.slice(0, 2).join(' · ')}</div> : null}</td><td style={{ fontSize: 12 }}>{(k.tags ?? []).join(', ')}</td><td><Status kind={k.status === 'done' ? 'ok' : k.status === 'failed' ? 'bad' : 'wait'}>{k.status === 'done' ? '정리됨' : k.status === 'failed' ? '실패' : '워커 작업 중'}</Status></td><td><button className="btn ghost xs" disabled={busy} onClick={() => go(() => removeKnowledge(k.id))}>삭제</button></td></tr>)}
        </tbody></table>}
      </div>}
    </Section>
  </div>;
}
