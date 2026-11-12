'use client';
// 견적서 — 왼쪽 입력, 오른쪽 흰 시트(그대로 이미지로 나감). 부가세 '없음'이면 공급자가 리코프리로 바뀜
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { calc, hangul, type QData, type QItem, type QRow, type Supplier, type Suppliers } from '@/lib/quote';
import { saveQuote, deleteQuote, saveSuppliers } from './actions';

const won = (n: number) => Math.round(n || 0).toLocaleString('ko-KR');
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const blankItem = (): QItem => ({ name: '', period: '', scope: '', price: 0, qty: 1, note: '' });
const blank = (): QData => ({ no: today().replace(/-/g, '') + '-' + String(Date.now()).slice(-4), date: today(), client: '', items: [blankItem()], vat: 'excl', delivery: '', memo: '' });
const SUP_FIELDS: [keyof Supplier, string][] = [['regNo', '등록번호'], ['name', '상호(법인명)'], ['ceo', '대표'], ['addr', '사업장주소'], ['biz', '업태'], ['type', '업종'], ['tel', '전화번호'], ['email', '이메일'], ['account', '입금계좌']];
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line, #d9dde6)', borderRadius: 8, fontSize: 14, background: 'var(--bg, #fff)', color: 'inherit' };
const lab: React.CSSProperties = { fontSize: 12, fontWeight: 700, opacity: .7, marginBottom: 4, display: 'block' };

