'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { setResult, makeTrackLink } from './actions';

export type Lead = { id: number; store_name: string; store_url: string; product_url?: string; keyword: string; category: string; phone: string; score: number; score_why: string; status: string; note: string; contact_round?: number; rank_now?: number | null; rank_prev?: number | null };
export type Hist = { round: number; status: string; note: string; at: string; who: string };
const ST: Record<string, string> = { called: '부재·연결 안 됨', interested: '관심', rejected: '거절', won: '계약', excluded: '제외' };
export type Prop = { code: string; lead_id: number | null; title: string; views: number; last_view_at: string | null };

const BTN: [string, string][] = [['called', '부재·연결 안 됨'], ['interested', '관심'], ['won', '계약'], ['rejected', '거절'], ['excluded', '대상 아님']];
const kst = (s: string | null) => s ? new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

export default function CallsClient({ rows, props, origin, history = {} }: { rows: Lead[]; props: Prop[]; origin: string; history?: Record<number, Hist[]> }) {
  const r = useRouter(); const [busy, start] = useTransition();
  const [note, setNote] = useState<Record<number, string>>({}); const [url, setUrl] = useState<Record<number, string>>({}); const [linkFor, setLinkFor] = useState<number | null>(null);
  const byLead: Record<number, Prop[]> = {}; props.forEach(p => { if (p.lead_id) (byLead[p.lead_id] ??= []).push(p); });
  const copyLink = async (code: string) => { await navigator.clipboard.writeText(`${origin}/p/${code}`); notify('추적 링크 복사됨 — 고객에게 이 링크로 보내세요'); };

  return (
    <div className="tbl-wrap"><table>
      <thead><tr><th>업체</th><th>연락처</th><th>왜 이 업체?</th><th>차수 · 지난 콜</th><th>결과 기록</th></tr></thead>
      <tbody>{rows.map(l => {
        const ps = byLead[l.id] ?? []; const seen = ps.reduce((a, p) => a + p.views, 0);
        return <tr key={l.id} style={{ verticalAlign: 'top', background: seen ? 'var(--wait-soft)' : undefined }}>
          <td style={{ minWidth: 190 }}>
            <div className="cell-main">{(l.product_url || l.store_url) ? <a href={(l.product_url || l.store_url).startsWith('http') ? (l.product_url || l.store_url) : `https://${l.product_url || l.store_url}`} target="_blank" rel="noreferrer">{l.store_name}</a> : l.store_name}</div>
            <div className="cell-sub">{[l.keyword, l.category].filter(Boolean).join(' · ')}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 12 }}>{l.product_url && <a href={l.product_url} target="_blank" rel="noreferrer">상품 열기 →</a>}{l.keyword && <a href={`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(l.keyword)}`} target="_blank" rel="noreferrer">‘{l.keyword}’ 검색 결과 →</a>}</div>
            {seen > 0 && <div style={{ fontWeight: 700, color: 'var(--wait-ink)', fontSize: 13, marginTop: 4 }}>🔥 제안서 {seen}회 열람 {kst(ps[0].last_view_at)}</div>}
          </td>
          <td style={{ minWidth: 120 }}>{l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : <span className="muted">-</span>}</td>
          <td style={{ minWidth: 200 }}><div className="num" style={{ fontWeight: 700 }}>{l.score}점{l.rank_now != null && l.rank_prev != null && <span style={{ marginLeft: 6, color: l.rank_now > l.rank_prev ? 'var(--bad-ink)' : 'var(--ok-ink)' }}>{l.rank_prev}→{l.rank_now >= 200 ? '미노출' : l.rank_now}</span>}</div><div className="cell-sub">{l.score_why || '-'}</div></td>
          <td style={{ minWidth: 180 }}>{(l.contact_round ?? 0) > 0 ? <><div style={{ fontWeight: 800, color: 'var(--accent)' }}>{(l.contact_round ?? 0) + 1}차 콜</div>{(history[l.id] ?? []).slice(0, 3).map((h, i) => <div key={i} className="cell-sub" style={{ marginTop: 2 }}>{h.round}차 {ST[h.status] ?? h.status} · {h.who} · {kst(h.at)}{h.note ? <div style={{ color: 'var(--ink)' }}>“{h.note.slice(0, 60)}”</div> : null}</div>)}</> : <span style={{ fontWeight: 700 }}>1차 (첫 콜)</span>}</td>
          <td style={{ minWidth: 330 }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BTN.map(([k, label]) => <button key={k} className={'btn xs ' + (l.status === k ? '' : 'ghost')} disabled={busy}
                onClick={() => start(async () => { const x = await setResult(l.id, k, note[l.id] ?? l.note); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); })}>{label}</button>)}
            </div>
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
