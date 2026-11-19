'use client';
import { useState } from 'react';
import { notify } from '@/components/Toast';
import type { Diag, Item, Base } from '@/lib/shopDiag';
import { sdRun, sdSavePrices, type Prices } from './actions';
const won = (n: number) => Math.round(n).toLocaleString('ko-KR'); const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const color = (s: number) => s >= 83 ? '#067647' : s >= 66 ? '#1570EF' : s >= 50 ? '#475467' : s >= 33 ? '#B54708' : '#B42318';
const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); notify('복사했습니다', 'ok'); } catch { notify('복사 실패 — 직접 선택해서 복사해 주세요', 'bad'); } };
function Bar({ label, mine, base, fmt }: { label: string; mine: number; base: number; fmt: (n: number) => string }) {
  const max = Math.max(mine, base, 0.0001); const good = mine >= base;
  return <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 8, alignItems: 'center', fontSize: 13 }}>
    <span>{label}</span>
    <div style={{ display: 'grid', gap: 3 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div style={{ height: 8, borderRadius: 4, background: good ? '#12B76A' : '#F79009', width: `${Math.max(2, mine / max * 100)}%`, maxWidth: 'calc(100% - 110px)' }} /><b>{fmt(mine)}</b><span className="cell-sub">내 상품</span></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div style={{ height: 8, borderRadius: 4, background: '#98A2B3', width: `${Math.max(2, base / max * 100)}%`, maxWidth: 'calc(100% - 110px)' }} /><span>{fmt(base)}</span><span className="cell-sub">10위권 기준</span></div>
    </div></div>;
}
function Compare({ s, b }: { s: Item; b: Base }) {
  return <div style={{ display: 'grid', gap: 12 }}>
    <Bar label="클릭" mine={s.click} base={b.click} fmt={f1} /><Bar label="판매" mine={s.sale} base={b.sale} fmt={f1} /><Bar label="리뷰" mine={s.review} base={b.review} fmt={n => won(n) + '개'} />
    <Bar label="찜" mine={s.keep} base={b.keep} fmt={won} /><Bar label="가격" mine={s.price} base={b.price} fmt={n => won(n) + '원'} /></div>;
}
export default function Client({ prices0, boss }: { prices0: Prices; boss: boolean }) {
  const [f, setF] = useState({ url: '', keywords: '', name: '', honor: '대표님' }); const [busy, setBusy] = useState(false); const [d, setD] = useState<Diag | null>(null); const [err, setErr] = useState('');
  const [talk, setTalk] = useState(''); const [pr, setPr] = useState(prices0);
  const [q, setQ] = useState({ goal: '5위 이내', qty: '', days: '10', place: '', placeOn: false });
  const run = async () => { if (busy) return; setBusy(true); setErr(''); try { const r = await sdRun(f); if (!r.ok) { setErr(r.msg); notify(r.msg, 'bad'); return; } setD(r.diag); setTalk(r.diag.talk); notify(r.msg, 'ok'); } catch (e: any) { setErr('오류: ' + String(e?.message ?? e).slice(0, 100)); } finally { setBusy(false); } };
  const main = d?.rows.find(r => !r.err) ?? null; const sc = d?.scores;
  const qty = Math.max(0, Math.round(Number(q.qty) || 0)); const pl = Math.max(0, Math.round(Number(q.place) || 0)); const shopAmt = qty * pr.shop; const placeAmt = q.placeOn ? Math.round(pl / 100 * pr.place) : 0; const sum = shopAmt + placeAmt;
  const quote = !d || !main ? '' : [`${f.honor.trim() || '대표님'}, 견적 정리해 드립니다.`, '',
    ...(qty ? [`■ 쇼핑 ('${main.keyword}' ${q.goal} 목표)`, `· 대상: ${d.title ? d.title.slice(0, 34) : '해당 상품'}`, `· 수량: ${qty}개 / 기간: ${q.days}일`, `· 금액: ${won(pr.shop)}원 × ${qty} = ${won(shopAmt)}원 (VAT 별도)`, ''] : []),
    ...(q.placeOn && pl ? ['■ 플레이스 유입', `· 수량: 일 ${won(pl)} 유입 / 기간: ${q.days}일 단위`, `· 금액: 100당 ${won(pr.place)}원 × ${f1(pl / 100).replace(/\.0$/, '')} = ${won(placeAmt)}원 (VAT 별도)`, '· 시즌 흐름에 따라 수량 증감이 필요할 수 있어, 진행하면서 먼저 말씀드리겠습니다', `· ${q.days}일 단위 진행이며 시작 후 환불은 어렵습니다`, ''] : []),
    ...(qty && q.placeOn && pl ? ['■ 합계', `${won(sum)}원 (VAT 별도)`, ''] : []),
    '진행 중에는 순위를 매일 확인하고, 변동은 주간 리포트로 공유드립니다.', '진행 원하시면 세금계산서 발행 정보와 시작 희망일 알려주세요.'].join('\n');
  return <div style={{ display: 'grid', gap: 16 }}>
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <label>상품 주소 <span className="help" style={{ fontWeight: 400 }}>스마트스토어 상품 주소(단일) 또는 가격비교 catalog 주소(원부)</span><input value={f.url} onChange={e => setF(v => ({ ...v, url: e.target.value }))} placeholder="https://smartstore.naver.com/스토어/products/1234567890" /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        <label>키워드 <span className="help" style={{ fontWeight: 400 }}>콤마로 최대 5개 · 첫 번째가 기준 키워드</span><input value={f.keywords} onChange={e => setF(v => ({ ...v, keywords: e.target.value }))} placeholder="휘닉스파크스키강습, 평창스키강습" onKeyDown={e => { if (e.key === 'Enter') run(); }} /></label>
        <label>호칭<input value={f.honor} onChange={e => setF(v => ({ ...v, honor: e.target.value }))} placeholder="대표님" /></label>
      </div>
      <label>상품명 (선택) <span className="help" style={{ fontWeight: 400 }}>100위 밖일 때만 필요 — 줄여서 검색하고 상품 번호가 같은 것만 씁니다</span><input value={f.name} onChange={e => setF(v => ({ ...v, name: e.target.value }))} placeholder="100위 밖이라고 나오면 상품명을 붙여 넣고 다시 진단" /></label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" className="btn" disabled={busy || !f.url.trim() || !f.keywords.trim()} onClick={run}>{busy ? '진단 중… (최대 30초)' : '진단하기'}</button>
        <span className="help">키워드마다 지수 조회 1회 (24시간 안에 본 키워드는 다시 세지 않음)</span></div>
      {err && <div style={{ color: '#B42318' }}>{err}</div>}
    </div>
    {d && sc && <>
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}><b>진단 요약</b><span>{d.title || '(상품명 확인 안 됨)'}</span>{d.mall && <span className="cell-sub">{d.mall}</span>}<span className="chip">{d.target.kind === 'catalog' ? '가격비교(원부)' : '단일 상품'}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) 1fr', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 700, color: color(sc.total) }}>{d.grade}</div><div style={{ fontSize: 40, fontWeight: 800, color: color(sc.total), lineHeight: 1.1 }}>{sc.total}<span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}> / 100점</span></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            {([['검색 노출', sc.expo, '35%'], ['유입(클릭)', sc.click, '30%'], ['판매·리뷰', sc.sales, '25%'], ['상품 정보', sc.info, '10%']] as [string, number | null, string][]).map(([k, v, w]) => <div key={k} style={{ display: 'grid', gap: 4 }}>
              <span className="cell-sub">{k} {w}</span><b style={{ fontSize: 18 }}>{v == null ? '확인 불가' : v + '점'}</b>
              <div style={{ height: 6, borderRadius: 3, background: '#EAECF0' }}><div style={{ height: 6, borderRadius: 3, width: `${v ?? 0}%`, background: color(v ?? 0) }} /></div></div>)}
          </div>
        </div>
        {!d.self && <div style={{ color: '#B54708' }}>이 상품은 넣은 키워드 100위 안에 없어 지수를 확인하지 못했습니다. 위 「상품명」 칸에 상품명을 붙여 넣고 다시 진단하면 상품명으로 찾습니다. 가격비교에 묶인 상품이면 원부(catalog) 주소로 넣어 주세요.</div>}
        {d.self && d.selfFrom && <span className="help">상품 지수 출처: {d.selfFrom}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="card" style={{ display: 'grid', gap: 6, alignContent: 'start' }}><b>이런 점을 보완해 주세요</b>{d.bad.length ? d.bad.map((t, i) => <div key={i} style={{ fontSize: 13.5 }}><span style={{ color: '#F79009' }}>●</span> {t}</div>) : <span className="cell-sub">눈에 띄는 보완점이 없습니다</span>}</div>
        <div className="card" style={{ display: 'grid', gap: 6, alignContent: 'start' }}><b>이런 점이 좋아요</b>{d.good.length ? d.good.map((t, i) => <div key={i} style={{ fontSize: 13.5 }}><span style={{ color: '#12B76A' }}>●</span> {t}</div>) : <span className="cell-sub">아직 10위권 수준에 닿은 항목이 없습니다</span>}</div>
      </div>
      <div className="card" style={{ display: 'grid', gap: 10 }}><b>키워드 순위</b>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>키워드</th><th style={{ textAlign: 'right' }}>내 순위</th><th style={{ textAlign: 'right' }}>상품 수</th><th>1위 상품</th><th style={{ textAlign: 'right' }}>10위권 클릭</th><th style={{ textAlign: 'right' }}>10위권 리뷰</th><th style={{ textAlign: 'right' }}>같은 스토어</th></tr></thead>
          <tbody>{d.rows.map(r => <tr key={r.keyword}><td><b>{r.keyword}</b></td>
            {r.err ? <td colSpan={6} style={{ color: '#B42318' }}>{r.err}</td> : <>
              <td style={{ textAlign: 'right', fontWeight: 700, color: r.rank == null ? '#B42318' : r.rank <= 10 ? '#067647' : undefined }}>{r.rank == null ? '100위 밖' : r.rank + '위'}</td><td style={{ textAlign: 'right' }}>{r.total}</td>
              <td className="cell-sub">{r.first ? `${r.first.title.slice(0, 26)} · 리뷰 ${won(r.first.review)}` : '-'}</td><td style={{ textAlign: 'right' }}>{r.base ? f1(r.base.click) : '-'}</td><td style={{ textAlign: 'right' }}>{r.base ? won(r.base.review) : '-'}</td><td style={{ textAlign: 'right' }}>{r.same.length ? r.same.length + '개' : '-'}</td></>}</tr>)}</tbody></table></div>
      </div>
      {d.self && main?.base && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div className="card" style={{ display: 'grid', gap: 12, alignContent: 'start' }}><b>10위권 비교 <span className="cell-sub" style={{ fontWeight: 400 }}>'{main.keyword}' 8~12위 중앙값</span></b><Compare s={d.self} b={main.base} /></div>
        <div className="card" style={{ display: 'grid', gap: 8, alignContent: 'start' }}><b>1위 상품 · 같은 스토어 상품</b>
          {main.first && <div style={{ fontSize: 13 }}>1위 <b>{main.first.title.slice(0, 40)}</b><div className="cell-sub">{main.first.mall || '가격비교'} · 리뷰 {won(main.first.review)} · 찜 {won(main.first.keep)} · 클릭 {f1(main.first.click)} · 판매 {f1(main.first.sale)} · {won(main.first.price)}원</div></div>}
          {main.same.length ? <div style={{ display: 'grid', gap: 3, fontSize: 13 }}><span className="cell-sub">'{main.keyword}'에 올라온 같은 스토어 상품</span>{main.same.map(s => <div key={s.rank}><b>{s.rank}위</b> {s.title.slice(0, 44)}</div>)}</div> : <span className="cell-sub">같은 키워드에 올라온 같은 스토어 상품이 없습니다</span>}
        </div></div>}
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>카톡 문구</b><button type="button" className="btn ghost xs" onClick={() => copy(talk)}>복사</button><span className="help">고쳐서 보내도 됩니다. 길면 카톡에서 접히니 ■ 단위로 나눠 보내세요</span></div>
        <textarea value={talk} onChange={e => setTalk(e.target.value)} rows={Math.min(22, Math.max(8, talk.split('\n').length + 1))} style={{ fontSize: 13.5, lineHeight: 1.6 }} />
      </div>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <b>견적</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <label>목표 순위<select value={q.goal} onChange={e => setQ(v => ({ ...v, goal: e.target.value }))}>{['3위 이내', '5위 이내', '6위 이내', '10위 이내'].map(g => <option key={g}>{g}</option>)}</select></label>
          <label>쇼핑 수량 (개)<input type="number" min={0} value={q.qty} onChange={e => setQ(v => ({ ...v, qty: e.target.value }))} placeholder="예: 8" /></label>
          <label>기간 (일)<input type="number" min={1} value={q.days} onChange={e => setQ(v => ({ ...v, days: e.target.value }))} /></label>
          <label>쇼핑 단가 (1개)<input type="number" value={pr.shop} disabled={!boss} onChange={e => setPr(v => ({ ...v, shop: Number(e.target.value) }))} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={q.placeOn} onChange={e => setQ(v => ({ ...v, placeOn: e.target.checked }))} style={{ width: 'auto' }} /> 플레이스 유입 같이 넣기</label>
          {q.placeOn && <><label>일 유입 수량<input type="number" min={0} step={100} value={q.place} onChange={e => setQ(v => ({ ...v, place: e.target.value }))} placeholder="예: 800" /></label>
            <label>플레이스 단가 (100당)<input type="number" value={pr.place} disabled={!boss} onChange={e => setPr(v => ({ ...v, place: Number(e.target.value) }))} /></label></>}
          {boss && <button type="button" className="btn ghost" onClick={async () => { const r = await sdSavePrices(pr); notify(r.msg, r.ok ? 'ok' : 'bad'); }}>단가 기본값 저장</button>}
          <span className="help">{boss ? '단가는 총괄만 바꿀 수 있고, 저장하면 전 직원 기본값이 됩니다' : '단가는 총괄이 정한 값으로 고정됩니다'}</span>
        </div>
        {(qty > 0 || (q.placeOn && pl > 0)) ? <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>합계 {won(sum)}원</b><span className="cell-sub">VAT 포함 {won(sum * 1.1)}원</span><button type="button" className="btn ghost xs" onClick={() => copy(quote)}>견적 문구 복사</button></div>
          <textarea readOnly value={quote} rows={Math.min(20, quote.split('\n').length + 1)} style={{ fontSize: 13.5, lineHeight: 1.6 }} /></> : <span className="cell-sub">수량을 넣으면 견적 문구가 만들어집니다. 수량은 직접 정해 넣습니다</span>}
      </div>
    </>}
  </div>;
}