export default function QuoteClient({ rows, suppliers, canEditSupplier, me }: { rows: QRow[]; suppliers: Suppliers; canEditSupplier: boolean; me: string }) {
  const router = useRouter(); const sheet = useRef<HTMLDivElement>(null);
  const [id, setId] = useState<number | null>(null); const [d, setD] = useState<QData>(blank); const [busy, setBusy] = useState('');
  const [sup, setSup] = useState<Suppliers>(suppliers); const [showSup, setShowSup] = useState(false);
  const c = useMemo(() => calc(d), [d]); const S = d.vat === 'none' ? sup.novat : sup.main;
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
  const cell: React.CSSProperties = { border: '1px solid #222', padding: '7px 8px', fontSize: 13, textAlign: 'center', verticalAlign: 'middle', background: '#fff', color: '#111', fontWeight: 400 };
  const head: React.CSSProperties = { ...cell, background: '#F1F3F7', fontWeight: 700, color: '#111' };
  const filled = d.items.filter(it => it.name || it.price);
  const padRows = Math.max(0, 5 - filled.length);

  return <div style={{ display: 'grid', gap: 16 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 460px) 1fr', gap: 16, alignItems: 'start' }}>
      {/* ── 입력 ── */}
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b>{id ? '견적서 수정' : '새 견적서'}</b><button className="btn ghost xs" onClick={() => { setId(null); setD(blank()); }}>새로 쓰기</button></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 10 }}>
          <label><span style={lab}>거래처명 (○○ 귀하)</span><input style={inp} value={d.client} onChange={e => set({ client: e.target.value })} placeholder="예: 슈퍼포우" /></label>
          <label><span style={lab}>견적일자</span><input style={inp} type="date" value={d.date} onChange={e => set({ date: e.target.value })} /></label>
        </div>
        <div><span style={lab}>부가세</span>
          <div style={{ display: 'flex', gap: 6 }}>{([['excl', '10% 별도'], ['none', '없음 (리코프리)']] as [QData['vat'], string][]).map(([v, t]) => <button key={v} className={d.vat === v ? 'btn xs' : 'btn ghost xs'} onClick={() => set({ vat: v })}>{t}</button>)}</div>
          <div className="help" style={{ marginTop: 4 }}>{d.vat === 'none' ? `부가세 없는 견적 — 공급자·입금계좌가 ${sup.novat.name}로 나갑니다` : `공급자 ${sup.main.name} · 단가는 부가세 별도 금액으로 입력`}</div></div>
        <div><span style={lab}>품목</span>
          <div style={{ display: 'grid', gap: 8 }}>{d.items.map((it, i) => <div key={i} style={{ border: '1px solid var(--line, #d9dde6)', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px', gap: 6 }}><input style={inp} value={it.name} onChange={e => setItem(i, { name: e.target.value })} placeholder="품명 (예: 강아지덴탈껌 xs)" /><button className="btn ghost xs" onClick={() => setD(x => ({ ...x, items: x.items.length > 1 ? x.items.filter((_, j) => j !== i) : [blankItem()] }))} title="삭제">×</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6 }}><input style={inp} inputMode="numeric" value={it.price ? won(it.price) : ''} onChange={e => setItem(i, { price: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} placeholder="단가" /><input style={inp} inputMode="numeric" value={it.qty || ''} onChange={e => setItem(i, { qty: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} placeholder="수량" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}><input style={inp} value={it.period} onChange={e => setItem(i, { period: e.target.value })} placeholder="작업기간 (예: 10일)" /><input style={inp} value={it.scope} onChange={e => setItem(i, { scope: e.target.value })} placeholder="작업범위" /></div>
            <input style={inp} value={it.note} onChange={e => setItem(i, { note: e.target.value })} placeholder="비고 (예: 11/12~12/11)" /></div>)}</div>
          <button className="btn ghost xs" style={{ marginTop: 8 }} onClick={() => setD(x => ({ ...x, items: [...x.items, blankItem()] }))}>+ 품목 추가</button></div>
        <label><span style={lab}>납품조건</span><input style={inp} value={d.delivery} onChange={e => set({ delivery: e.target.value })} placeholder="예: 선입금 후 다음 날 시작" /></label>
        <label><span style={lab}>특이사항</span><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={d.memo} onChange={e => set({ memo: e.target.value })} /></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={!!busy} onClick={copy}>{busy === 'copy' ? '복사 중…' : '이미지 복사'}</button>
          <button className="btn ghost" disabled={!!busy} onClick={save}>{busy === 'png' ? '저장 중…' : 'PNG 저장'}</button>
          <button className="btn ghost" disabled={!!busy} onClick={keep}>목록에 저장</button>
        </div>
        <div className="help">「이미지 복사」 후 카톡 대화창에서 Ctrl+V 하면 바로 붙습니다. 복사·저장할 때 목록에도 자동으로 남습니다.</div>
        {canEditSupplier && <div><button className="btn ghost xs" onClick={() => setShowSup(v => !v)}>{showSup ? '공급자 정보 닫기' : '공급자 정보 설정'}</button>
          {showSup && <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>{(['main', 'novat'] as (keyof Suppliers)[]).map(k => <div key={k} style={{ border: '1px solid var(--line, #d9dde6)', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}><b style={{ fontSize: 13 }}>{k === 'main' ? '부가세 있는 견적 (세금계산서)' : '부가세 없는 견적'}</b>
            {SUP_FIELDS.map(([f, t]) => <label key={f} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 6, alignItems: 'center', fontSize: 12 }}><span>{t}</span><input style={inp} value={sup[k][f]} onChange={e => setSup(x => ({ ...x, [k]: { ...x[k], [f]: e.target.value } }))} /></label>)}</div>)}
            <button className="btn xs" onClick={async () => { const r = await saveSuppliers(sup); notify(r.msg, r.ok ? 'ok' : 'bad'); }}>공급자 정보 저장</button></div>}</div>}
      </div>

      {/* ── 견적서 시트 (이대로 이미지) ── */}
      <div style={{ overflowX: 'auto' }}>
        <div ref={sheet} style={{ width: 794, background: '#fff', color: '#111', padding: '44px 40px 40px', fontFamily: "'Malgun Gothic','Apple SD Gothic Neo',Pretendard,sans-serif", boxSizing: 'border-box' }}>
          <div style={{ textAlign: 'center', fontSize: 34, fontWeight: 800, letterSpacing: '.5em', paddingLeft: '.5em', borderTop: '3px solid #111', borderBottom: '3px solid #111', padding: '14px 0 14px .5em' }}>견적서</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 430px', gap: 18, marginTop: 22, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
              <div style={{ fontSize: 14 }}>견적일자 : <b>{d.date.replace(/-/g, '. ')}</b></div>
              <div style={{ fontSize: 24, fontWeight: 800, borderBottom: '2px solid #111', paddingBottom: 6 }}>{d.client || '○○○'} <span style={{ fontSize: 16, fontWeight: 700 }}>귀하</span></div>
              <div style={{ fontSize: 13, color: '#444' }}>아래와 같이 견적합니다.</div>
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}><tbody>
              <tr><td rowSpan={5} style={{ ...head, width: 30, lineHeight: 1.9 }}>공<br />급<br />자</td><td style={{ ...head, width: 86 }}>등록번호</td><td colSpan={3} style={{ ...cell, fontWeight: 700 }}>{S.regNo || '-'}</td></tr>
              <tr><td style={head}>상호</td><td style={cell}>{S.name}</td><td style={{ ...head, width: 62 }}>대표</td><td style={{ ...cell, width: 76 }}>{S.ceo || '-'}</td></tr>
              <tr><td style={head}>사업장주소</td><td colSpan={3} style={{ ...cell, fontSize: 12 }}>{S.addr || '-'}</td></tr>
              <tr><td style={head}>업태</td><td style={cell}>{S.biz || '-'}</td><td style={head}>업종</td><td style={cell}>{S.type || '-'}</td></tr>
              <tr><td style={head}>전화번호</td><td style={cell}>{S.tel || '-'}</td><td style={head}>이메일</td><td style={{ ...cell, fontSize: 11.5 }}>{S.email || '-'}</td></tr>
            </tbody></table>
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 18 }}><tbody><tr>
            <td style={{ ...head, width: 150, fontSize: 14 }}>합계금액<br /><span style={{ fontSize: 11, fontWeight: 500 }}>{d.vat === 'none' ? '(부가세 없음)' : '(공급가액+세액)'}</span></td>
            <td style={{ ...cell, fontSize: 20, fontWeight: 800, width: 190 }}>₩ {won(c.total)}</td>
            <td style={{ ...cell, fontSize: 16, fontWeight: 700 }}>일금 {hangul(c.total)}원정</td></tr></tbody></table>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 18 }}>
            <thead><tr><th style={{ ...head, width: 40 }}>순번</th><th style={head}>품명</th><th style={{ ...head, width: 76 }}>작업기간</th><th style={{ ...head, width: 82 }}>작업범위</th><th style={{ ...head, width: 82 }}>단가</th><th style={{ ...head, width: 44 }}>수량</th><th style={{ ...head, width: 92 }}>공급가액</th><th style={{ ...head, width: 76 }}>세액</th><th style={{ ...head, width: 112 }}>비고</th></tr></thead>
            <tbody>
              {filled.map((it, i) => { const k = d.items.indexOf(it); return <tr key={i}><td style={cell}>{i + 1}</td><td style={{ ...cell, textAlign: 'left' }}>{it.name}</td><td style={cell}>{it.period}</td><td style={cell}>{it.scope}</td><td style={{ ...cell, textAlign: 'right' }}>{won(it.price)}</td><td style={cell}>{it.qty}</td><td style={{ ...cell, textAlign: 'right' }}>{won(c.rows[k].supply)}</td><td style={{ ...cell, textAlign: 'right' }}>{d.vat === 'none' ? '-' : won(c.rows[k].tax)}</td><td style={{ ...cell, fontSize: 12 }}>{it.note}</td></tr>; })}
              {Array.from({ length: padRows }, (_, i) => <tr key={'p' + i}>{Array.from({ length: 9 }, (_, j) => <td key={j} style={{ ...cell, height: 32 }} />)}</tr>)}
              <tr><td colSpan={6} style={head}>합계</td><td style={{ ...cell, textAlign: 'right', fontWeight: 800 }}>{won(c.supply)}</td><td style={{ ...cell, textAlign: 'right', fontWeight: 800 }}>{d.vat === 'none' ? '-' : won(c.tax)}</td><td style={{ ...cell, fontWeight: 800 }}>{won(c.total)}</td></tr>
            </tbody></table>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 18 }}><tbody>
            <tr><td style={{ ...head, width: 90 }}>납품조건</td><td style={{ ...cell, textAlign: 'left', width: 250 }}>{d.delivery || '-'}</td><td style={{ ...head, width: 90 }}>입금계좌</td><td style={{ ...cell, fontWeight: 700 }}>{S.account || '-'}</td></tr>
            <tr><td style={head}>특이사항</td><td colSpan={3} style={{ ...cell, textAlign: 'left', whiteSpace: 'pre-wrap', minHeight: 48, height: 56 }}>{d.memo || '-'}</td></tr>
          </tbody></table>
        </div>
      </div>
    </div>

    {/* ── 저장된 견적서 ── */}
    <div className="card"><b>저장된 견적서 {rows.length}건</b>
      {rows.length === 0 ? <div className="help" style={{ marginTop: 8 }}>아직 없습니다 — 이미지 복사·저장을 하면 여기에 남습니다.</div> :
        <table style={{ width: '100%', marginTop: 10 }}><thead><tr><th style={{ textAlign: 'left' }}>거래처</th><th>합계</th><th>부가세</th><th>작성</th><th>수정일</th><th /></tr></thead><tbody>
          {rows.map(r => <tr key={r.id} style={id === r.id ? { background: 'rgba(47,91,255,.06)' } : {}}><td><b>{r.title}</b><div className="cell-sub">{(r.data.items ?? []).filter(i => i.name).map(i => i.name).slice(0, 3).join(', ')}</div></td><td className="num">{won(r.total)}원</td><td style={{ textAlign: 'center' }}>{r.data.vat === 'none' ? '없음' : '별도'}</td><td style={{ textAlign: 'center' }}>{r.owner || me}</td><td style={{ textAlign: 'center' }}>{new Date(r.updated_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn ghost xs" onClick={() => open(r)}>열기</button> <button className="btn ghost xs" onClick={() => del(r)}>삭제</button></td></tr>)}</tbody></table>}
    </div>
  </div>;
}
