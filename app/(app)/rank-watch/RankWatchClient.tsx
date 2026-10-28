'use client';
// 순위 체크 — 업체 그룹별 접기, ★ 주요 업체 토글, 하락 빨강 · 상승 초록
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { PageHeader, Section, Empty, Status } from '@/components/ui';
import { fmtKST } from '@/lib/date/kst';
import { linkAccount, toggleGroupStar } from './actions';
import type { WatchRow } from '@/lib/ykreward';

type Props = { me: { id: string; name: string; role: string }; myLink: string; people: { user_id: string; login: string; name: string }[]; sel: string; rows: WatchRow[]; stars: string[]; err: string };

export default function RankWatchClient({ me, myLink, people, sel, rows, stars, err }: Props) {
  const r = useRouter(); const [login, setLogin] = useState(myLink); const [busy, setBusy] = useState(false); const [filter, setFilter] = useState<'all' | 'down' | 'up' | 'star'>('all'); const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isMe = sel === me.id;
  const link = async () => { setBusy(true); const x = await linkAccount(login); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const star = async (g: string, on: boolean) => { const x = await toggleGroupStar(g, on); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const delta = (w: WatchRow) => w.cur_rank != null && w.prev_rank != null ? w.prev_rank - w.cur_rank : null;   // + = 상승
  const isDown = (w: WatchRow) => (w.cur_rank == null && w.prev_rank != null) || (delta(w) ?? 0) < 0;
  const isUp = (w: WatchRow) => (w.cur_rank != null && w.prev_rank == null) || (delta(w) ?? 0) > 0;
  const groups = useMemo(() => {
    const k = q.trim().toLowerCase(); const m = new Map<string, WatchRow[]>();
    for (const w of rows) { if (k && !(`${w.group} ${w.keyword} ${w.store ?? ''} ${w.title ?? ''}`.toLowerCase().includes(k))) continue; if (filter === 'down' && !isDown(w)) continue; if (filter === 'up' && !isUp(w)) continue; if (filter === 'star' && !stars.includes(w.group)) continue; (m.get(w.group) ?? m.set(w.group, []).get(w.group)!).push(w); }
    return [...m.entries()];
  }, [rows, q, filter, stars]);
  const nDown = rows.filter(isDown).length, nUp = rows.filter(isUp).length, nNone = rows.filter(w => w.cur_rank == null).length;
  const cell = (w: WatchRow) => { const d = delta(w); const cur = w.cur_rank; return <span className="num"><b style={{ fontSize: 16, color: cur == null ? 'var(--bad-ink)' : undefined }}>{cur ?? '미노출'}</b>{d != null && d !== 0 && <span style={{ marginLeft: 6, fontWeight: 700, color: d > 0 ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>}{cur == null && w.prev_rank != null && <span style={{ marginLeft: 6, color: 'var(--bad-ink)', fontWeight: 700 }}>▼ 전 {w.prev_rank}</span>}{cur != null && w.prev_rank == null && <span style={{ marginLeft: 6, color: 'var(--ok-ink)', fontWeight: 700 }}>▲ 진입</span>}</span>; };
  const setAll = (v: boolean) => setOpen(Object.fromEntries(groups.map(([g]) => [g, v])));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <PageHeader title="순위 체크" desc="ykreward 순위 체크 중 내 계정 담당 건. ★ 주요 업체로 표시한 업체만 순위 변동 시 알림(본인에게만)." badge={rows.length ? <span className="cell-sub">{rows.length}건 · <span style={{ color: 'var(--bad-ink)' }}>하락 {nDown}</span> · <span style={{ color: 'var(--ok-ink)' }}>상승 {nUp}</span> · 미노출 {nNone}</span> : null}
        actions={me.role !== 'staff' && people.length > 0 ? <select value={sel} onChange={e => r.push(`/rank-watch?u=${e.target.value}`)} style={{ padding: '6px 10px' }}>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.name} ({p.login})</option>)}</select> : undefined} />
      {err && <div className="err">ykreward 연결 오류: {err}</div>}
      <Section title="내 ykreward 계정" sub={myLink ? <>연결됨: <b>{myLink}</b> — 순위 체크에서 이 계정 담당으로 등록된 건이 아래에 나옵니다</> : '순위 체크 담당자로 쓰는 본인 ykreward 아이디를 연결하세요'}>
        <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}><input value={login} onChange={e => setLogin(e.target.value)} placeholder="ykreward 아이디" style={{ flex: 1, padding: '7px 10px' }} autoCapitalize="none" /><button type="button" className="btn" disabled={busy || !login.trim() || login.trim() === myLink} onClick={link}>{myLink ? '변경' : '연결'}</button></div>
      </Section>
      {!myLink && isMe && <div className="card"><Empty>계정을 연결하면 순위가 여기 뜹니다</Empty></div>}
      {(myLink || !isMe) && <Section title={isMe ? '내 순위 체크' : `${people.find(p => p.user_id === sel)?.name ?? ''} 순위 체크`} right={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="업체 · 키워드 검색" style={{ padding: '5px 10px', width: 180 }} />
        {(['all', 'down', 'up', 'star'] as const).map(k => <button key={k} type="button" className={`btn ${filter === k ? '' : 'ghost'}`} style={{ padding: '4px 10px' }} onClick={() => setFilter(k)}>{k === 'all' ? '전체' : k === 'down' ? `하락 ${nDown}` : k === 'up' ? `상승 ${nUp}` : `★ 주요`}</button>)}
        <button type="button" className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => setAll(true)}>모두 펼침</button><button type="button" className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => setAll(false)}>모두 접기</button></span>} flush>
        {groups.length === 0 && <div style={{ padding: 16 }}><Empty>{rows.length ? '조건에 맞는 항목 없음' : '이 계정 담당으로 등록된 순위 체크 항목이 없습니다 (ykreward 순위 체크에서 담당자 확인)'}</Empty></div>}
        {groups.map(([g, list]) => { const isOpen = open[g] ?? (filter !== 'all' || groups.length <= 3); const gd = list.filter(isDown).length, gu = list.filter(isUp).length; const st = stars.includes(g);
          return <div key={g} style={{ borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: 'var(--bg)' }}>
              {isMe ? <button type="button" title={st ? '주요 해제' : '주요 업체로 — 변동 알림'} onClick={() => star(g, !st)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: st ? '#F5A524' : 'var(--line)' }}>★</button> : <span style={{ fontSize: 20, color: st ? '#F5A524' : 'var(--line)' }}>★</span>}
              <button type="button" onClick={() => setOpen({ ...open, [g]: !isOpen })} style={{ border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', flex: 1, display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><b>{g}</b><span className="cell-sub" style={{ display: 'inline' }}>{list.length}건</span>{gd > 0 && <Status kind="bad">하락 {gd}</Status>}{gu > 0 && <Status kind="ok">상승 {gu}</Status>}<span className="cell-sub" style={{ marginLeft: 'auto' }}>{isOpen ? '▲' : '▼'}</span></button>
            </div>
            {isOpen && <table><thead><tr><th>상품</th><th>키워드</th><th className="num">순위</th><th>수집</th><th>메모</th></tr></thead><tbody>
              {list.map(w => <tr key={w.id} style={{ background: isDown(w) ? 'var(--bad-soft)' : undefined }}><td><div style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url ? <a href={w.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{w.title ?? w.url}</a> : (w.title ?? '-')}</div><div className="cell-sub">{w.store ?? ''}</div></td><td><b>{w.keyword}</b></td><td style={{ textAlign: 'right' }}>{cell(w)}</td><td className="cell-sub num">{w.cur_at ? fmtKST(w.cur_at) : '-'}</td><td className="cell-sub">{w.memo ?? ''}</td></tr>)}
            </tbody></table>}
          </div>; })}
      </Section>}
    </div>
  );
}
