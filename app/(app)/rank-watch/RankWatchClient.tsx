'use client';
// 순위 체크 — 요약 카드 · 알약 필터 · 업체 카드 안에 상품 줄 (★ 주요 업체, 끌어서 순서 변경, 줄을 누르면 30일 추이)
import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { Empty } from '@/components/ui';
import { fmtKST } from '@/lib/date/kst';
import { linkAccount, toggleGroupStar, recheck, addItems, moveGroup, removeItems, reorder, addGroup, removeGroup } from './actions';
import type { WatchRow, HistPt } from '@/lib/ykreward';

type Props = { me: { id: string; name: string; role: string }; myLink: string; people: { user_id: string; login: string; name: string }[]; sel: string; rows: WatchRow[]; hist: Record<string, HistPt[]>; stars: string[]; emptyGroups?: string[]; err: string };

export default function RankWatchClient({ me, myLink, people, sel, rows, hist, stars, emptyGroups = [], err }: Props) {
  const r = useRouter(); const [login, setLogin] = useState(myLink); const [busy, setBusy] = useState(false); const [filter, setFilter] = useState<'all' | 'down' | 'up' | 'star'>('all'); const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({}); const [detail, setDetail] = useState<string | null>(null);
  const [sort, setSort] = useState(''); const [acc, setAcc] = useState(false);
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

  // ── 화면 (요약 카드 → 검색·필터 알약 → 업체 카드 → 상품 줄) ──
  const ranked = rows.filter(w => w.cur_rank != null); const avg = ranked.length ? Math.round(ranked.reduce((a, w) => a + (w.cur_rank ?? 0), 0) / ranked.length * 10) / 10 : null;
  const ds = rows.map(delta).filter((d): d is number => d != null); const avgD = ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length * 10) / 10 : null;
  const lastAt = rows.map(w => w.cur_at).filter(Boolean).sort().at(-1) as string | undefined;
  const sortFn: Record<string, (a: WatchRow, b: WatchRow) => number> = { rank: (a, b) => (a.cur_rank ?? 999) - (b.cur_rank ?? 999), drop: (a, b) => (delta(a) ?? 0) - (delta(b) ?? 0), rise: (a, b) => (delta(b) ?? 0) - (delta(a) ?? 0), recent: (a, b) => String(b.cur_at ?? '').localeCompare(String(a.cur_at ?? '')) };
  const pill = (on: boolean, tone?: string) => ({ border: `1px solid ${on ? (tone ?? '#2563EB') : '#E4E7EC'}`, background: on ? (tone ?? '#2563EB') : '#fff', color: on ? '#fff' : '#344054', borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const });
  const mini = { border: '1px solid #E4E7EC', background: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#344054', whiteSpace: 'nowrap' as const };
  const Stat = ({ l, v, sub, color }: { l: string; v: React.ReactNode; sub: string; color?: string }) => <div style={{ border: '1px solid #E9EDF3', borderRadius: 14, padding: '14px 16px', background: '#fff', display: 'grid', gap: 6 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 13, color: '#475467', fontWeight: 600 }}>{l}</span><b style={{ fontSize: 22, color: color ?? '#101828', letterSpacing: '-0.02em' }}>{v}</b></div><span style={{ fontSize: 12, color: '#98A2B3' }}>{sub}</span></div>;
  const rankBox = (w: WatchRow) => { const d = delta(w); const cur = w.cur_rank; if (cur == null && !w.cur_at) return <span style={{ fontSize: 12.5, color: '#98A2B3' }}>조회 전</span>;
    return <div style={{ textAlign: 'right' }}><div style={{ fontSize: cur == null ? 15 : 24, fontWeight: 800, letterSpacing: '-0.02em', color: cur == null ? '#B42318' : cur <= 10 ? '#2563EB' : '#101828', lineHeight: 1.1 }}>{cur == null ? '100위 밖' : <>{cur}<span style={{ fontSize: 13, fontWeight: 700, marginLeft: 1 }}>위</span></>}</div>
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: d != null && d > 0 || (cur != null && w.prev_rank == null && !!w.trend && w.trend !== 'NEW') ? '#079455' : d != null && d < 0 || (cur == null && w.prev_rank != null) ? '#D92D20' : '#98A2B3' }}>{d != null && d !== 0 ? (d > 0 ? `▲ ${d}` : `▼ ${-d}`) : cur == null && w.prev_rank != null ? `▼ 이탈 (전 ${w.prev_rank}위)` : cur != null && w.prev_rank == null && w.trend === '진입' ? '▲ 진입' : '–'}</div></div>; };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <datalist id="rw-groups">{groupNames.map(g => <option key={g} value={g} />)}</datalist>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}><h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.02em' }}>순위 체크 <span style={{ fontSize: 14, color: '#98A2B3', fontWeight: 600 }}>{rows.length}개</span></h1>
          <div style={{ fontSize: 13, color: '#667085', marginTop: 4 }}>평일 10시·14시에 키워드별로 자동 조회 (상위 100위) · 「재체크」는 바로 조회 · ★ 주요 업체는 순위가 바뀌면 알림{lastAt ? ` · 마지막 조회 ${fmtKST(lastAt)}` : ''}</div></div>
        {me.role !== 'staff' && people.length > 0 && <select value={sel} onChange={e => r.push(`/rank-watch?u=${e.target.value}`)} style={{ width: 'auto', minHeight: 38, borderRadius: 10 }}>{people.map(p => <option key={p.user_id} value={p.user_id}>{p.name} ({p.login})</option>)}</select>}
        {myLink && isMe && <><button type="button" onClick={() => { setGOpen(v => !v); setAddOpen(false); }} style={{ ...mini, padding: '9px 16px', fontSize: 13.5, borderRadius: 10 }}>{gOpen ? '닫기' : '업체 추가'}</button>
          <button type="button" onClick={() => { setAddOpen(v => !v); setGOpen(false); }} style={{ border: 0, background: '#101828', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{addOpen ? '닫기' : '+ 상품 추가'}</button></>}
      </div>
      {err && <div className="err">순위 체크 목록을 읽지 못했습니다: {err}</div>}
      {isMe && (!myLink || acc) && <div style={{ border: '1px solid #E9EDF3', borderRadius: 14, padding: '14px 16px', background: '#F8FAFF', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13.5 }}>{myLink ? '담당 계정 변경' : '먼저 담당 계정(ykreward 아이디)을 연결하세요'}</b>
        <input value={login} onChange={e => setLogin(e.target.value)} placeholder="ykreward 아이디" style={{ width: 220, minHeight: 38 }} autoCapitalize="none" /><button type="button" className="btn" disabled={busy || !login.trim() || login.trim() === myLink} onClick={link}>{myLink ? '변경' : '연결'}</button>
        <span style={{ fontSize: 12, color: '#98A2B3' }}>이 계정 담당으로 등록된 상품이 아래에 나옵니다</span></div>}
      {gOpen && <form onSubmit={e => { e.preventDefault(); mkGroup(); }} style={{ border: '1px solid #E9EDF3', borderRadius: 14, padding: 16, background: '#fff', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ fontSize: 13.5 }}>업체 추가</b><input value={gName} onChange={e => setGName(e.target.value)} placeholder="업체명 (예: 올포홈)" style={{ width: 260, minHeight: 38 }} autoFocus /><button type="submit" className="btn" disabled={busy || !gName.trim()}>추가</button><span style={{ fontSize: 12, color: '#98A2B3' }}>추가하면 바로 그 업체로 상품 등록 칸이 열립니다</span></form>}
      {addOpen && <form onSubmit={e => { e.preventDefault(); add(new FormData(e.currentTarget)); }} style={{ border: '1px solid #E9EDF3', borderRadius: 14, padding: 16, background: '#fff', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: '#475467', fontWeight: 600 }}>업체 (그룹)</span><input name="group" list="rw-groups" placeholder="예: 올포홈" defaultValue={preGroup} key={preGroup} /></label>
        <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: '#475467', fontWeight: 600 }}>상품 URL</span><input name="url" required placeholder="https://smartstore.naver.com/스토어/products/숫자" /></label>
        <label style={{ display: 'grid', gap: 5, gridColumn: '1 / -1' }}><span style={{ fontSize: 12.5, color: '#475467', fontWeight: 600 }}>키워드 — 쉼표나 줄바꿈으로 여러 개</span><textarea name="keywords" required rows={2} placeholder="어린이집네임택, 네임스티커, 이름표" /></label>
        <label style={{ display: 'grid', gap: 5 }}><span style={{ fontSize: 12.5, color: '#475467', fontWeight: 600 }}>메모 (선택)</span><input name="memo" placeholder="리워드 11월 · 담당 OO" /></label>
        <div style={{ alignSelf: 'end', display: 'flex', gap: 10, alignItems: 'center' }}><button type="submit" disabled={busy} style={{ border: 0, background: '#101828', color: '#fff', borderRadius: 10, padding: '11px 22px', fontWeight: 700, cursor: 'pointer' }}>{busy ? '등록·조회 중…' : '등록'}</button><span style={{ fontSize: 12, color: '#98A2B3' }}>등록하면 첫 순위를 바로 조회합니다</span></div>
      </form>}
      {(myLink || !isMe) && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          <Stat l="모니터링 상품 수" v={rows.length} sub={`업체 ${new Set(rows.map(w => w.group)).size}곳 · 키워드 ${new Set(rows.map(w => w.keyword)).size}개`} />
          <Stat l="평균 순위" v={avg != null ? <>{avg}<span style={{ fontSize: 13 }}>위</span></> : '-'} sub="100위 안에 있는 항목 기준" color="#12B76A" />
          <Stat l="순위 평균 변동" v={avgD != null ? (avgD > 0 ? `▲ ${avgD}` : avgD < 0 ? `▼ ${-avgD}` : '0') : '-'} sub="직전 조회 대비" color={avgD != null && avgD > 0 ? '#079455' : avgD != null && avgD < 0 ? '#D92D20' : undefined} />
          <Stat l="변동 하락 상품" v={nDown} sub={`상승 ${nUp} · 100위 밖 ${nNone}`} color={nDown ? '#D92D20' : undefined} />
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="업체명, 상품명, 키워드로 검색" style={{ background: '#F2F4F7', border: '1px solid #EAECF0', borderRadius: 12, minHeight: 46 }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" style={pill(filter === 'all')} onClick={() => setFilter('all')}>전체 {rows.length}</button>
            <button type="button" style={pill(filter === 'down', '#D92D20')} onClick={() => setFilter('down')}>하락 {nDown}</button>
            <button type="button" style={pill(filter === 'up', '#079455')} onClick={() => setFilter('up')}>상승 {nUp}</button>
            <button type="button" style={pill(filter === 'star', '#F79009')} onClick={() => setFilter('star')}>★ 주요</button>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {canRe && nDown > 0 && <button type="button" style={{ ...mini, color: '#D92D20', borderColor: '#FDA29B' }} disabled={busy} onClick={() => re({ ids: rows.filter(isDown).map(w => w.id) })}>{busy ? '조회 중…' : `하락 ${nDown}건 재체크`}</button>}
              <button type="button" style={mini} onClick={() => setAll(true)}>모두 펼침</button><button type="button" style={mini} onClick={() => setAll(false)}>모두 접기</button>
              <select value={sort} onChange={e => setSort(e.target.value)} style={{ width: 'auto', minHeight: 32, fontSize: 12.5, borderRadius: 8, padding: '0 8px' }}><option value="">기본 순서</option><option value="rank">순위 높은 순</option><option value="drop">하락 큰 순</option><option value="rise">상승 큰 순</option><option value="recent">최근 조회 순</option></select>
              {isMe && myLink && <button type="button" style={mini} onClick={() => setAcc(v => !v)}>계정 {myLink}</button>}
            </span>
          </div>
        </div>
        {groups.length === 0 && <div style={{ border: '1px dashed #D0D5DD', borderRadius: 14, padding: '44px 16px', textAlign: 'center', color: '#667085' }}><div style={{ fontSize: 15, fontWeight: 600 }}>{rows.length ? '조건에 맞는 항목이 없습니다' : '아직 등록된 모니터링 상품이 없습니다'}</div>{!rows.length && <div style={{ fontSize: 13, color: '#98A2B3', marginTop: 6 }}>「+ 상품 추가」 버튼을 눌러 시작해 보세요</div>}</div>}
        {groupsOrdered.map(([g, list0]) => { const list = sort ? [...list0].sort(sortFn[sort]) : list0; const isOpen = open[g] ?? (filter !== 'all' || groups.length <= 3); const gd = list.filter(isDown).length, gu = list.filter(isUp).length; const st = stars.includes(g); const dragOk = canDrag && !sort;
          return <div key={g} style={{ border: '1px solid #E9EDF3', borderRadius: 16, background: '#fff', overflow: 'hidden', outline: over === 'g:' + g ? '2px solid #2563EB' : undefined, opacity: drag?.kind === 'g' && drag.key === g ? .4 : 1 }}>
            <div draggable={dragOk} onDragStart={() => setDrag({ kind: 'g', key: g })} onDragOver={e => { if (drag?.kind === 'g') { e.preventDefault(); setOver('g:' + g); } }} onDragLeave={() => setOver(null)} onDrop={() => dropGroup(g)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', cursor: dragOk ? 'grab' : undefined, flexWrap: 'wrap' }}>
              {isMe ? <button type="button" title={st ? '주요 해제' : '주요 업체로 — 순위가 바뀌면 알림'} onClick={() => star(g, !st)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: st ? '#F79009' : '#D0D5DD', padding: 0 }}>★</button> : <span style={{ fontSize: 20, color: st ? '#F79009' : '#D0D5DD' }}>★</span>}
              <button type="button" onClick={() => setOpen({ ...open, [g]: !isOpen })} style={{ border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 180, display: 'flex', gap: 8, alignItems: 'center', padding: 0 }}>
                <b style={{ fontSize: 16, letterSpacing: '-0.01em' }}>{g}</b><span style={{ fontSize: 12.5, color: '#98A2B3', fontWeight: 600 }}>{list.length}개</span>
                {gd > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#D92D20', background: '#FEF3F2', borderRadius: 999, padding: '2px 9px' }}>하락 {gd}</span>}{gu > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#079455', background: '#ECFDF3', borderRadius: 999, padding: '2px 9px' }}>상승 {gu}</span>}
                <span style={{ marginLeft: 6, color: '#98A2B3', fontSize: 12 }}>{isOpen ? '접기 ▲' : '펼치기 ▼'}</span></button>
              {canRe && list.length > 0 && <button type="button" style={mini} disabled={busy} onClick={() => re({ group: g })}>{busy ? '조회 중…' : '업체 재체크'}</button>}
              {list.length > 0 && <a href={`/rank-watch/report?u=${sel}&g=${encodeURIComponent(g)}`} title="고객용 순위 리포트 (PNG/PDF)" style={{ ...mini, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>리포트</a>}
            </div>
            {isOpen && list.length === 0 && <div style={{ padding: '12px 16px', borderTop: '1px solid #F2F4F7', display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 13, color: '#98A2B3' }}>아직 상품 없음</span>{isMe && <><button type="button" style={mini} onClick={() => { setPreGroup(g); setAddOpen(true); setGOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>이 업체에 상품 등록</button><button type="button" style={{ ...mini, color: '#D92D20' }} onClick={async () => { if (!confirm(`${g} 업체를 지울까요?`)) return; const x = await removeGroup(g); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); }}>업체 삭제</button></>}</div>}
            {isOpen && list.map(w => <div key={w.id} style={{ borderTop: '1px solid #F2F4F7' }}>
              <div draggable={dragOk} onDragStart={e => { e.stopPropagation(); setDrag({ kind: 'i', key: w.id, group: g }); }} onDragOver={e => { if (drag?.kind === 'i' && drag.group === g) { e.preventDefault(); setOver('i:' + w.id); } }} onDragLeave={() => setOver(null)} onDrop={() => dropItem(g, w.id, list.map(x => x.id))} onClick={() => setDetail(detail === w.id ? null : w.id)}
                style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 16px', cursor: dragOk ? 'grab' : 'pointer', background: isDown(w) ? '#FFFBFA' : undefined, opacity: drag?.kind === 'i' && drag.key === w.id ? .4 : 1, outline: over === 'i:' + w.id ? '2px solid #2563EB' : undefined, flexWrap: 'wrap' }}>
                {w.image_url ? <img src={w.image_url} alt="" width={52} height={52} style={{ borderRadius: 10, objectFit: 'cover', border: '1px solid #EAECF0', flex: 'none' }} /> : <div style={{ width: 52, height: 52, borderRadius: 10, background: '#F2F4F7', flex: 'none' }} />}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 800, color: '#1D4ED8', background: '#EFF4FF', borderRadius: 999, padding: '3px 11px' }}>{w.keyword}</span>{w.mid_type === '원부' && <span style={{ fontSize: 11, fontWeight: 700, color: '#6941C6', background: '#F4F3FF', borderRadius: 999, padding: '2px 8px' }}>원부</span>}{w.memo && <span style={{ fontSize: 12, color: '#98A2B3' }}>{w.memo}</span>}</div>
                  <div style={{ fontSize: 13.5, color: '#344054', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>{w.url ? <a href={w.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }} onClick={e => e.stopPropagation()}>{w.title || w.url}</a> : (w.title || '-')}</div>
                  <div style={{ fontSize: 12, color: '#98A2B3', marginTop: 2 }}>{[w.store, w.cur_at ? `${fmtKST(w.cur_at)} 조회` : ''].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ flex: 'none' }}><Spark pts={hist[w.id] ?? []} /></div>
                <div style={{ flex: 'none', minWidth: 92 }}>{rankBox(w)}</div>
                <div style={{ flex: 'none', display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  {canRe && <button type="button" style={mini} disabled={busy} onClick={() => re({ ids: [w.id] })}>재체크</button>}
                  {isMe && <><button type="button" style={mini} onClick={() => setMv(mv?.id === w.id ? null : { id: w.id, group: w.group === '(미분류)' ? '' : w.group })}>이동</button><button type="button" style={{ ...mini, color: '#D92D20' }} onClick={() => del(w)}>삭제</button></>}
                </div>
                {mv?.id === w.id && <form onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); move(w.id, mv.group); }} style={{ display: 'flex', gap: 6, flexBasis: '100%', justifyContent: 'flex-end' }}><input list="rw-groups" value={mv.group} onChange={e => setMv({ id: w.id, group: e.target.value })} placeholder="옮길 업체명 (비우면 미분류)" style={{ width: 220, minHeight: 34 }} /><button type="submit" className="btn" disabled={busy}>이동</button></form>}
              </div>
              {detail === w.id && <div style={{ background: '#F9FAFB', padding: '14px 16px', borderTop: '1px solid #F2F4F7' }}><History pts={hist[w.id] ?? []} w={w} /></div>}
            </div>)}
          </div>; })}
      </>}
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
  if (!pts.length) return <Empty>최근 30일 조회 기록 없음</Empty>;
  const W = 720, H = 150, vals = pts.map(p => p.r).filter((r): r is number => r != null); const max = Math.max(...vals, 1), min = Math.min(...vals, max);
  const y = (r: number | null) => r == null ? H - 10 : 14 + (max === min ? (H - 40) / 2 : ((r - min) / (max - min)) * (H - 40));
  const x = (i: number) => 40 + (i / Math.max(1, pts.length - 1)) * (W - 60);
  const d = pts.map((p, i) => `${i === 0 || pts[i - 1].r == null || p.r == null ? 'M' : 'L'}${x(i)},${y(p.r)}`).join(' ');
  const best = Math.min(...vals), worst = Math.max(...vals);
  const byDay = new Map<string, HistPt>(); for (const p of pts) byDay.set(p.t.slice(0, 10), p);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => { const b = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - b.left) / b.width * W; let best = 0, bd = 1e9; pts.forEach((_, i) => { const dd = Math.abs(x(i) - px); if (dd < bd) { bd = dd; best = i; } }); setHi(best); };
  const hp = hi != null ? pts[hi] : null;
  return <div style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>{w.image_url && <img src={w.image_url} alt="" width={64} height={64} style={{ borderRadius: 10, objectFit: 'cover', border: '1px solid var(--line)' }} />}<div><b>{w.title ?? w.keyword}</b><div className="cell-sub">{w.store ?? ''} · {w.keyword} · MID {w.mid ?? '-'}{w.url && <> · <a href={w.url} target="_blank" rel="noreferrer">상품 열기</a></>}</div></div><div className="cell-sub" style={{ marginLeft: 'auto' }}>30일 최고 <b style={{ color: 'var(--ok-ink)' }}>{best}</b> · 최저 <b style={{ color: 'var(--bad-ink)' }}>{worst}</b> · 조회 {pts.length}회</div></div>
    <div style={{ position: 'relative', maxWidth: W }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: '#fff', border: '1px solid var(--line)', borderRadius: 10, cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <text x={4} y={18} fontSize={10} fill="var(--muted)">{min}위</text><text x={4} y={H - 24} fontSize={10} fill="var(--muted)">{max}위</text>
        <line x1={40} x2={W - 20} y1={H - 10} y2={H - 10} stroke="var(--line)" strokeDasharray="3 3" /><text x={4} y={H - 6} fontSize={10} fill="var(--bad-ink)">100위 밖</text>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.r)} r={hi === i ? 5 : 2.5} fill={p.r == null ? 'var(--bad)' : 'var(--accent)'} />)}
        {hp && hi != null && <line x1={x(hi)} x2={x(hi)} y1={8} y2={H - 10} stroke="var(--muted)" strokeDasharray="2 2" />}
      </svg>
      {hp && hi != null && <div style={{ position: 'absolute', left: `${Math.min(88, x(hi) / W * 100)}%`, top: 6, transform: 'translateX(-50%)', background: '#111', color: '#fff', fontSize: 12, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{fmtKST(hp.t)} · <b style={{ fontSize: 14 }}>{hp.r == null ? '100위 밖' : `${hp.r}위`}</b></div>}
    </div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[...byDay.entries()].reverse().map(([d2, p]) => <span key={d2} className="num" style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: p.r == null ? 'var(--bad-soft)' : 'var(--bg)', color: p.r == null ? 'var(--bad-ink)' : undefined }}>{d2.slice(5).replace('-', '/')} <b>{p.r ?? '밖'}</b></span>)}</div>
  </div>;
}
