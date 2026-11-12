'use client';
// 견적서 — 왼쪽 입력, 오른쪽 흰 시트(그대로 이미지로 나감). 부가세 '없음'이면 공급자가 리코프리로 바뀜
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { calc, hangul, supOf, SUP_VAT, type SupKey, type QData, type QItem, type QRow, type Supplier, type Suppliers } from '@/lib/quote';
import { saveQuote, deleteQuote, saveSuppliers } from './actions';

const INK = '#0A1024', SUB = '#55607A', MUTE = '#8A93A8', LINE = '#E3E7F0', SOFT = '#F4F6FB', BLUE = '#2B5BFF', BLUESOFT = '#EEF2FF', BLUELINE = '#C5D3FF';
const FONT_BASE = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/woff2';
const FONT_CSS = [['Regular', 400], ['SemiBold', 600], ['ExtraBold', 800]].map(([n, w]) => `@font-face{font-family:'QuotePretendard';font-weight:${w};font-style:normal;font-display:swap;src:url('${FONT_BASE}/Pretendard-${n}.woff2') format('woff2')}`).join('');
const th: React.CSSProperties = { background: INK, color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '10px 8px', border: 0 };
const td: React.CSSProperties = { fontSize: 13.5, padding: '10px 8px', textAlign: 'center', verticalAlign: 'middle', background: '#fff', color: INK, fontWeight: 400, border: 0, borderBottom: `1px solid ${LINE}`, fontVariantNumeric: 'tabular-nums' };
const box: React.CSSProperties = { background: SOFT, borderRadius: 12, padding: '14px 18px' };
const boxLab: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, color: SUB, letterSpacing: '.04em' };
const won = (n: number) => Math.round(n || 0).toLocaleString('ko-KR');
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const blankItem = (): QItem => ({ name: '', period: '', scope: '', price: 0, qty: 1, note: '' });
const blank = (): QData => ({ no: today().replace(/-/g, '') + '-' + String(Date.now()).slice(-4), date: today(), client: '', items: [blankItem()], vat: 'excl', delivery: '입금 확인 후 다음 날 시작', memo: '' });
const SUP_FIELDS: [keyof Supplier, string][] = [['regNo', '등록번호'], ['name', '상호(법인명)'], ['ceo', '대표'], ['addr', '사업장주소'], ['biz', '업태'], ['type', '업종'], ['tel', '전화번호'], ['email', '이메일'], ['account', '입금계좌']];
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line, #d9dde6)', borderRadius: 8, fontSize: 14, background: 'var(--bg, #fff)', color: 'inherit' };
const lab: React.CSSProperties = { fontSize: 12, fontWeight: 700, opacity: .7, marginBottom: 4, display: 'block' };

