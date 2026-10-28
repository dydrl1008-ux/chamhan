'use client';
// 순위 체크 — 업체 그룹별 접기, ★ 주요 업체 토글, 하락 빨강 · 상승 초록
import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { PageHeader, Section, Empty, Status } from '@/components/ui';
import { fmtKST } from '@/lib/date/kst';
import { linkAccount, toggleGroupStar, recheck, addItems, moveGroup, removeItems, reorder, addGroup, removeGroup } from './actions';
import type { WatchRow, HistPt } from '@/lib/ykreward';

type Props = { me: { id: string; name: string; role: string }; myLink: string; people: { user_id: string; login: string; name: string }[]; sel: string; rows: WatchRow[]; hist: Record<string, HistPt[]>; stars: string[]; emptyGroups?: string[]; err: string };

export default function RankWatchClient({ me, myLink, people, sel, rows, hist, stars, emptyGroups = [], err }: Props) {
  const r = useRouter(); const [login, setLogin] = useState(myLink); const [busy, setBusy] = useState(false); const [filter, setFilter] = useState<'all' | 'down' | 'up' | 'star'>('all'); const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({}); const [detail, setDetail] = useState<string | null>(null);
  const isMe = sel === me.id;
  const link = async () => { setBusy(true); const x = await linkAccount(login); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const selLogin = people.find(p => p.user_id === sel)?.login ?? myLink; const canRe = isMe || me.role === 'admin' || me.role === 'head';
  const re = async (p: { ids?: string[]; group?: string }) => { if (busy) return; setBusy(true); const x = await recheck({ ...p, login: selLogin }); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const [drag, setDrag] = useState<{ kind: 'g' | 'i'; key: string; group?: string } | null>(null); const [over, setOver] = useState<string | null>(null);
  const [gOrder, setGOrder] = useState<string[] | null>(null); const [iOrder, setIOrder] = useState<Record<string, string[]>>({});
  const canDrag = isMe && filter === 'all' && !q.trim();
  const dropGroup = async (target: string) => { if (!drag || drag.kind !== 'g' || drag.key === target) return; const cur = (gOrder ?? groups.map(([g]) => g)).filter(g => g !== drag.key); cur.splice(cur.indexOf(target), 0, drag.key); setGOrder(cur); setDrag(null); setOver(null); const x = await reorder({ groups: cur }); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const dropItem = async (g: string, targetId: string, ids: string[]) => { if (!drag || drag.kind !== 'i' || drag.group !== g || drag.key === targetId) { setDrag(null); setOver(null); return; } const cur = ids.filter(i => i !== drag.key); cur.splice(cur.indexOf(targetId), 0, drag.key); setIOrder(o => ({ ...o, [g]: cur })); setDrag(null); setOver(null); const x = await reorder({ items: cur }); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const [addOpen, setAddOpen] = useState(false); const [mv, setMv] = useState<{ id: string; group: string } | null>(null);
  const groupNames = useMemo(() => [...new Set([...rows.map(w => w.group), ...emptyGroups])].filter(g => g !== '(미분류)').sort(), [rows, emptyGroups]);
  const [gOpen, setGOpen] = useState(false); const [gName, setGName] = useState(''); const [preGroup, setPreGroup] = useState('');
  const mkGroup = async () => { setBusy(true); const x = await addGroup(gName); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setGOpen(false); setPreGroup(gName.trim()); setGName(''); setAddOpen(true); r.refresh(); } };
  const add = async (fd: FormData) => { setBusy(true); const x = await addItems(fd); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad', 6000); if (x.ok) { setAddOpen(false); r.refresh(); } };
  const move = async (id: string, g: string) => { setBusy(true); const x = await moveGroup([id], g); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setMv(null); r.refresh(); } };
  const del = async (w: WatchRow) => { if (!confirm(`${w.keyword} (${w.store ?? ''}) 순위 체크에서 삭제할까요?`)) return; setBusy(true); const x = await removeItems([w.id]); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const star = async (g: string, on: boolean) => { const x = await toggleGroupStar(g, on); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); };
  const delta = (w: WatchRow) => w.cur_rank != null && w.prev_rank != null ? w.prev_rank - w.cur_rank : null;   // + = 상승
  const isDown = (w: WatchRow) => (w.cur_rank == null && w.prev_rank != null && !!w.cur_at) || (delta(w) ?? 0) < 0;
  const isUp = (w: WatchRow) => (w.cur_rank != null && w.prev_rank == null) || (delta(w) ?? 0) > 0;
  const groups = useMemo(() => {
    const k = q.trim().toLowerCase(); const m = new Map<string, WatchRow[]>();
    for (const w of rows) { if (k && !(`${w.group} ${w.keyword} ${w.store ?? ''} ${w.title ?? ''}`.toLowerCase().includes(k))) continue; if (filter === 'down' && !isDown(w)) continue; if (filter === 'up' && !isUp(w)) continue; if (filter === 'star' && !stars.includes(w.group)) continue; (m.get(w.group) ?? m.set(w.group, []).get(w.group)!).push(w); }
    if (!k && filter === 'all') for (const g of emptyGroups) if (!m.has(g)) m.set(g, []);
    return [...m.entries()];
  }, [rows, q, filter, stars, emptyGroups]);
  const groupsOrdered = useMemo(() => { const base = gOrder ? [...groups].sort((a, b) => { const ia = gOrder.indexOf(a[0]), ib = gOrder.indexOf(b[0]); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); }) : groups; return base.map(([g, list]) => { const o = iOrder[g]; return [g, o ? [...list].sort((a, b) => { const ia = o.indexOf(a.id), ib = o.indexOf(b.id); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); }) : list] as [string, WatchRow[]]; }); }, [groups, gOrder, iOrder]);
  const nDown = rows.filter(isDown).length, nUp = rows.filter(isUp).length, nNone = rows.filter(w => w.cur_rank == null && !!w.cur_at).length;
  const cell = (w: WatchRow) => { const d = delta(w); const cur = w.cur_rank; if (cur == null && !w.cur_at) return <span className="cell-sub">수집 전</span>; return <span className="num"><b style={{ fontSize: 16, color: cur == null ? 'var(--bad-ink)' : undefined }}>{cur ?? '미노출'}</b>{d != null && d !== 0 && <span style={{ marginLeft: 6, fontWeight: 700, color: d > 0 ? 'var(--ok-ink)' : 'var(--bad-ink)' }}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>}{cur == null && w.prev_rank != null && <span style={{ marginLeft: 6, color: 'var(--bad-ink)', fontWeight: 700 }}>▼ 전 {w.prev_rank}</span>}{cur != null && w.prev_rank == null && <span style={{ marginLeft: 6, color: 'var(--ok-ink)', fontWeight: 700 }}>▲ 진입</span>}</span>; };
  const setAll = (v: boolean) => setOpen(Object.fromEntries(groups.map(([g]) => [g, v])));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <datalist id="rw-groups">{groupNames.map(g => <option key={g} value={g} />)}</datalist>
      <PageHeader title="순위 체크" desc="ykreward 순위 체크 중 내 계정 담당 건. ★ 주요 업체만 순위 변동 알림(본인에게만). 업체 줄·상품 줄을 끌어서 순서 변경 (전체 보기·검색 없을 때)." badge={rows.length ? <span className="cell-sub">{rows.length}건 · <span style={{ color: 'var(--bad-ink)' }}>하락 {nDown}</span> · <span style={{ color: 'var(--ok-ink)' }}>상승 {nUp}</span> · 미노출 {nNone}</span> : null}
        actions={me.role !== 'staff' && people.length > 0 ? <select value={sel} onChange={e => r.push(`/rank-watch?u=${e.target.value}`)} style={{ padding: '6px 10px' }}>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.name} ({p.login})</option>)}</select> : undefined} />
      {err && <div className="err">ykreward 연결 오류: {err}</div>}
      <Section title="내 ykreward 계정" sub={myLink ? <>연결됨: <b>{myLink}</b> — 순위 체크에서 이 계정 담당으로 등록된 건이 아래에 나옵니다</> : '순위 체크 담당자로 쓰는 본인 ykreward 아이디를 연결하세요'}>
        <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}><input value={login} onChange={e => setLogin(e.target.value)} placeholder="ykreward 아이디" style={{ flex: 1, padding: '7px 10px' }} autoCapitalize="none" /><button type="button" className="btn" disabled={busy || !login.trim() || login.trim() === myLink} onClick={link}>{myLink ? '변경' : '연결'}</button></div>
      </Section>
      {myLink && isMe && <Section title="등록" right={<span style={{ display: 'inline-flex', gap: 6 }}><button type="button" className="btn ghost" onClick={() => setGOpen(v => !v)}>{gOpen ? '닫기' : '+ 업체 추가'}</button><button type="button" className="btn ghost" onClick={() => setAddOpen(v => !v)}>{addOpen ? '닫기' : '+ 상품·키워드 등록'}</button></span>} sub="내 계정 담당으로 등록 — 업체(그룹) 고르거나 새로 입력, 키워드는 쉼표나 줄바꿈으로 여러 개">
        {gOpen && <form onSubmit={e => { e.preventDefault(); mkGroup(); }} style={{ display: 'flex', gap: 8, marginBottom: 10 }}><input value={gName} onChange={e => setGName(e.target.value)} placeholder="업체명 (예: 올포홈)" style={{ padding: '7px 10px', width: 260 }} autoFocus /><button type="submit" className="btn" disabled={busy || !gName.trim()}>업체 추가</button><span className="cell-sub" style={{ alignSelf: 'center' }}>추가하면 바로 그 업체로 상품 등록 칸이 열림</span></form>}
        {addOpen && <form onSubmit={e => { e.preventDefault(); add(new FormData(e.currentTarget)); }} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}><span className="cell-sub">업체 (그룹)</span><input name="group" list="rw-groups" placeholder="예: 올포홈" defaultValue={preGroup} key={preGroup} style={{ padding: '7px 10px' }} /></label>
          <label style={{ display: 'grid', gap: 4 }}><span className="cell-sub">상품 URL</span><input name="url" required placeholder="https://smartstore.naver.com/스토어/products/숫자 (브랜드스토어도 됨)" style={{ padding: '7px 10px' }} /></label>
          <label style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}><span className="cell-sub">키워드 (여러 개)</span><textarea name="keywords" required rows={2} placeholder="어린이집네임택, 네임스티커, 이름표" style={{ padding: '7px 10px' }} /></label>
          <label style={{ display: 'grid', gap: 4 }}><span className="cell-sub">메모 (선택)</span><input name="memo" placeholder="리워드 11월 · 담당 OO" style={{ padding: '7px 10px' }} /></label>
          <div style={{ alignSelf: 'end' }}><button type="submit" className="btn" disabled={busy}>등록</button> <span className="cell-sub" style={{ marginLeft: 8 }}>가격비교(카탈로그) 상품은 ykreward 에서</span></div>
        </form>}
      </Section>}
      {!myLink && isMe && <div className="card"><Empty>계정을 연결하면 순위가 여기 뜹니다</Empty></div>}
      {(myLink || !isMe) && <Section title={isMe ? '내 순위 체크' : `${people.find(p => p.user_id === sel)?.name ?? ''} 순위 체크`} right={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="업체 · 키워드 검색" style={{ padding: '5px 10px', width: 180 }} />
        {(['all', 'down', 'up', 'star'] as const).map(k => <button key={k} type="button" className={`btn ${filter === k ? '' : 'ghost'}`} style={{ padding: '4px 10px' }} onClick={() => setFilter(k)}>{k === 'all' ? '전체' : k === 'down' ? `하락 ${nDown}` : k === 'up' ? `상승 ${nUp}` : `★ 주요`}</button>)}
        {canRe && nDown > 0 && <button type="button" className="btn" style={{ padding: '4px 10px', background: 'var(--bad)' }} disabled={busy} onClick={() => re({ ids: rows.filter(isDown).map(w => w.id) })}>하락 {nDown}건 재체크</button>}<button type="button" className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => setAll(true)}>모두 펼침</button><button type="button" className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => setAll(false)}>모두 접기</button></span>} flush>
        {groups.length === 0 && <div style={{ padding: 16 }}><Empty>{rows.length ? '조건에 맞는 항목 없음' : '이 계정 담당으로 등록된 순위 체크 항목이 없습니다 (ykreward 순위 체크에서 담당자 확인)'}</Empty></div>}
        {groupsOrdered.map(([g, list]) => { const isOpen = open[g] ?? (filter !== 'all' || groups.length <= 3); const gd = list.filter(isDown).length, gu = list.filter(isUp).length; const st = stars.includes(g);
          return <div key={g} style={{ borderTop: '1px solid var(--line)' }}>
            <div draggable={canDrag} onDragStart={() => setDrag({ kind: 'g', key: g })} onDragOver={e => { if (drag?.kind === 'g') { e.preventDefault(); setOver('g:' + g); } }} onDragLeave={() => setOver(null)} onDrop={() => dropGroup(g)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: 'var(--bg)', opacity: drag?.kind === 'g' && drag.key === g ? .4 : 1, outline: over === 'g:' + g ? '2px solid var(--accent)' : undefined, cursor: canDrag ? 'grab' : undefined }}>
              {canDrag && <span title="끌어서 업체 순서 변경" style={{ color: 'var(--muted)' }}>⋮⋮</span>}
              {isMe ? <button type="button" title={st ? '주요 해제' : '주요 업체로 — 변동 알림'} onClick={() => star(g, !st)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: st ? '#F5A524' : 'var(--line)' }}>★</button> : <span style={{ fontSize: 20, color: st ? '#F5A524' : 'var(--line)' }}>★</span>}
              <button type="button" onClick={() => setOpen({ ...open, [g]: !isOpen })} style={{ border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', flex: 1, display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><b>{g}</b><span className="cell-sub" style={{ display: 'inline' }}>{list.length}건</span>{gd > 0 && <Status kind="bad">하락 {gd}</Status>}{gu > 0 && <Status kind="ok">상승 {gu}</Status>}<span className="cell-sub" style={{ marginLeft: 'auto' }}>{isOpen ? '▲' : '▼'}</span></button>{canRe && <button type="button" className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }} disabled={busy} onClick={() => re({ group: g })}>업체 재체크</button>}{list.length > 0 && <a className="btn ghost" href={`/rank-watch/report?u=${sel}&g=${encodeURIComponent(g)}`} title="고객용 순위 리포트 (PNG/PDF)" style={{ padding: '3px 10px', fontSize: 12 }} onClick={e => e.stopPropagation()}>리포트</a>}
            </div>
            {isOpen && list.length === 0 && <div style={{ padding: '10px 18px', display: 'flex', gap: 8, alignItems: 'center' }}><span className="cell-sub">아직 상품 없음</span>{isMe && <><button type="button" className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => { setPreGroup(g); setAddOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>이 업체에 상품 등록</button><button type="button" className="btn ghost" style={{ padding: '3px 10px', fontSize: 12, color: 'var(--bad-ink)' }} onClick={async () => { if (!confirm(`${g} 업체를 지울까요?`)) return; const x = await removeGroup(g); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); }}>업체 삭제</button></>}</div>}
            {isOpen && list.length > 0 && <table><thead><tr><th style={{ width: 52 }}>{canDrag ? <span className="cell-sub" title="줄을 끌어서 순서 변경">⋮⋮</span> : ''}</th><th>상품</th><th>키워드</th><th className="num">순위</th><th>30일 추이</th><th>수집</th><th>메모</th><th></th></tr></thead><tbody>
              {list.map(w => <Fragment key={w.id}><tr draggable={canDrag} onDragStart={e => { e.stopPropagation(); setDrag({ kind: 'i', key: w.id, group: g }); }} onDragOver={e => { if (drag?.kind === 'i' && drag.group === g) { e.preventDefault(); setOver('i:' + w.id); } }} onDragLeave={() => setOver(null)} onDrop={() => dropItem(g, w.id, list.map(x => x.id))} style={{ background: isDown(w) ? 'var(--bad-soft)' : undefined, cursor: canDrag ? 'grab' : 'pointer', opacity: drag?.kind === 'i' && drag.key === w.id ? .4 : 1, outline: over === 'i:' + w.id ? '2px solid var(--accent)' : undefined }} onClick={() => setDetail(detail === w.id ? null : w.id)}><td>{w.image_url ? <img src={w.image_url} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: 'cover', display: 'block', border: '1px solid var(--line)' }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--bg)' }} />}</td><td><div style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url ? <a href={w.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }} onClick={e => e.stopPropagation()}>{w.title ?? w.url}</a> : (w.title ?? '-')}</div><div className="cell-sub">{w.store ?? ''}</div></td><td><b>{w.keyword}</b></td><td style={{ textAlign: 'right' }}>{cell(w)}</td><td><Spark pts={hist[w.id] ?? []} /></td><td className="cell-sub num">{w.cur_at ? fmtKST(w.cur_at) : '-'}</td><td className="cell-sub">{w.memo ?? ''}</td><td style={{ whiteSpace: 'nowrap' }}>{w.q_status === 'pending' || w.q_status === 'running' ? <Status kind="wait">{w.q_status === 'running' ? '수집 중' : '대기 중'}</Status> : w.q_status === 'error' ? <Status kind="bad">오류</Status> : null}{canRe && <button type="button" className="btn ghost" style={{ padding: '2px 8px', fontSize: 12, marginLeft: 4 }} disabled={busy} onClick={e => { e.stopPropagation(); re({ ids: [w.id] }); }}>재체크</button>}{isMe && <><button type="button" className="btn ghost" style={{ padding: '2px 8px', fontSize: 12, marginLeft: 4 }} onClick={e => { e.stopPropagation(); setMv(mv?.id === w.id ? null : { id: w.id, group: w.group === '(미분류)' ? '' : w.group }); }}>업체 이동</button><button type="button" className="btn ghost" style={{ padding: '2px 8px', fontSize: 12, marginLeft: 4, color: 'var(--bad-ink)' }} onClick={e => { e.stopPropagation(); del(w); }}>삭제</button></>}{mv?.id === w.id && <form onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); move(w.id, mv.group); }} style={{ display: 'flex', gap: 4, marginTop: 4 }}><input list="rw-groups" value={mv.group} onChange={e => setMv({ id: w.id, group: e.target.value })} placeholder="업체명 (비우면 미분류)" style={{ padding: '3px 8px', width: 140 }} /><button type="submit" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} disabled={busy}>이동</button></form>}</td></tr>{detail === w.id && <tr key={w.id + '-d'}><td colSpan={8} style={{ background: 'var(--bg)', padding: '12px 18px' }}><History pts={hist[w.id] ?? []} w={w} /></td></tr>}</Fragment>)}
            </tbody></table>}
          </div>; })}
      </Section>}
    </div>
  );
}

