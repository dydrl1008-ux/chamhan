'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { PageHeader, Section, Empty, Status } from '@/components/ui';
import { fmtKST } from '@/lib/date/kst';
import { matchMission, matchMany, watchMission } from './actions';
type Row = { id: number; app: string; keyword: string; product: string; kind: string; points: string; first_seen: string; last_seen: string; seen_cnt: number; matched_at: string | null; mall_name: string; product_title: string; product_url: string; rank_first: number | null; rank_now: number | null; rank_at: string | null; match_score: number | null; note: string; in_mail: boolean; lead_status: string | null };
const KIND: Record<string, string> = { nshop: '네이버쇼핑', place: '플레이스', coupang: '쿠팡' };
const APP: Record<string, string> = { 'com.cashpanda': '캐시플랜' };
const LS: Record<string, string> = { new: '콜 대기', assigned: '콜 배정', called: '부재', interested: '관심', rejected: '거절', won: '계약', excluded: '제외' };
export default function MissionsClient({ rows, kind, days, total, unmatched }: { rows: Row[]; kind: string; days: number; total: number; unmatched: number }) {
  const r = useRouter(); const [busy, setBusy] = useState<number | 'many' | null>(null); const [q, setQ] = useState('');
  const k = q.trim().toLowerCase();
  const list = rows.filter(x => !k || [x.keyword, x.product, x.mall_name, x.product_title].some(v => (v ?? '').toLowerCase().includes(k)));
  const tab = (v: string, l: string) => <a href={`/missions?kind=${v}&days=${days}`} className={`btn ${kind === v ? '' : 'ghost'}`} style={{ padding: '4px 12px' }}>{l}</a>;
  const dtab = (v: number) => <a href={`/missions?kind=${kind}&days=${v}`} className={`btn xs ${days === v ? '' : 'ghost'}`}>{v}일</a>;
  const act = async (id: number, fn: (id: number) => Promise<{ ok: boolean; msg: string }>) => { setBusy(id); const x = await fn(id); setBusy(null); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  return <div style={{ display: 'grid', gap: 14 }}>
    <PageHeader title="경쟁사 미션" desc={`미션 앱에서 돌아가는 리워드 미션 (키워드·상품) · 누적 ${total}건 · 쇼핑 미매칭 ${unmatched}건 · 매칭 = 시크릿 지수 상위 100개에서 상품 찾기(조회 한도 사용)`}
      actions={<span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{tab('nshop', '네이버쇼핑')}{tab('place', '플레이스')}{tab('coupang', '쿠팡')}{tab('all', '전체')}<span style={{ width: 8 }} />{dtab(7)}{dtab(14)}{dtab(30)}{dtab(90)}
        {kind === 'nshop' && unmatched > 0 && <button type="button" className="btn" disabled={busy === 'many'} onClick={async () => { setBusy('many'); const x = await matchMany(20); setBusy(null); notify(x.msg, x.ok ? 'ok' : 'bad'); r.refresh(); }}>{busy === 'many' ? '매칭 중…' : '미매칭 20개 매칭'}</button>}</span>} />
    <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}><input value={q} onChange={e => setQ(e.target.value)} placeholder="키워드·상품·스토어 검색" style={{ width: 300 }} /><span className="cell-sub">{list.length}/{rows.length} · 최근 {days}일 본 미션</span></div>
    <Section flush>
      {list.length === 0 ? <div style={{ padding: 16 }}><Empty>수집된 미션 없음 — 집컴/사무실 PC에서 mission_crawl.py --push</Empty></div> : <div className="tbl-wrap"><table><thead><tr><th>키워드</th><th>미션 상품 (앱 표기)</th>{kind !== 'place' && kind !== 'coupang' && <th>매칭 스토어 · 순위</th>}<th>처음</th><th>마지막</th><th className="num">본 횟수</th><th>우리 쪽</th><th></th></tr></thead><tbody>
        {list.map(x => <tr key={x.id} style={{ background: x.lead_status === 'won' ? 'var(--ok-soft)' : undefined }}>
          <td><b>{x.keyword}</b><div className="cell-sub">{KIND[x.kind] ?? x.kind} · {APP[x.app] ?? x.app}{x.points ? ` · ${x.points}` : ''}</div></td>
          <td style={{ maxWidth: 320, fontSize: 12.5 }}>{x.product || <span className="cell-sub">-</span>}</td>
          {kind !== 'place' && kind !== 'coupang' && <td>{x.kind !== 'nshop' ? <span className="cell-sub">-</span> : x.mall_name ? <><b>{x.mall_name}</b> <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{x.rank_now}위</span>{x.rank_first && x.rank_first !== x.rank_now && <span className="cell-sub"> (처음 {x.rank_first}위)</span>}<div className="cell-sub" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.product_url ? <a href={x.product_url} target="_blank" rel="noreferrer">{x.product_title}</a> : x.product_title}</div></> : x.matched_at ? <span className="cell-sub">{x.note || '못 찾음'}</span> : <span className="cell-sub">미매칭</span>}</td>}
          <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{fmtKST(x.first_seen)}</td><td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{fmtKST(x.last_seen)}</td><td className="num">{x.seen_cnt}</td>
          <td>{x.mall_name ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{x.lead_status && <Status kind={x.lead_status === 'won' ? 'ok' : x.lead_status === 'interested' ? 'wait' : 'off'}>콜 {LS[x.lead_status] ?? x.lead_status}</Status>}{x.in_mail && <Status kind="off">메일 대상</Status>}{!x.lead_status && !x.in_mail && <Status kind="bad">타사 리워드 · 미접촉</Status>}</span> : <span className="cell-sub">-</span>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{x.kind === 'nshop' && <button type="button" className="btn ghost xs" disabled={busy === x.id} onClick={() => act(x.id, matchMission)}>{busy === x.id ? '…' : x.matched_at ? '재매칭' : '매칭'}</button>}{x.product_url && <> <button type="button" className="btn ghost xs" disabled={busy === x.id} onClick={() => act(x.id, watchMission)}>순위 체크</button> <a href={`/mail?kw=${encodeURIComponent(x.keyword)}`} className="btn ghost xs">메일</a></>}</td>
        </tr>)}
      </tbody></table></div>}
    </Section>
  </div>;
}
