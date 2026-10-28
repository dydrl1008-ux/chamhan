'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { setResult, makeTrackLink, undoResult, setNext } from './actions';
import { nscSearch } from '../secret-index/actions';
import { nameQuery, type LeadIndex } from '@/lib/leadIndex';

export type Lead = { id: number; store_name: string; store_url: string; product_url?: string; keyword: string; category: string; phone: string; score: number; score_why: string; status: string; note: string; contact_round?: number; rank_now?: number | null; rank_prev?: number | null; next_contact_on?: string | null };
export type Hist = { round: number; status: string; note: string; at: string; who: string };
/** 01012345678 → 010-1234-5678, 0212345678 → 02-1234-5678 */
const fmtPhone = (p: string) => { const d = (p ?? '').replace(/\D/g, ''); if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`; if (d.length === 10) return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; if (d.length === 9 && d.startsWith('02')) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`; return p; };
const ST: Record<string, string> = { called: '부재·연결 안 됨', interested: '관심', rejected: '거절', won: '계약', excluded: '제외' };
export type Prop = { code: string; lead_id: number | null; title: string; views: number; last_view_at: string | null };

const BTN: [string, string][] = [['called', '부재·연결 안 됨'], ['interested', '관심'], ['won', '계약'], ['rejected', '거절'], ['excluded', '대상 아님']];
const kst = (s: string | null) => s ? new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

