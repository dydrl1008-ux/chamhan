'use client';
import { Fragment, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { Section, Status } from '@/components/ui';
import { fmtKST } from '@/lib/date/kst';
import { LEAK_LABEL } from '@/lib/proposalV3';
import { buildKeyword, prepList, collect, rerender, storesOf, workerRaw, removeKw, saveSetting, addKnowledge, collectKnowledge, distillPrinciples, removeKnowledge, type KwRow, type KnRow } from './actions';

const AI: Record<string, [string, 'ok' | 'wait' | 'bad' | 'off']> = { none: ['요청 전', 'off'], queued: ['워커 작업 중', 'wait'], done: ['워커 글', 'ok'], fallback: ['기본 문장', 'wait'] };
const SRC: Record<string, [string, 'ok' | 'wait' | 'bad' | 'off']> = { worker: ['워커 글', 'ok'], fallback: ['기본 문장 (워커 대기)', 'wait'], final: ['기본 문장', 'off'], '': ['워커 작업 중', 'wait'] };
type StoreRow = { id: number; store_name: string; leak: string; lead: string; rank: number | null; matched: boolean; src: string; ready: boolean; headline: string };

export default function Pv3Client({ rows, kakao: k0, style: s0, knowledge, principles }: { rows: KwRow[]; kakao: string; style: string; knowledge: KnRow[]; principles: { id: number; text: string; category: string }[] }) {
  const r = useRouter(); const [busy, start] = useTransition();
  const [kw, setKw] = useState(''); const [n, setN] = useState(30);
  const [open, setOpen] = useState<string | null>(null); const [stores, setStores] = useState<Record<string, StoreRow[]>>({}); const [raw, setRaw] = useState<Record<string, { id: number; title: string; status: string; result: string }[]>>({});
  const [kakao, setKakao] = useState(k0); const [style, setStyle] = useState(s0);
  const [kt, setKt] = useState(''); const [ku, setKu] = useState(''); const [kr, setKr] = useState('');
  const [bulk, setBulk] = useState<{ running: boolean; log: string[] }>({ running: false, log: [] }); const stopRef = useRef(false);
  const go = (f: () => Promise<{ ok: boolean; msg: string }>) => start(async () => { const x = await f(); notify(x.msg, x.ok ? 'ok' : 'bad'); r.refresh(); });
  const loadStores = async (keyword: string) => { const x = await storesOf(keyword); if (x.ok) setStores(s => ({ ...s, [keyword]: x.rows! })); };
  const toggle = async (keyword: string) => { if (open === keyword) { setOpen(null); return; } setOpen(keyword); await loadStores(keyword); };
  const view = (kind: 'keyword' | 'store', ref: string | number, page: number | 'all') => `/pv3/view?kind=${kind}&ref=${encodeURIComponent(String(ref))}&page=${page}`;
  /** 메일 대상 키워드를 차례로 준비 (키워드 하나씩 서버 호출 — 탭을 열어 둬야 함) */
  const prepareAll = async () => {
    const pl = await prepList(n); if (!pl.ok || !pl.list) { notify(pl.msg, 'bad'); return; }
    if (!pl.list.length) { notify('오늘 준비할 키워드가 없습니다 (이미 준비됨)', 'ok'); return; }
    if (!confirm(`${pl.msg}. 키워드마다 업체 최대 ${n}곳씩 계산하고 워커에 글을 요청합니다. 이 탭을 열어 두세요. 진행할까요?`)) return;
    stopRef.current = false; const log: string[] = []; setBulk({ running: true, log });
    for (let i = 0; i < pl.list.length; i++) {
      if (stopRef.current) { log.push('중단'); break; }
      const k = pl.list[i]; const x = await buildKeyword(k.keyword, n); log.push(`${i + 1}/${pl.list.length} ${x.ok ? '✓' : '✕'} ${x.msg}`); setBulk({ running: true, log: [...log] });
    }
    setBulk({ running: false, log: [...log, '끝 — 워커가 글을 쓰면 렌더 PC가 이미지를 만듭니다 (수거는 2분마다 자동)'] }); r.refresh();
  };

  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="card" style={{ display: 'grid', gap: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>키워드<input value={kw} onChange={e => setKw(e.target.value)} placeholder="예: 토퍼" style={{ width: 200 }} onKeyDown={e => { if (e.key === 'Enter' && kw.trim()) go(() => buildKeyword(kw, n)); }} /></label>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>업체 수 (메일 대상 중)<input type="number" value={n} onChange={e => setN(Number(e.target.value) || 0)} style={{ width: 110 }} /></label>
        <button className="btn" disabled={busy || bulk.running || !kw.trim()} onClick={() => go(() => buildKeyword(kw, n))}>{busy ? '처리 중…' : '키워드 만들기'}</button>
        <button className="btn ghost" disabled={busy} onClick={() => go(collect)}>워커 결과 수거 + 렌더 요청</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{bulk.running ? <button className="btn" style={{ background: '#E11D48', borderColor: '#E11D48' }} onClick={() => { stopRef.current = true; }}>중단</button> : <button className="btn ghost" disabled={busy} onClick={prepareAll}>메일 키워드 전체 미리 준비</button>}</span>
      </div>
      <span className="help">메일 발송에서 「맞춤 제안서 이미지로」를 켜면 필요한 키워드는 자동으로 만들어집니다. 여기서는 미리 만들어 두거나 결과를 확인합니다. 수거·렌더는 워커 PC의 pv3_render.py 가 2분마다 자동으로 합니다.</span>
      {bulk.log.length > 0 && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--bg)', padding: 10, borderRadius: 8, margin: 0, maxHeight: 180, overflow: 'auto' }}>{bulk.log.join('\n')}</pre>}
    </div>

    <Section title={`키워드 ${rows.length}개`} sub="행을 누르면 업체별 판정·글·이미지 상태" flush>
      {rows.length === 0 ? <div style={{ padding: 16, color: 'var(--muted)' }}>아직 없음</div> : <table><thead><tr><th>키워드</th><th className="num">월 검색</th><th>키워드 글</th><th>공통 장</th><th>업체</th><th>업체 글 (워커)</th><th>발송 가능</th><th>갱신</th><th></th></tr></thead><tbody>
        {rows.map(x => { const st = AI[x.ai_status] ?? [x.ai_status, 'off']; return <Fragment key={x.keyword}>
          <tr style={{ cursor: 'pointer' }} onClick={() => toggle(x.keyword)}>
            <td><b>{x.keyword}</b></td><td className="num">{x.volume ? x.volume.toLocaleString('ko-KR') : '-'}</td>
            <td><Status kind={st[1]}>{st[0]}</Status>{x.ai_task_id && <span className="cell-sub"> #{x.ai_task_id}</span>}</td>
            <td>{x.ready ? <Status kind="ok">완료</Status> : <span className="cell-sub">대기</span>}</td>
            <td>{x.stores}곳</td><td>{x.storesAi}곳 <span className="cell-sub">({x.storesWorker})</span></td>
            <td>{x.ready && x.storesImg > 0 ? <b style={{ color: 'var(--ok-ink)' }}>{x.storesImg}곳</b> : <span className="cell-sub">{x.storesImg}곳</span>}</td>
            <td className="cell-sub">{fmtKST(x.updated_at)}</td>
            <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
              <a href={view('keyword', x.keyword, 'all')} target="_blank" rel="noreferrer" className="btn ghost xs">공통 장 보기</a>
              <button className="btn ghost xs" style={{ marginLeft: 4 }} disabled={busy} onClick={() => go(async () => { const y = await buildKeyword(x.keyword, n, true); await loadStores(x.keyword); return y; })}>다시 계산</button>
              <button className="btn ghost xs" style={{ marginLeft: 4 }} disabled={busy} onClick={() => go(() => rerender(x.keyword))}>다시 렌더</button>
              <button className="btn ghost xs" style={{ marginLeft: 4 }} onClick={async () => { if (raw[x.keyword]) { setRaw(r => { const n = { ...r }; delete n[x.keyword]; return n; }); return; } const w = await workerRaw(x.keyword); if (w.ok) setRaw(r => ({ ...r, [x.keyword]: w.items! })); }}>워커 원문</button>
              <button className="btn ghost xs" style={{ marginLeft: 4 }} disabled={busy} onClick={() => { if (confirm(`'${x.keyword}' 삭제?`)) go(() => removeKw(x.keyword)); }}>삭제</button></td></tr>
          {raw[x.keyword] && <tr><td colSpan={9} style={{ background: '#FFFBEB', padding: 10 }}>
            {raw[x.keyword].length === 0 ? <span className="help">워커 작업 없음</span> : raw[x.keyword].map(t => <details key={t.id} style={{ marginBottom: 8 }}><summary style={{ cursor: 'pointer', fontSize: 12.5 }}><b>#{t.id}</b> {t.title} · <Status kind={t.status === 'done' ? 'ok' : /fail|reject|cancel/.test(t.status) ? 'bad' : 'wait'}>{t.status}</Status></summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, margin: '6px 0 0', maxHeight: 320, overflow: 'auto', background: '#fff', padding: 8, borderRadius: 6 }}>{t.result || '(결과 없음)'}</pre></details>)}
          </td></tr>}
          {open === x.keyword && <tr><td colSpan={9} style={{ background: 'var(--bg)', padding: 10 }}>
            {!stores[x.keyword] ? <span className="help">불러오는 중…</span> : stores[x.keyword].length === 0 ? <span className="help">업체 없음 — 메일 대상에 이 키워드 업체가 없거나 업체 수 0 으로 만든 경우</span> : <table><thead><tr><th>업체</th><th>순위</th><th>막힌 곳</th><th>가장 먼저 할 광고</th><th>상품 매칭</th><th>헤드라인</th><th>글</th><th>이미지</th><th></th></tr></thead><tbody>
              {stores[x.keyword].map(s => { const sc = SRC[s.src] ?? SRC['']; return <tr key={s.id}><td><b>{s.store_name}</b></td><td>{s.rank ?? '밖'}</td><td>{LEAK_LABEL[s.leak as keyof typeof LEAK_LABEL] ?? s.leak}</td><td style={{ fontSize: 12.5 }}>{s.lead}</td>
                <td>{s.matched ? <Status kind="ok">상위 100 안</Status> : <span className="cell-sub" title="지수 데이터(상위 100)에서 이 스토어 상품을 못 찾음 — 순위·리뷰는 수집값 사용, 지수 비교는 빠짐">못 찾음</span>}</td>
                <td style={{ fontSize: 12.5, maxWidth: 380 }}>{s.headline || <span className="cell-sub">—</span>}</td><td><Status kind={sc[1]}>{sc[0]}</Status></td>
                <td>{s.ready ? <Status kind="ok">완료</Status> : <span className="cell-sub">대기</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}><a href={view('store', s.id, 'all')} target="_blank" rel="noreferrer" className="btn ghost xs" title="받는 사람이 보게 될 10장 전체 (화면 미리보기)">제안서 보기</a></td></tr>; })}
            </tbody></table>}
          </td></tr>}
        </Fragment>; })}
      </tbody></table>}
    </Section>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div className="card" style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
        <b style={{ fontSize: 13 }}>설정</b>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>카카오톡 오픈채팅 링크 (제안서 마지막 장)<div style={{ display: 'flex', gap: 6 }}><input value={kakao} onChange={e => setKakao(e.target.value)} placeholder="https://open.kakao.com/o/…" style={{ flex: 1 }} /><button className="btn ghost" disabled={busy} onClick={() => go(() => saveSetting('kakao_open', kakao))}>저장</button></div></label>
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