export default function QuoteClient({ rows, suppliers, canEditSupplier, me }: { rows: QRow[]; suppliers: Suppliers; canEditSupplier: boolean; me: string }) {
  const router = useRouter(); const sheet = useRef<HTMLDivElement>(null);
  const [id, setId] = useState<number | null>(null); const [d, setD] = useState<QData>(blank); const [busy, setBusy] = useState('');
  const [sup, setSup] = useState<Suppliers>(suppliers); const [showSup, setShowSup] = useState(false);
  const c = useMemo(() => calc(d), [d]); const sk = supOf(d); const S = sup[sk];
  const set = (p: Partial<QData>) => setD(x => ({ ...x, ...p }));
  const setItem = (i: number, p: Partial<QItem>) => setD(x => ({ ...x, items: x.items.map((it, j) => j === i ? { ...it, ...p } : it) }));
  const png = async () => { if (!sheet.current) return null; const { toPng } = await import('html-to-image'); return toPng(sheet.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true }); };
  const fname = `견적서_${d.client || '거래처'}_${d.date}`;
  const persist = async () => { const r = await saveQuote(id, d, c.total); if (r.ok && r.id) setId(r.id); return r; };
  const copy = async () => {
    setBusy('copy');
    try { const u = await png(); if (!u) return; const blob = await (await fetch(u)).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); notify('이미지 복사됨 — 카톡 창에 Ctrl+V', 'ok'); await persist(); router.refresh(); }
    catch (e: any) { notify('복사 실패 — 「PNG 저장」을 써 주세요 (' + (e?.message ?? '') + ')', 'bad'); } finally { setBusy(''); }
  };
  const save = async () => {
    setBusy('png');
    try { const u = await png(); if (!u) return; const a = document.createElement('a'); a.href = u; a.download = fname + '.png'; a.click(); notify('PNG 저장됨', 'ok'); await persist(); router.refresh(); }
    catch (e: any) { notify('저장 실패: ' + (e?.message ?? ''), 'bad'); } finally { setBusy(''); }
  };
  const keep = async () => { setBusy('keep'); const r = await persist(); notify(r.msg, r.ok ? 'ok' : 'bad'); setBusy(''); router.refresh(); };
  const open = (r: QRow) => { setId(r.id); setD({ ...blank(), ...r.data, vat: r.data.vat === 'none' ? 'none' : 'excl', items: r.data.items?.length ? r.data.items : [blankItem()] }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const del = async (r: QRow) => { const x = await deleteQuote(r.id); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok && id === r.id) { setId(null); setD(blank()); } router.refresh(); };
  const filled = d.items.filter(it => it.name || it.price);
  const padRows = Math.max(0, 5 - filled.length);
  const hasPeriod = filled.some(it => it.period), hasScope = filled.some(it => it.scope), hasNote = filled.some(it => it.note);   // 비어 있는 열은 빼서 품명 칸을 넓게
  const cols = ([['No', 36, 'center', true], ['품명', 0, 'left', true], ['작업기간', 70, 'center', hasPeriod], ['작업범위', 84, 'center', hasScope], ['단가', 84, 'right', true], ['수량', 44, 'center', true], ['공급가액', 92, 'right', true], ['세액', 78, 'right', true], ['비고', 104, 'center', hasNote]] as [string, number, 'center' | 'left' | 'right', boolean][]).filter(x => x[3]);

  return <div style={{ display: 'grid', gap: 16 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 460px) 1fr', gap: 16, alignItems: 'start' }}>
      {/* ── 입력 ── */}
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b>{id ? '견적서 수정' : '새 견적서'}</b><button className="btn ghost xs" onClick={() => { setId(null); setD(blank()); }}>새로 쓰기</button></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 10 }}>
          <label><span style={lab}>거래처명 (○○ 귀하)</span><input style={inp} value={d.client} onChange={e => set({ client: e.target.value })} placeholder="예: 슈퍼포우" /></label>
          <label><span style={lab}>견적일자</span><input style={inp} type="date" value={d.date} onChange={e => set({ date: e.target.value })} /></label>
        </div>
        <div><span style={lab}>공급자 (부가세)</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(['main', 'adfree', 'novat'] as SupKey[]).map(k => <button key={k} className={sk === k ? 'btn xs' : 'btn ghost xs'} onClick={() => set({ sup: k, vat: SUP_VAT[k] })}>{sup[k].name} · {SUP_VAT[k] === 'none' ? '부가세 없음' : '10% 별도'}</button>)}</div>
          <div className="help" style={{ marginTop: 4 }}>{d.vat === 'none' ? `부가세 없는 견적 — 공급자·입금계좌가 ${S.name}로 나갑니다` : `공급자 ${S.name} · 단가는 부가세 별도 금액으로 입력`}{!S.account ? ' · 입금계좌가 비어 있습니다 (공급자 정보 설정에서 입력)' : ''}</div></div>
        <div><span style={lab}>품목</span>
          <div style={{ display: 'grid', gap: 8 }}>{d.items.map((it, i) => <div key={i} style={{ border: '1px solid var(--line, #d9dde6)', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px', gap: 6 }}><input style={inp} value={it.name} onChange={e => setItem(i, { name: e.target.value })} placeholder="품명 (예: 강아지덴탈껌 xs)" /><button className="btn ghost xs" onClick={() => setD(x => ({ ...x, items: x.items.length > 1 ? x.items.filter((_, j) => j !== i) : [blankItem()] }))} title="삭제">×</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6 }}><input style={inp} inputMode="numeric" value={it.price ? won(it.price) : ''} onChange={e => setItem(i, { price: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} placeholder="단가" /><input style={inp} inputMode="numeric" value={it.qty || ''} onChange={e => setItem(i, { qty: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} placeholder="수량" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}><input style={inp} value={it.period} onChange={e => setItem(i, { period: e.target.value })} placeholder="작업기간 (예: 10일)" /><input style={inp} value={it.scope} onChange={e => setItem(i, { scope: e.target.value })} placeholder="작업범위" /></div>
            <input style={inp} value={it.note} onChange={e => setItem(i, { note: e.target.value })} placeholder="비고 (예: 11/12~12/11)" /></div>)}</div>
          <button className="btn ghost xs" style={{ marginTop: 8 }} onClick={() => setD(x => ({ ...x, items: [...x.items, blankItem()] }))}>+ 품목 추가</button></div>
        <label><span style={lab}>진행 조건</span><input style={inp} value={d.delivery} onChange={e => set({ delivery: e.target.value })} placeholder="예: 입금 확인 후 다음 날 시작" /></label>
        <label><span style={lab}>특이사항</span><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={d.memo} onChange={e => set({ memo: e.target.value })} /></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={!!busy} onClick={copy}>{busy === 'copy' ? '복사 중…' : '이미지 복사'}</button>
          <button className="btn ghost" disabled={!!busy} onClick={save}>{busy === 'png' ? '저장 중…' : 'PNG 저장'}</button>
          <button className="btn ghost" disabled={!!busy} onClick={keep}>목록에 저장</button>
        </div>
        <div className="help">「이미지 복사」 후 카톡 대화창에서 Ctrl+V 하면 바로 붙습니다. 복사·저장할 때 목록에도 자동으로 남습니다.</div>
        {canEditSupplier && <div><button className="btn ghost xs" onClick={() => setShowSup(v => !v)}>{showSup ? '공급자 정보 닫기' : '공급자 정보 설정'}</button>
          {showSup && <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>{(['main', 'adfree', 'novat'] as (keyof Suppliers)[]).map(k => <div key={k} style={{ border: '1px solid var(--line, #d9dde6)', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}><b style={{ fontSize: 13 }}>{sup[k].name} — {SUP_VAT[k] === 'none' ? '부가세 없음' : '10% 별도'}</b>
            {SUP_FIELDS.map(([f, t]) => <label key={f} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 6, alignItems: 'center', fontSize: 12 }}><span>{t}</span><input style={inp} value={sup[k][f]} onChange={e => setSup(x => ({ ...x, [k]: { ...x[k], [f]: e.target.value } }))} /></label>)}</div>)}
            <button className="btn xs" onClick={async () => { const r = await saveSuppliers(sup); notify(r.msg, r.ok ? 'ok' : 'bad'); }}>공급자 정보 저장</button></div>}</div>}
      </div>

      {/* ── 견적서 시트 (이대로 이미지) ── */}
      <div style={{ overflowX: 'auto' }}>
        <style>{FONT_CSS}</style>
        <div ref={sheet} style={{ width: 794, background: '#fff', color: INK, fontFamily: "'QuotePretendard','Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif", boxSizing: 'border-box', letterSpacing: '-.01em', lineHeight: 1.5 }}>
          {/* 머리 */}
          <div style={{ background: INK, color: '#fff', padding: '34px 44px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div><div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.22em', color: '#9DB1FF' }}>QUOTATION</div><div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '.18em', marginTop: 4 }}>견적서</div></div>
            <div style={{ textAlign: 'right', fontSize: 13, color: '#C3CBE0', lineHeight: 1.8 }}><div>견적일자 <b style={{ color: '#fff', marginLeft: 8 }}>{d.date.replace(/-/g, '. ')}</b></div><div>문서번호 <b style={{ color: '#fff', marginLeft: 8 }}>{d.no}</b></div></div>
          </div>
          <div style={{ padding: '30px 44px 40px' }}>
            {/* 받는 곳 · 공급자 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 28, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: BLUE, letterSpacing: '.08em' }}>수신</div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, paddingBottom: 10, borderBottom: `2px solid ${INK}`, wordBreak: 'keep-all' }}>{d.client || '○○○'} <span style={{ fontSize: 16, fontWeight: 600, color: SUB }}>귀하</span></div>
                <div style={{ fontSize: 13.5, color: SUB, marginTop: 12 }}>아래와 같이 견적합니다.</div>
              </div>
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ background: SOFT, padding: '9px 16px', fontSize: 12.5, fontWeight: 800, color: SUB, letterSpacing: '.08em' }}>공급자</div>
                <div style={{ padding: '10px 16px 12px', display: 'grid', gridTemplateColumns: '74px 1fr', rowGap: 5, fontSize: 13 }}>
                  {([['등록번호', S.regNo], ['상호', S.name], ['대표', S.ceo], ['주소', S.addr], ['업태 · 업종', [S.biz, S.type].filter(Boolean).join(' · ')], ['전화', S.tel], ['이메일', S.email]] as [string, string][]).filter(([, v]) => v).map(([k, v]) => [<div key={k} style={{ color: MUTE, fontWeight: 600 }}>{k}</div>, <div key={k + 'v'} style={{ fontWeight: k === '상호' || k === '등록번호' ? 800 : 400, wordBreak: 'keep-all' }}>{v}</div>])}
                </div>
              </div>
            </div>
            {/* 합계 */}
            <div style={{ marginTop: 24, background: BLUESOFT, border: `1px solid ${BLUELINE}`, borderRadius: 14, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div><div style={{ fontSize: 13, fontWeight: 800, color: BLUE }}>합계금액 <span style={{ fontWeight: 600, color: SUB }}>{d.vat === 'none' ? '(부가세 없음)' : '(공급가액 + 세액)'}</span></div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>일금 {hangul(c.total)}원정</div></div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>₩ {won(c.total)}</div>
            </div>
            {/* 품목 */}
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 24, tableLayout: 'fixed' }}>
              <thead><tr>{cols.map(([t, w, al]) => <th key={t} style={{ ...th, width: w || undefined, textAlign: al }}>{t}</th>)}</tr></thead>
              <tbody>
                {filled.map((it, i) => { const k = d.items.indexOf(it); return <tr key={i}><td style={td}>{i + 1}</td><td style={{ ...td, textAlign: 'left', fontWeight: 600, wordBreak: 'keep-all' }}>{it.name}</td>{hasPeriod && <td style={td}>{it.period}</td>}{hasScope && <td style={td}>{it.scope}</td>}<td style={{ ...td, textAlign: 'right' }}>{won(it.price)}</td><td style={td}>{it.qty}</td><td style={{ ...td, textAlign: 'right' }}>{won(c.rows[k].supply)}</td><td style={{ ...td, textAlign: 'right' }}>{d.vat === 'none' ? '-' : won(c.rows[k].tax)}</td>{hasNote && <td style={{ ...td, fontSize: 12, color: SUB }}>{it.note}</td>}</tr>; })}
                {Array.from({ length: padRows }, (_, i) => <tr key={'p' + i}>{cols.map((_, j) => <td key={j} style={{ ...td, height: 36 }} />)}</tr>)}
                <tr><td colSpan={cols.length - (hasNote ? 3 : 2)} style={{ ...td, background: SOFT, fontWeight: 800, borderBottom: `2px solid ${INK}` }}>합계</td><td style={{ ...td, background: SOFT, textAlign: 'right', fontWeight: 800, borderBottom: `2px solid ${INK}` }}>{won(c.supply)}</td><td style={{ ...td, background: SOFT, textAlign: 'right', fontWeight: 800, borderBottom: `2px solid ${INK}` }}>{d.vat === 'none' ? '-' : won(c.tax)}</td>{hasNote && <td style={{ ...td, background: SOFT, fontWeight: 800, color: BLUE, borderBottom: `2px solid ${INK}` }}>{won(c.total)}</td>}</tr>
              </tbody></table>
            {/* 조건 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 22 }}>
              <div style={box}><div style={boxLab}>입금계좌</div><div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 4 }}>{S.account || '-'}</div></div>
              <div style={box}><div style={boxLab}>진행 조건</div><div style={{ fontSize: 14, marginTop: 4, wordBreak: 'keep-all' }}>{d.delivery || '-'}</div></div>
            </div>
            {d.memo && <div style={{ ...box, marginTop: 12 }}><div style={boxLab}>특이사항</div><div style={{ fontSize: 13.5, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'keep-all', lineHeight: 1.65 }}>{d.memo}</div></div>}
            <div style={{ marginTop: 26, paddingTop: 14, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTE }}><span>{S.name}</span><span>본 견적서는 발행일로부터 14일간 유효합니다.</span></div>
          </div>
        </div>
      </div>
    </div>

    {/* ── 저장된 견적서 ── */}
    <div className="card"><b>저장된 견적서 {rows.length}건</b>
      {rows.length === 0 ? <div className="help" style={{ marginTop: 8 }}>아직 없습니다 — 이미지 복사·저장을 하면 여기에 남습니다.</div> :
        <table style={{ width: '100%', marginTop: 10 }}><thead><tr><th style={{ textAlign: 'left' }}>거래처</th><th>합계</th><th>공급자 · 부가세</th><th>작성</th><th>수정일</th><th /></tr></thead><tbody>
          {rows.map(r => <tr key={r.id} style={id === r.id ? { background: 'rgba(47,91,255,.06)' } : {}}><td><b>{r.title}</b><div className="cell-sub">{(r.data.items ?? []).filter(i => i.name).map(i => i.name).slice(0, 3).join(', ')}</div></td><td className="num">{won(r.total)}원</td><td style={{ textAlign: 'center' }}>{sup[supOf(r.data)].name} · {r.data.vat === 'none' ? '없음' : '별도'}</td><td style={{ textAlign: 'center' }}>{r.owner || me}</td><td style={{ textAlign: 'center' }}>{new Date(r.updated_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn ghost xs" onClick={() => open(r)}>열기</button> <button className="btn ghost xs" onClick={() => del(r)}>삭제</button></td></tr>)}</tbody></table>}
    </div>
  </div>;
}
