'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { setResult, makeTrackLink, undoResult } from './actions';
import { nscSearch } from '../secret-index/actions';
import type { LeadIndex } from '@/lib/leadIndex';

export type Lead = { id: number; store_name: string; store_url: string; product_url?: string; keyword: string; category: string; phone: string; score: number; score_why: string; status: string; note: string; contact_round?: number; rank_now?: number | null; rank_prev?: number | null };
export type Hist = { round: number; status: string; note: string; at: string; who: string };
const ST: Record<string, string> = { called: '부재·연결 안 됨', interested: '관심', rejected: '거절', won: '계약', excluded: '제외' };
export type Prop = { code: string; lead_id: number | null; title: string; views: number; last_view_at: string | null };

const BTN: [string, string][] = [['called', '부재·연결 안 됨'], ['interested', '관심'], ['won', '계약'], ['rejected', '거절'], ['excluded', '대상 아님']];
const kst = (s: string | null) => s ? new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

export default function CallsClient({ rows, props, origin, history = {}, indexes = {} }: { rows: Lead[]; props: Prop[]; origin: string; history?: Record<number, Hist[]>; indexes?: Record<number, LeadIndex> }) {
  const r = useRouter(); const [busy, start] = useTransition();
  const [note, setNote] = useState<Record<number, string>>({}); const [url, setUrl] = useState<Record<number, string>>({}); const [linkFor, setLinkFor] = useState<number | null>(null);
  const byLead: Record<number, Prop[]> = {}; props.forEach(p => { if (p.lead_id) (byLead[p.lead_id] ??= []).push(p); });
  const copyLink = async (code: string) => { await navigator.clipboard.writeText(`${origin}/p/${code}`); notify('추적 링크 복사됨 — 고객에게 이 링크로 보내세요'); };

  return (
    <div className="tbl-wrap"><table>
      <thead><tr><th style={{ width: 36 }}>#</th><th>업체</th><th>연락처</th><th>왜 이 업체?</th><th>상품 지수</th><th>차수 · 지난 콜</th><th>결과 기록</th></tr></thead>
      <tbody>{rows.map((l, idx) => {
        const ps = byLead[l.id] ?? []; const seen = ps.reduce((a, p) => a + p.views, 0);
        return <tr key={l.id} style={{ verticalAlign: 'top', background: seen ? 'var(--wait-soft)' : undefined }}>
          <td className="num" style={{ color: 'var(--muted)' }}>{idx + 1}</td>
          <td style={{ minWidth: 190 }}>
            <div className="cell-main">{(l.product_url || l.store_url) ? <a href={(l.product_url || l.store_url).startsWith('http') ? (l.product_url || l.store_url) : `https://${l.product_url || l.store_url}`} target="_blank" rel="noreferrer">{l.store_name}</a> : l.store_name}</div>
            <div className="cell-sub">{[l.keyword, l.category].filter(Boolean).join(' · ')}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 12 }}>{l.product_url && <a href={l.product_url} target="_blank" rel="noreferrer">상품 열기 →</a>}{l.keyword && <a href={`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(l.keyword)}`} target="_blank" rel="noreferrer">‘{l.keyword}’ 검색 결과 →</a>}</div>
            {seen > 0 && <div style={{ fontWeight: 700, color: 'var(--wait-ink)', fontSize: 13, marginTop: 4 }}>🔥 제안서 {seen}회 열람 {kst(ps[0].last_view_at)}</div>}
          </td>
          <td style={{ minWidth: 120 }}>{l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : <span className="muted">-</span>}</td>
          <td style={{ minWidth: 200 }}>{l.rank_now != null && l.rank_prev != null && <div className="num" style={{ fontWeight: 800, fontSize: 15, color: l.rank_now > l.rank_prev ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>{l.rank_prev}위 → {l.rank_now >= 120 ? `${l.rank_now - 1}위 밖` : `${l.rank_now}위`}</div>}<div className="cell-sub">{l.score_why || '-'}</div><div className="cell-sub" title="광고 집행 30 · 순위 하락 25 · 리뷰 많은데 40위 밖 20 · 개설 6개월 이내 15 · 전화 있음 10 — 높을수록 먼저 배분">우선순위 {l.score}</div></td>
          <td style={{ minWidth: 170 }}>{(() => { const x = indexes[l.id]; if (!x) return <button type="button" className="btn ghost xs" disabled={busy || !l.keyword} title="시크릿 지수 조회 (하루 한도 차감, 같은 키워드는 24시간 캐시)" onClick={() => start(async () => { const r2 = await nscSearch(l.keyword); notify(r2.ok ? `‘${l.keyword}’ 지수 ${r2.msg}` : r2.msg, r2.ok ? 'ok' : 'bad'); if (r2.ok) r.refresh(); })}>지수 조회</button>;
            const S = ({ k, v }: { k: string; v: number }) => <span style={{ display: 'inline-block', marginRight: 6 }}><span className="cell-sub" style={{ display: 'inline' }}>{k}</span> <b className="num">{v}</b></span>;
            return <div style={{ fontSize: 13 }}>{x.total != null && <div><span className="cell-sub" style={{ display: 'inline' }}>종합</span> <b className="num" style={{ fontSize: 15 }}>{x.total}</b>{x.rank ? <span className="cell-sub" style={{ display: 'inline', marginLeft: 6 }}>지수 순위 {x.rank}</span> : null}</div>}<div><S k="클릭" v={x.hit} /><S k="판매" v={x.sale} /></div><div><S k="적합" v={x.quality} /><S k="리뷰" v={x.review} /><span className="cell-sub" style={{ display: 'inline' }}>({x.reviewCount.toLocaleString()}개)</span></div>{x.diag && <div className="cell-sub">{x.diag}</div>}<div className="cell-sub" style={{ fontSize: 11 }}>{x.matched === 'mall' ? '몰명 매칭 · ' : ''}{kst(x.fetched_at)}</div></div>; })()}</td>
          <td style={{ minWidth: 180 }}>{(l.contact_round ?? 0) > 0 ? <><div style={{ fontWeight: 800, color: 'var(--accent)' }}>{(l.contact_round ?? 0) + 1}차 콜</div>{(history[l.id] ?? []).slice(0, 3).map((h, i) => <div key={i} className="cell-sub" style={{ marginTop: 2 }}>{h.round}차 {ST[h.status] ?? h.status} · {h.who} · {kst(h.at)}{h.note ? <div style={{ color: 'var(--ink)' }}>“{h.note.slice(0, 60)}”</div> : null}</div>)}</> : <span style={{ fontWeight: 700 }}>1차 (첫 콜)</span>}</td>
          <td style={{ minWidth: 330 }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BTN.map(([k, label]) => <button key={k} className={'btn xs ' + (l.status === k ? '' : 'ghost')} disabled={busy}
                onClick={() => start(async () => { const x = await setResult(l.id, k, note[l.id] ?? l.note); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); })}>{label}</button>)}
            </div>
            {l.status !== 'assigned' && <div className="cell-sub" style={{ marginTop: 4 }}>오늘 다른 버튼을 누르면 차수 안 올라가고 결과만 바뀜 · <button type="button" className="help" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} disabled={busy} onClick={() => { if (confirm('오늘 남긴 결과를 지우고 미기록 상태로 되돌릴까요?')) start(async () => { const x = await undoResult(l.id); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); }); }}>↩ 되돌리기</button></div>}
            <input style={{ marginTop: 6, width: '100%' }} placeholder="메모 (통화 내용·다음 연락일)" defaultValue={l.note} onChange={e => setNote(s => ({ ...s, [l.id]: e.target.value }))} />
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {ps.map(p => <button key={p.code} className="btn ghost xs" onClick={() => copyLink(p.code)}>링크 복사 · {p.views}회</button>)}
              {linkFor === l.id ? <>
                <input style={{ flex: 1, minWidth: 180 }} placeholder="제안서 주소 https://…" value={url[l.id] ?? ''} onChange={e => setUrl(s => ({ ...s, [l.id]: e.target.value }))} />
                <button className="btn xs" disabled={busy} onClick={() => start(async () => { const x = await makeTrackLink(l.id, l.store_name, url[l.id] ?? ''); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok && x.code) { await copyLink(x.code); setLinkFor(null); r.refresh(); } })}>만들고 복사</button>
              </> : <button className="help" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => setLinkFor(l.id)}>+ 제안서 추적 링크</button>}
            </div>
          </td>
        </tr>;
      })}</tbody>
    </table></div>
  );
}
