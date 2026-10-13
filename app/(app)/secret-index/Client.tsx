'use client';
import { useEffect, useState } from 'react';
import { notify } from '@/components/Toast';
import { Section, Cell, Status, Empty } from '@/components/ui';
import { nscSearch, nscRecent, nscStatus } from './actions';
type Result = NonNullable<Awaited<ReturnType<typeof nscSearch>>['result']>;
const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const fmt = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const Star = ({ v }: { v: number }) => <span className="num" style={{ fontWeight: 700, color: v >= 4 ? 'var(--ok-ink)' : v >= 3 ? 'var(--ink)' : v >= 2 ? 'var(--wait-ink)' : 'var(--bad-ink)' }}>{v.toFixed(1)}</span>;
const Score = ({ v }: { v: number }) => <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="bar" style={{ flex: 1, marginTop: 0 }}><i style={{ width: `${Math.min(100, v)}%`, background: v >= 70 ? 'var(--ok)' : v >= 50 ? 'var(--wait)' : 'var(--bad)' }} /></div><span className="num" style={{ fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{v.toFixed(1)}</span></div>;

export default function Client({ initialQ, canAdmin }: { initialQ: string; canAdmin: boolean }) {
  const [q, setQ] = useState(initialQ); const [busy, setBusy] = useState(false); const [r, setR] = useState<Result | null>(null);
  const [recent, setRecent] = useState<{ keyword: string; fetched_at: string }[]>([]); const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [filter, setFilter] = useState(''); const [type, setType] = useState(''); const [sort, setSort] = useState<'rank' | 'score' | 'sale' | 'hit' | 'review' | 'price'>('rank'); const [tab, setTab] = useState<'list' | 'report'>('list');
  const loadRecent = () => nscRecent().then(x => { if (x.ok) { setRecent(x.list ?? []); setUsage(x.usage ?? null); } });
  useEffect(() => { loadRecent(); if (initialQ) run(initialQ); }, []);
  const run = async (kw: string, force = false) => { if (!kw.trim() || busy) return; setBusy(true); const x = await nscSearch(kw, force); setBusy(false); if (!x.ok) return notify(x.msg, 'bad', 7000); setR(x.result!); setQ(x.result!.keyword); setFilter(''); setType(''); setSort('rank'); notify(x.msg, 'ok'); loadRecent(); };
  const products = (r?.products ?? []).filter(p => (!filter || [p.productTitle, p.mallName].some(v => v.toLowerCase().includes(filter.toLowerCase()))) && (!type || p.상품유형 === type))
    .sort((a, b) => sort === 'rank' ? a.rank - b.rank : sort === 'score' ? (b.종합점수 ?? 0) - (a.종합점수 ?? 0) : sort === 'sale' ? b.saleStarScore - a.saleStarScore || a.rank - b.rank : sort === 'hit' ? b.hitStarScore - a.hitStarScore || a.rank - b.rank : sort === 'review' ? b.reviewCount - a.reviewCount : a.lowPrice - b.lowPrice);
  const types = [...new Set((r?.products ?? []).map(p => p.상품유형).filter(Boolean))] as string[];
  const s = r?.summary; const eb = r?.entry_bar; const f1 = r?.insights1st;
  return <>
    <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px' }}>
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') run(q); }} placeholder="상품 키워드 (예: usb케이블)" style={{ flex: '1 1 260px' }} />
      <button className="btn" disabled={busy || !q.trim()} onClick={() => run(q)}>{busy ? '조회 중… (최대 1분)' : '조회'}</button>
      {canAdmin && r && <button className="btn ghost" disabled={busy} onClick={() => { if (confirm('캐시를 무시하고 새로 조회합니다 (비용 발생). 진행할까요?')) run(q, true); }}>강제 재조회</button>}
      {canAdmin && <button className="btn ghost" disabled={busy} onClick={async () => { const x = await nscStatus(); notify(x.ok ? `${x.msg} · ${x.user?.plan_name ?? ''} · 오늘 ${x.user?.used_today ?? 0}/${x.user?.daily_limit ?? 0}` : x.msg, x.ok ? 'ok' : 'bad', 7000); }}>연결 상태</button>}
      <span className="cell-sub" style={{ marginLeft: 'auto' }}>{usage ? `내 오늘 새 조회 ${usage.used}/${usage.limit}` : ''}{r ? ` · 이 결과: ${fmt(r.fetched_at)} 조회${r.cached ? ' (캐시)' : ''}` : ''}</span>
    </div>

    {!r && <Section title="최근 조회한 키워드" sub="클릭하면 저장된 결과를 바로 봅니다 (24시간 내 무료)">
      {recent.length === 0 ? <Empty>아직 조회한 키워드가 없습니다</Empty> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{recent.map(x => <button key={x.keyword} type="button" className="btn ghost sm" onClick={() => run(x.keyword)}>{x.keyword} <span className="cell-sub" style={{ display: 'inline', marginLeft: 4 }}>{fmt(x.fetched_at)}</span></button>)}</div>}
    </Section>}

    {r && <>
      <div className="grid4">
        <div className="card stat" style={{ padding: '16px 18px' }}><div className="l">난이도</div><div className="v" style={{ color: (s?.difficulty?.score ?? 0) >= 70 ? 'var(--bad-ink)' : (s?.difficulty?.score ?? 0) >= 40 ? 'var(--wait-ink)' : 'var(--ok-ink)' }}>{s?.difficulty?.score ?? '-'}<span style={{ fontSize: 15, marginLeft: 6 }}>{s?.difficulty?.label ?? ''}</span></div><div className="d">{s?.headline ?? ''}</div></div>
        {(s?.facts ?? []).slice(0, 3).map((x: any, i: number) => <div key={i} className="card stat" style={{ padding: '16px 18px' }}><div className="l">{x.label}</div><div className="v" style={{ fontSize: 22 }}>{x.value}</div><div className="d">{x.sub}</div></div>)}
      </div>
      {eb && <Section title="진입 기준선" sub="그 순위권에 들어가려면 필요한 수준 (중앙값)">
        <div className="tbl-wrap"><table><thead><tr><th>순위권</th><th className="num">종합점수</th><th className="num">클릭</th><th className="num">판매</th><th className="num">리뷰</th><th className="num">찜</th><th className="num">가격</th></tr></thead><tbody>
          {(['rank10', 'rank30', 'rank100'] as const).map(k => eb[k] && <tr key={k}><td><Cell main={eb[k].label} sub={`${eb[k].ranks?.[0]}~${eb[k].ranks?.[1]}위 ${eb[k].n}개 기준`} /></td><td className="num" style={{ fontWeight: 700 }}>{eb[k].score}</td><td className="num"><Star v={Number(eb[k].hit)} /></td><td className="num"><Star v={Number(eb[k].sale)} /></td><td className="num">{Number(eb[k].reviews).toLocaleString()}</td><td className="num">{Number(eb[k].keep).toLocaleString()}</td><td className="num">{won(eb[k].price)}</td></tr>)}
        </tbody></table></div>
        {eb.read && <div className="cell-sub" style={{ marginTop: 8 }}>{eb.read}</div>}
      </Section>}

      <div style={{ display: 'flex', gap: 8 }}><button type="button" className={'btn ' + (tab === 'list' ? '' : 'ghost')} onClick={() => setTab('list')}>상품 100개</button><button type="button" className={'btn ' + (tab === 'report' ? '' : 'ghost')} onClick={() => setTab('report')}>분석 리포트</button></div>

      {tab === 'list' && <Section title={`「${r.keyword}」 상위 ${r.products.length}개`} sub="지수는 5점 만점 · 종합점수 100점" flush right={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="스토어·상품명 찾기" style={{ width: 180, minHeight: 36, padding: '0 10px', fontSize: 13 }} /><select value={type} onChange={e => setType(e.target.value)} style={{ width: 130, minHeight: 36, padding: '0 8px', fontSize: 13 }}><option value="">전체 유형</option>{types.map(t => <option key={t} value={t}>{t}</option>)}</select><select value={sort} onChange={e => setSort(e.target.value as any)} style={{ width: 130, minHeight: 36, padding: '0 8px', fontSize: 13 }}><option value="rank">순위순</option><option value="score">종합점수순</option><option value="sale">판매지수순</option><option value="hit">클릭지수순</option><option value="review">리뷰순</option><option value="price">가격 낮은순</option></select></div>}>
        <div className="tbl-wrap"><table style={{ minWidth: 1100 }}>
          <thead><tr><th className="num">순위</th><th style={{ width: 64 }}></th><th>상품</th><th>스토어</th><th className="num">최저가</th><th className="num">리뷰</th><th className="num">찜</th><th className="num">히든구매</th><th className="num">클릭</th><th className="num">판매</th><th className="num">품질</th><th style={{ width: 150 }}>종합점수</th></tr></thead>
          <tbody>{products.map(p => <tr key={String(p.nvmid ?? p.rank)}>
            <td className="num" style={{ fontWeight: 700 }}>{p.rank}{p.rank_delta ? <div style={{ fontSize: 11, color: p.rank_delta > 0 ? 'var(--ok-ink)' : 'var(--bad-ink)', fontWeight: 600 }}>{p.rank_delta > 0 ? '▲' : '▼'}{Math.abs(p.rank_delta)}</div> : null}</td>
            <td style={{ padding: '6px 8px' }}>{p.imageUrl ? <a href={p.link} target="_blank" rel="noreferrer"><img src={p.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)', display: 'block', background: '#F3F5FA' }} /></a> : <div style={{ width: 52, height: 52, borderRadius: 8, background: '#F3F5FA' }} />}</td><td style={{ maxWidth: 360 }}><a href={p.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}><div className="cell-main" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.productTitle}</div></a><div className="cell-sub">{p.상품유형 ?? ''}{p.openDate ? ` · 등록 ${String(p.openDate).slice(0, 10)}` : ''}{p.진단 && p.진단 !== `${p.rank}위` ? ` · ${p.진단}` : ''}</div></td>
            <td>{p.mallName}</td><td className="num">{won(p.lowPrice)}</td><td className="num">{p.reviewCount.toLocaleString()}</td><td className="num">{p.keepCnt.toLocaleString()}</td><td className="num">{p.purchaseCnt ? p.purchaseCnt.toLocaleString() : '-'}</td>
            <td className="num"><Star v={p.hitStarScore} /></td><td className="num"><Star v={p.saleStarScore} /></td><td className="num"><Star v={p.qualityStarScore} /></td><td><Score v={p.종합점수 ?? 0} /></td>
          </tr>)}{products.length === 0 && <tr><td colSpan={12}><Empty>조건에 맞는 상품 없음</Empty></td></tr>}</tbody>
        </table></div>
      </Section>}

      {tab === 'report' && <div className="grid2">
        <Section title="순위를 가르는 요인" sub="상위 10 vs 11위 이하">{(s?.difficulty?.drivers ?? []).map((t: string, i: number) => <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line-soft)' : undefined, fontSize: 14 }}>{t}</div>)}</Section>
        <Section title="1등 분석">{f1 ? <div style={{ fontSize: 14, display: 'grid', gap: 6 }}><div style={{ fontWeight: 700 }}>{f1['1등제품']}</div><div className="cell-sub">종합 {f1['종합점수']} · 경쟁우위 {(f1['경쟁우위'] ?? []).join(', ')}</div>{(f1['주요이유'] ?? []).map((t: string, i: number) => <div key={i}>· {t}</div>)}{f1['상세분석']?.['약점']?.length ? <div className="cell-sub">약점: {f1['상세분석']['약점'].join(' / ')}</div> : null}</div> : <Empty>없음</Empty>}</Section>
        <Section title="기회 상품" sub="클릭·판매는 좋은데 노출이 낮은 상품">{(r.brief?.['기회상품'] ?? []).length ? (r.brief['기회상품'] as any[]).map((x, i) => <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line-soft)' : undefined, fontSize: 14 }}><div><b>{x.rank}위</b> {x.title}</div><div className="cell-sub">클릭 {x.hit} · 판매 {x.sale} · 종합 {x.score} — {x.why}</div></div>) : <Empty>없음</Empty>}</Section>
        <Section title="최근 진입 성공 · 빈 가격대">{(r.opportunities?.recent_winners ?? []).map((x: any, i: number) => <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line-soft)' : undefined, fontSize: 14 }}><div><b>{x.rank}위</b> {x.title}</div><div className="cell-sub">등록 {x.open_date} · 리뷰 {Number(x.reviews).toLocaleString()} · 찜 {Number(x.keep).toLocaleString()}</div></div>)}{(r.opportunities?.empty_bands ?? []).length ? <div className="cell-sub" style={{ marginTop: 8 }}>상위 10에 없는 가격대: {(r.opportunities.empty_bands as any[]).map(b => `${b.label} (전체 ${b.all}개)`).join(' · ')}</div> : null}{(r.trend ?? []).length ? <div className="cell-sub" style={{ marginTop: 4 }}>{r.trend.join(' · ')}</div> : null}</Section>
      </div>}
    </>}
  </>;
}