/** 미니 추이: 왼쪽 과거 → 오른쪽 최근. 위가 1위. 미노출은 바닥에 빨간 점 */
function Spark({ pts }: { pts: HistPt[] }) {
  if (pts.length < 2) return <span className="cell-sub">-</span>;
  const W = 120, H = 32, vals = pts.map(p => p.r).filter((r): r is number => r != null); const max = Math.max(...vals, 1), min = Math.min(...vals, max);
  const y = (r: number | null) => r == null ? H - 2 : 3 + (max === min ? (H - 6) / 2 : ((r - min) / (max - min)) * (H - 6));
  const x = (i: number) => (i / (pts.length - 1)) * (W - 4) + 2;
  const d = pts.map((p, i) => `${i === 0 || pts[i - 1].r == null || p.r == null ? 'M' : 'L'}${x(i)},${y(p.r)}`).join(' ');
  const last = pts.at(-1)!, first = pts.find(p => p.r != null); const up = last.r != null && first?.r != null && last.r < first.r;
  return <svg width={W} height={H} style={{ display: 'block' }}><path d={d} fill="none" stroke={up ? 'var(--ok)' : 'var(--bad)'} strokeWidth={1.5} />{pts.map((p, i) => p.r == null ? <circle key={i} cx={x(i)} cy={H - 2} r={2} fill="var(--bad)" /> : null)}<circle cx={x(pts.length - 1)} cy={y(last.r)} r={2.5} fill={up ? 'var(--ok)' : 'var(--bad)'} /></svg>;
}
/** 펼친 상세: 큰 차트(마우스 따라 순위 표시) + 날짜별 순위 */
function History({ pts, w }: { pts: HistPt[]; w: WatchRow }) {
  const [hi, setHi] = useState<number | null>(null);
  if (!pts.length) return <Empty>최근 30일 수집 기록 없음</Empty>;
  const W = 720, H = 150, vals = pts.map(p => p.r).filter((r): r is number => r != null); const max = Math.max(...vals, 1), min = Math.min(...vals, max);
  const y = (r: number | null) => r == null ? H - 10 : 14 + (max === min ? (H - 40) / 2 : ((r - min) / (max - min)) * (H - 40));
  const x = (i: number) => 40 + (i / Math.max(1, pts.length - 1)) * (W - 60);
  const d = pts.map((p, i) => `${i === 0 || pts[i - 1].r == null || p.r == null ? 'M' : 'L'}${x(i)},${y(p.r)}`).join(' ');
  const best = Math.min(...vals), worst = Math.max(...vals);
  const byDay = new Map<string, HistPt>(); for (const p of pts) byDay.set(p.t.slice(0, 10), p);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => { const b = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - b.left) / b.width * W; let best = 0, bd = 1e9; pts.forEach((_, i) => { const dd = Math.abs(x(i) - px); if (dd < bd) { bd = dd; best = i; } }); setHi(best); };
  const hp = hi != null ? pts[hi] : null;
  return <div style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>{w.image_url && <img src={w.image_url} alt="" width={64} height={64} style={{ borderRadius: 10, objectFit: 'cover', border: '1px solid var(--line)' }} />}<div><b>{w.title ?? w.keyword}</b><div className="cell-sub">{w.store ?? ''} · {w.keyword} · MID {w.mid ?? '-'}{w.url && <> · <a href={w.url} target="_blank" rel="noreferrer">상품 열기</a></>}</div></div><div className="cell-sub" style={{ marginLeft: 'auto' }}>30일 최고 <b style={{ color: 'var(--ok-ink)' }}>{best}</b> · 최저 <b style={{ color: 'var(--bad-ink)' }}>{worst}</b> · 수집 {pts.length}회</div></div>
    <div style={{ position: 'relative', maxWidth: W }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: '#fff', border: '1px solid var(--line)', borderRadius: 10, cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <text x={4} y={18} fontSize={10} fill="var(--muted)">{min}위</text><text x={4} y={H - 24} fontSize={10} fill="var(--muted)">{max}위</text>
        <line x1={40} x2={W - 20} y1={H - 10} y2={H - 10} stroke="var(--line)" strokeDasharray="3 3" /><text x={4} y={H - 6} fontSize={10} fill="var(--bad-ink)">미노출</text>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.r)} r={hi === i ? 5 : 2.5} fill={p.r == null ? 'var(--bad)' : 'var(--accent)'} />)}
        {hp && hi != null && <line x1={x(hi)} x2={x(hi)} y1={8} y2={H - 10} stroke="var(--muted)" strokeDasharray="2 2" />}
      </svg>
      {hp && hi != null && <div style={{ position: 'absolute', left: `${Math.min(88, x(hi) / W * 100)}%`, top: 6, transform: 'translateX(-50%)', background: '#111', color: '#fff', fontSize: 12, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{fmtKST(hp.t)} · <b style={{ fontSize: 14 }}>{hp.r == null ? '미노출' : `${hp.r}위`}</b></div>}
    </div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[...byDay.entries()].reverse().map(([d2, p]) => <span key={d2} className="num" style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: p.r == null ? 'var(--bad-soft)' : 'var(--bg)', color: p.r == null ? 'var(--bad-ink)' : undefined }}>{d2.slice(5).replace('-', '/')} <b>{p.r ?? '미노출'}</b></span>)}</div>
  </div>;
}
