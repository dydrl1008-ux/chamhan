'use client';
// 키워드 제안서 — 키워드 → (대상 업체 선택) → 문서 미리보기 → PDF / PNG(장별) / 링크
import { useEffect, useRef, useState } from 'react';
import { notify } from '@/components/Toast';
import { PageHeader, Empty, Section } from '@/components/ui';
import { fmtKST } from '@/lib/date/kst';
import ProposalDoc, { PD_CSS, docPageCount } from '@/components/ProposalDoc';
import type { Doc, Target } from '@/lib/proposalDoc';
import { loadKeyword, withTarget, makeNativeLink, logProposal, saveMyPhone } from './actions';

type MailRow = { store: string; email: string; status: string; opened_at: string | null; open_cnt: number; replied_at: string | null };
export default function ProposalsClient({ initialKw, phone: phone0, owner: owner0, recent, usage, mine = [], base = '', team = [], lead = null, mailByCode = {} }: { mailByCode?: Record<string, MailRow[]>; initialKw: string; base?: string; lead?: { id: number; store: string; rank: number } | null; team?: { name: string; keyword: string; target: string | null; action: string; code: string | null; views: number | null; created_at: string }[]; phone: string; owner: string; recent: string[]; usage: { used: number; limit: number }; mine?: { code: string; title: string; views: number; first_view_at: string | null; last_view_at: string | null; created_at: string }[] }) {
  const [kw, setKw] = useState(initialKw); const [phone, setPhone] = useState(phone0); const [owner, setOwner] = useState(owner0); const [basic, setBasic] = useState(''); const [rec, setRec] = useState('');
  const [doc, setDoc] = useState<Doc | null>(null); const [cands, setCands] = useState<Target[]>([]); const [tgt, setTgt] = useState<number | '' | 'manual'>(''); const [man, setMan] = useState({ mallName: '', title: '', rank: '', price: '', reviews: '' });
  const [busy, setBusy] = useState(''); const [link, setLink] = useState(''); const wrap = useRef<HTMLDivElement>(null);
  const load = async (k = kw) => { const q = k.trim(); if (!q) return; setBusy('load'); setLink(''); setTgt(''); const x = await loadKeyword(q); setBusy(''); if (!x.ok || !x.doc) { notify(x.msg, 'bad'); return; } setDoc(x.doc); setCands(x.candidates ?? []); notify(x.msg, 'ok');
    if (lead?.store) {   // 콜 리스트에서 넘어온 업체: 목록에 있으면 그걸로, 없으면 직접 입력으로 자동 반영
      const hit = undefined as Target | undefined;   // 화면에서는 자동 매칭 안 함 — 직원이 목록에서 직접 고르거나 직접 입력
      if (hit) { setTgt(hit.rank); const y = await withTarget(x.doc.keyword, hit, owner, phone, { basic, rec }); if (y.ok && y.doc) setDoc(y.doc); }
      else { const m = { mallName: lead.store, title: '', rank: lead.rank ? String(lead.rank) : '', price: '', reviews: '' }; setMan(m); setTgt('manual'); const t: Target = { rank: Math.max(1, lead.rank || 101), mallName: lead.store, title: lead.store, price: 0, reviews: 0, image: null }; const y = await withTarget(x.doc.keyword, t, owner, phone, { basic, rec }); if (y.ok && y.doc) setDoc(y.doc); }
    } };
  useEffect(() => { if (initialKw) load(initialKw); /* eslint-disable-next-line */ }, []);
  const pick = async (rank: number | '' | 'manual') => { setTgt(rank); if (!doc) return; const t: Target | null = rank === '' ? null : rank === 'manual' ? (man.mallName.trim() ? { rank: Math.max(1, Number(man.rank) || 101), mallName: man.mallName.trim(), title: man.title.trim() || man.mallName.trim(), price: Number(String(man.price).replace(/[^\d]/g, '')) || 0, reviews: Number(String(man.reviews).replace(/[^\d]/g, '')) || 0, image: null } : null) : cands.find(c => c.rank === rank) ?? null; setBusy('tgt'); const x = await withTarget(doc.keyword, t, owner, phone, { basic, rec }); setBusy(''); if (x.ok && x.doc) setDoc(x.doc); else notify(x.msg, 'bad'); setLink(''); };
  const pages = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>('.pd-page') ?? []);
  const fname = () => `${doc?.target ? doc.target.mallName + '_' : ''}${doc?.keyword}_제안서`;
  const toPdf = async () => {
    if (!doc) return; setBusy('pdf');
    try {
      const { toJpeg } = await import('html-to-image'); const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }); const els = pages();
      for (let i = 0; i < els.length; i++) {
        // 장마다 캡처 — margin 제거(옆으로 밀림 방지), JPEG 품질 0.9 (PNG 대비 1/20 용량)
        const u = await toJpeg(els[i], { pixelRatio: 1.6, quality: 0.9, backgroundColor: '#ffffff', cacheBust: true, style: { margin: '0', boxShadow: 'none' } });
        if (i) pdf.addPage(); const ratio = els[i].offsetHeight / els[i].offsetWidth; const w = 210, h = Math.min(297, w * ratio); pdf.addImage(u, 'JPEG', 0, 0, w, h, undefined, 'FAST');
      }
      pdf.save(fname() + '.pdf'); notify(`PDF 저장 (${els.length}장)`, 'ok'); logProposal('pdf', doc.keyword, doc.target?.mallName ?? null);
    } catch (e: any) { notify('PDF 실패: ' + (e?.message ?? e), 'bad'); } finally { setBusy(''); }
  };
  const toPng1 = async (i: number) => {
    setBusy('png'); try { const { toPng } = await import('html-to-image'); const el = pages()[i]; const u = await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true, style: { margin: '0', boxShadow: 'none' } }); const a = document.createElement('a'); a.href = u; a.download = `${fname()}_${i + 1}.png`; a.click(); logProposal('png', doc!.keyword, doc!.target?.mallName ?? null); } catch (e: any) { notify('PNG 실패: ' + (e?.message ?? e), 'bad'); } finally { setBusy(''); }
  };
  const mkLink = async () => { if (!doc) return; setBusy('link'); const x = await makeNativeLink(doc, lead?.id ?? null); setBusy(''); if (!x.ok || !x.url) { notify(x.msg, 'bad'); return; } setLink(x.url); try { await navigator.clipboard.writeText(x.url); notify('링크 복사됨 — ' + x.msg, 'ok'); } catch { notify(x.msg, 'ok'); } };

  return <div style={{ display: 'grid', gap: 14 }}>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
    <style dangerouslySetInnerHTML={{ __html: PD_CSS }} />
    <PageHeader title={lead ? `키워드 제안서 · ${lead.store}` : '키워드 제안서'} desc="시크릿 지수 조회 데이터만으로 제안서를 만듭니다 (AI 토큰 사용 없음). 같은 키워드는 24시간 캐시라 조회 한도를 안 씁니다." badge={<span className="cell-sub">오늘 조회 {usage.used}/{usage.limit}</span>} />
    <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>키워드<input list="pp-recent" value={kw} onChange={e => setKw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }} placeholder="예: 아기베개" style={{ width: 200 }} /><datalist id="pp-recent">{recent.map(r => <option key={r} value={r} />)}</datalist></label>
      <button type="button" className="btn" disabled={busy === 'load'} onClick={() => load()}>{busy === 'load' ? '조회 중…' : '제안서 만들기'}</button>
      {doc && <>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>대상 업체 (선택)<select value={tgt} onChange={e => pick(e.target.value === '' ? '' : e.target.value === 'manual' ? 'manual' : Number(e.target.value))} style={{ maxWidth: 360 }}><option value="">— 시장 분석용 (업체 없음)</option><option value="manual">직접 입력 (100위 밖·목록에 없는 업체)</option>{cands.map(c => <option key={c.rank} value={c.rank}>{c.rank}위 · {c.mallName} · {c.title.slice(0, 30)}</option>)}</select></label>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>담당자<input value={owner} onChange={e => setOwner(e.target.value)} onBlur={() => pick(tgt)} placeholder="이름" style={{ width: 90 }} /></label>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>연락처 <span style={{ fontWeight: 400 }}>(저장하면 콜 리스트 원클릭 링크에도 사용)</span><span style={{ display: 'flex', gap: 4 }}><input value={phone} onChange={e => setPhone(e.target.value)} onBlur={() => pick(tgt)} placeholder="010-0000-0000" style={{ width: 140 }} /><button type="button" className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }} onClick={async () => { const x = await saveMyPhone(phone); notify(x.msg, x.ok ? 'ok' : 'bad'); }}>저장</button></span></label>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>기본 가격<input value={basic} onChange={e => setBasic(e.target.value)} onBlur={() => pick(tgt)} placeholder="비우면 담당자 안내" style={{ width: 130 }} /></label>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>권장 가격<input value={rec} onChange={e => setRec(e.target.value)} onBlur={() => pick(tgt)} placeholder="예: 30만원 / 10일" style={{ width: 130 }} /></label>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={!!busy} onClick={toPdf}>{busy === 'pdf' ? '만드는 중…' : `PDF 저장 (${docPageCount(doc)}장)`}</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => toPng1(0)}>표지 PNG</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={mkLink}>{busy === 'link' ? '…' : '링크 만들기'}</button>
        </span>
      </>}
    </div>
    {doc && tgt === 'manual' && <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {([['mallName', '업체명 *', 140], ['title', '상품명', 260], ['rank', '현재 순위 (없으면 101)', 150], ['price', '가격', 100], ['reviews', '리뷰 수', 90]] as const).map(([k, l, w]) => <label key={k} style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>{l}<input value={(man as any)[k]} onChange={e => setMan({ ...man, [k]: e.target.value })} style={{ width: w }} /></label>)}
      <button type="button" className="btn" disabled={!man.mallName.trim() || busy === 'tgt'} onClick={() => pick('manual')}>반영</button>
      <span className="cell-sub">순위·가격·리뷰는 네이버쇼핑에서 보고 적으면 됨. 비우면 표에서 빠짐</span>
    </div>}
    {link && <div className="card" style={{ padding: '10px 14px', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>링크</b><code style={{ userSelect: 'all' }}>{link}</code><span className="cell-sub">열람하면 알림 · 참한 도메인만 노출 · 메일·카톡에 붙여 보내세요</span></div>}
    {team.length > 0 && <Section title="제안서 생성 현황" sub="팀/전체 · 최근 100건" flush><table><thead><tr><th>시각</th><th>담당자</th><th>키워드</th><th>업체</th><th>작업</th><th className="num">열람</th></tr></thead><tbody>
      {team.map((t, i) => <tr key={i}><td className="cell-sub">{fmtKST(t.created_at)}</td><td><b>{t.name}</b></td><td>{t.keyword}</td><td>{t.target ?? <span className="cell-sub">시장 분석</span>}</td><td>{t.action === 'make' ? '조회' : t.action === 'pdf' ? 'PDF' : t.action === 'png' ? 'PNG' : t.code ? <code style={{ fontSize: 12 }}>/p/{t.code}</code> : '링크'}</td><td className="num" style={{ fontWeight: t.views ? 700 : 400, color: t.views ? 'var(--ok-ink)' : undefined }}>{t.views ?? ''}</td></tr>)}
    </tbody></table></Section>}
    {mine.length > 0 && <Section title="내가 만든 링크" sub="열람하면 알림 + 여기 횟수 · 메일로 보낸 링크는 업체별 열람 펼쳐보기" flush><table><thead><tr><th>제목</th><th>링크</th><th className="num">열람</th><th>메일 발송</th><th>처음 본 시각</th><th>마지막</th><th>생성</th></tr></thead><tbody>
      {mine.map(m => { const ms = mailByCode[m.code] ?? []; const opened = ms.filter(x => x.opened_at); const replied = ms.filter(x => x.replied_at); return <tr key={m.code} style={{ background: m.views ? 'var(--ok-soft)' : undefined }}><td>{m.title}</td><td><code style={{ userSelect: 'all', fontSize: 12 }}>{base}/p/{m.code}</code></td><td className="num" style={{ fontWeight: m.views ? 700 : 400 }}>{m.views}</td>
        <td>{ms.length ? <details><summary style={{ cursor: 'pointer', fontSize: 12.5 }}>메일 {ms.length}곳 · 열람 <b style={{ color: opened.length ? 'var(--ok-ink)' : undefined }}>{opened.length}</b>{replied.length ? <> · 회신 <b style={{ color: 'var(--ok-ink)' }}>{replied.length}</b></> : null}</summary>
          <div style={{ fontSize: 12, marginTop: 4, maxHeight: 200, overflow: 'auto' }}>{[...opened, ...ms.filter(x => !x.opened_at)].map((x, i) => <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0', opacity: x.opened_at ? 1 : .55 }}><b style={{ minWidth: 110 }}>{x.store}</b><span className="cell-sub">{x.email}</span><span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{x.replied_at ? <b style={{ color: 'var(--ok-ink)' }}>📩 회신</b> : x.opened_at ? `열람 ${fmtKST(x.opened_at)} (${x.open_cnt})` : x.status === 'sent' ? '미열람' : x.status === 'queued' ? '대기' : x.status === 'failed' ? '실패' : x.status}</span></div>)}</div></details> : <span className="cell-sub">-</span>}</td>
        <td className="cell-sub">{fmtKST(m.first_view_at)}</td><td className="cell-sub">{fmtKST(m.last_view_at)}</td><td className="cell-sub">{fmtKST(m.created_at)}</td></tr>; })}
    </tbody></table></Section>}
    {!doc ? <div className="card"><Empty>키워드를 넣고 「제안서 만들기」</Empty></div> :
      <div ref={wrap} style={{ overflowX: 'auto', paddingBottom: 10 }}>{busy === 'tgt' && <div className="cell-sub" style={{ textAlign: 'center' }}>대상 반영 중…</div>}<ProposalDoc d={doc} total={docPageCount(doc)} img={u => `/api/img?u=${encodeURIComponent(u)}`} /></div>}
  </div>;
}