export default function CallsClient({ rows, props, origin, history = {}, indexes = {} }: { rows: Lead[]; props: Prop[]; origin: string; history?: Record<number, Hist[]>; indexes?: Record<number, LeadIndex> }) {
  const r = useRouter(); const [busy, start] = useTransition();
  const [note, setNote] = useState<Record<number, string>>({}); const [nextD, setNextD] = useState<Record<number, string>>({}); const [askNext, setAskNext] = useState<number | null>(null);
  const todayS = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); const plusDays = (d: number) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10); const [url, setUrl] = useState<Record<number, string>>({}); const [linkFor, setLinkFor] = useState<number | null>(null);
  const byLead: Record<number, Prop[]> = {}; props.forEach(p => { if (p.lead_id) (byLead[p.lead_id] ??= []).push(p); });
  const copyLink = async (code: string) => { await navigator.clipboard.writeText(`${origin}/p/${code}`); notify('추적 링크 복사됨 — 고객에게 이 링크로 보내세요'); };

  return (
    <div className="tbl-wrap"><table>
      <thead><tr><th style={{ width: 36 }}>#</th><th>업체</th><th>연락처</th><th>왜 이 업체?</th><th>상품 지수</th><th>차수 · 지난 콜</th><th>결과 기록</th></tr></thead>
      <tbody>{rows.map((l, idx) => {
        const ps = byLead[l.id] ?? []; const seen = ps.reduce((a, p) => a + p.views, 0);
        const due = !!l.next_contact_on && l.next_contact_on <= todayS;
        return <tr key={l.id} style={{ verticalAlign: 'top', background: due ? 'var(--accent-soft)' : seen ? 'var(--wait-soft)' : undefined }}>
          <td className="num" style={{ color: 'var(--muted)' }}>{idx + 1}</td>
          <td style={{ minWidth: 190 }}>
            {due && <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: 12, marginBottom: 2 }}>📅 오늘 약속 팔로업</div>}
            <div className="cell-main">{(l.product_url || l.store_url) ? <a href={(l.product_url || l.store_url).startsWith('http') ? (l.product_url || l.store_url) : `https://${l.product_url || l.store_url}`} target="_blank" rel="noreferrer">{l.store_name}</a> : l.store_name}</div>
            <div className="cell-sub">{[l.keyword, l.category].filter(Boolean).join(' · ')}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 12 }}>{l.product_url && <a href={l.product_url} target="_blank" rel="noreferrer">상품 열기 →</a>}{l.keyword && <a href={`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(l.keyword)}`} target="_blank" rel="noreferrer">‘{l.keyword}’ 검색 결과 →</a>}</div>
            {seen > 0 && <div style={{ fontWeight: 700, color: 'var(--wait-ink)', fontSize: 13, marginTop: 4 }}>🔥 제안서 {seen}회 열람 {kst(ps[0].last_view_at)}</div>}
          </td>
          <td style={{ minWidth: 130, whiteSpace: 'nowrap' }}>{l.phone ? <a href={`tel:${l.phone.replace(/\D/g, '')}`} className="num" style={{ fontSize: 15 }}>{fmtPhone(l.phone)}</a> : <span className="muted">-</span>}</td>
          <td style={{ minWidth: 200 }}>{l.rank_now != null && l.rank_prev != null && <div className="num" style={{ fontWeight: 800, fontSize: 15, color: l.rank_now > l.rank_prev ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>{l.rank_prev}위 → {l.rank_now >= 120 ? `${l.rank_now - 1}위 밖` : `${l.rank_now}위`}</div>}<div className="cell-sub">{l.score_why || '-'}</div><div className="cell-sub" title="광고 집행 30 · 순위 하락 25 · 리뷰 많은데 40위 밖 20 · 개설 6개월 이내 15 · 전화 있음 10 — 높을수록 먼저 배분">우선순위 {l.score}</div></td>
          <td style={{ minWidth: 170 }}>{(() => { const x = indexes[l.id]; if (!x) { const qn = nameQuery(l.category || '') || l.keyword; return <button type="button" className="btn ghost xs" disabled={busy || !qn} title={`‘${qn}’ 로 시크릿 지수 조회 (상품명 검색이라 100위 밖도 잡힘 · 하루 한도 차감 · 24시간 캐시)`} onClick={() => start(async () => { const r2 = await nscSearch(qn); notify(r2.ok ? `‘${qn}’ 지수 ${r2.msg}` : r2.msg, r2.ok ? 'ok' : 'bad'); if (r2.ok) r.refresh(); })}>지수 조회</button>; }
            const S = ({ k, v }: { k: string; v: number }) => <span style={{ display: 'inline-block', marginRight: 6 }}><span className="cell-sub" style={{ display: 'inline' }}>{k}</span> <b className="num">{v}</b></span>;
            const byKw = x.by === 'keyword';
            return <div style={{ fontSize: 13 }}>{x.total != null && <div><span className="cell-sub" style={{ display: 'inline' }}>종합</span> <b className="num" style={{ fontSize: 15 }}>{x.total}</b>{byKw && x.rank ? <span className="cell-sub" style={{ display: 'inline', marginLeft: 6 }}>‘{l.keyword}’ 지수 {x.rank}위</span> : null}</div>}<div><S k="클릭" v={x.hit} /><S k="판매" v={x.sale} /></div><div><S k="적합" v={x.quality} /><S k="리뷰" v={x.review} /><span className="cell-sub" style={{ display: 'inline' }}>({x.reviewCount.toLocaleString()}개)</span></div>{byKw && x.diag && !/^\d+위$/.test(x.diag) && <div className="cell-sub">{x.diag}</div>}<div className="cell-sub" style={{ fontSize: 11 }}>별점 5점 만점 · {byKw ? '키워드 검색' : '상품명 검색'}{x.matched === 'mall' ? ' · 몰명 매칭' : ''} · {kst(x.fetched_at)}</div></div>; })()}</td>
          <td style={{ minWidth: 180 }}>{(l.contact_round ?? 0) > 0 ? <><div style={{ fontWeight: 800, color: 'var(--accent)' }}>{(l.contact_round ?? 0) + 1}차 콜</div>{(history[l.id] ?? []).slice(0, 3).map((h, i) => <div key={i} className="cell-sub" style={{ marginTop: 2 }}>{h.round}차 {ST[h.status] ?? h.status} · {h.who} · {kst(h.at)}{h.note ? <div style={{ color: 'var(--ink)' }}>“{h.note.slice(0, 60)}”</div> : null}</div>)}</> : <span style={{ fontWeight: 700 }}>1차 (첫 콜)</span>}</td>
          <td style={{ minWidth: 330 }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BTN.map(([k, label]) => <button key={k} className={'btn xs ' + (l.status === k ? '' : 'ghost')} disabled={busy}
                onClick={() => { if (k === 'interested') { setAskNext(l.id); setNextD(s => ({ ...s, [l.id]: s[l.id] ?? l.next_contact_on ?? plusDays(3) })); return; } start(async () => { const x = await setResult(l.id, k, note[l.id] ?? l.note); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); }); }}>{label}</button>)}
            </div>
            {askNext === l.id && <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, padding: '6px 8px', background: 'var(--wait-soft)', borderRadius: 8 }}><span className="cell-sub">다음 연락일</span><input type="date" min={todayS} value={nextD[l.id] ?? ''} onChange={e => setNextD(s => ({ ...s, [l.id]: e.target.value }))} style={{ padding: '3px 6px' }} />{[1, 3, 7].map(d => <button key={d} type="button" className="btn ghost xs" onClick={() => setNextD(s => ({ ...s, [l.id]: plusDays(d) }))}>+{d}일</button>)}{l.status === 'interested' && l.next_contact_on ? <button type="button" className="btn xs" disabled={busy} onClick={() => start(async () => { const x = await setNext(l.id, nextD[l.id] ?? ''); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setAskNext(null); r.refresh(); } })}>날짜 저장</button> : <button type="button" className="btn xs" disabled={busy} onClick={() => start(async () => { const x = await setResult(l.id, 'interested', note[l.id] ?? l.note, nextD[l.id]); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setAskNext(null); r.refresh(); } })}>관심 저장</button>}<button type="button" className="btn ghost xs" onClick={() => setAskNext(null)}>취소</button></div>}
            {l.next_contact_on && askNext !== l.id && <div className="cell-sub" style={{ marginTop: 4 }}>📅 다음 연락 <b style={{ color: l.next_contact_on <= todayS ? 'var(--bad-ink)' : undefined }}>{l.next_contact_on.slice(5).replace('-', '/')}</b>{l.next_contact_on <= todayS ? ' (오늘)' : ''} · <button type="button" className="help" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => { setAskNext(l.id); setNextD(s => ({ ...s, [l.id]: l.next_contact_on! })); }}>날짜 변경</button></div>}
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
