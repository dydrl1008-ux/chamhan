'use client';
// 키워드 제안서 — 키워드 → (대상 업체 선택) → 문서 미리보기 → PDF / PNG(장별) / 링크
import { useEffect, useRef, useState } from 'react';
import { notify } from '@/components/Toast';
import { PageHeader, Empty } from '@/components/ui';
import ProposalDoc, { PD_CSS, docPageCount } from '@/components/ProposalDoc';
import type { Doc, Target } from '@/lib/proposalDoc';
import { loadKeyword, withTarget, makeNativeLink } from './actions';

export default function ProposalsClient({ initialKw, phone: phone0, recent, usage }: { initialKw: string; phone: string; recent: string[]; usage: { used: number; limit: number } }) {
  const [kw, setKw] = useState(initialKw); const [phone, setPhone] = useState(phone0);
  const [doc, setDoc] = useState<Doc | null>(null); const [cands, setCands] = useState<Target[]>([]); const [tgt, setTgt] = useState<number | ''>('');
  const [busy, setBusy] = useState(''); const [link, setLink] = useState(''); const wrap = useRef<HTMLDivElement>(null);
  const load = async (k = kw) => { const q = k.trim(); if (!q) return; setBusy('load'); setLink(''); setTgt(''); const x = await loadKeyword(q); setBusy(''); if (!x.ok || !x.doc) { notify(x.msg, 'bad'); return; } setDoc(x.doc); setCands(x.candidates ?? []); notify(x.msg, 'ok'); };
  useEffect(() => { if (initialKw) load(initialKw); /* eslint-disable-next-line */ }, []);
  const pick = async (rank: number | '') => { setTgt(rank); if (!doc) return; const t = rank === '' ? null : cands.find(c => c.rank === rank) ?? null; setBusy('tgt'); const x = await withTarget(doc.keyword, t, phone); setBusy(''); if (x.ok && x.doc) setDoc(x.doc); else notify(x.msg, 'bad'); setLink(''); };
  const pages = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>('.pd-page') ?? []);
  const fname = () => `${doc?.target ? doc.target.mallName + '_' : ''}${doc?.keyword}_제안서`;
  const toPdf = async () => {
    if (!doc) return; setBusy('pdf');
    try {
      const { toPng } = await import('html-to-image'); const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }); const els = pages();
      for (let i = 0; i < els.length; i++) {
        const u = await toPng(els[i], { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
        if (i) pdf.addPage(); const ratio = els[i].offsetHeight / els[i].offsetWidth; const w = 210, h = Math.min(297, w * ratio); pdf.addImage(u, 'PNG', 0, 0, w, h);
      }
      pdf.save(fname() + '.pdf'); notify(`PDF 저장 (${els.length}장)`, 'ok');
    } catch (e: any) { notify('PDF 실패: ' + (e?.message ?? e), 'bad'); } finally { setBusy(''); }
  };
  const toPng1 = async (i: number) => {
    setBusy('png'); try { const { toPng } = await import('html-to-image'); const el = pages()[i]; const u = await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true }); const a = document.createElement('a'); a.href = u; a.download = `${fname()}_${i + 1}.png`; a.click(); } catch (e: any) { notify('PNG 실패: ' + (e?.message ?? e), 'bad'); } finally { setBusy(''); }
  };
  const mkLink = async () => { if (!doc) return; setBusy('link'); const x = await makeNativeLink(doc); setBusy(''); if (!x.ok || !x.url) { notify(x.msg, 'bad'); return; } setLink(x.url); try { await navigator.clipboard.writeText(x.url); notify('링크 복사됨 — ' + x.msg, 'ok'); } catch { notify(x.msg, 'ok'); } };

  return <div style={{ display: 'grid', gap: 14 }}>
    <style dangerouslySetInnerHTML={{ __html: PD_CSS }} />
    <PageHeader title="키워드 제안서" desc="시크릿 지수 조회 데이터만으로 제안서를 만듭니다 (AI 토큰 사용 없음). 같은 키워드는 24시간 캐시라 조회 한도를 안 씁니다." badge={<span className="cell-sub">오늘 조회 {usage.used}/{usage.limit}</span>} />
    <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>키워드<input list="pp-recent" value={kw} onChange={e => setKw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }} placeholder="예: 아기베개" style={{ width: 200 }} /><datalist id="pp-recent">{recent.map(r => <option key={r} value={r} />)}</datalist></label>
      <button type="button" className="btn" disabled={busy === 'load'} onClick={() => load()}>{busy === 'load' ? '조회 중…' : '제안서 만들기'}</button>
      {doc && <>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>대상 업체 (선택)<select value={tgt} onChange={e => pick(e.target.value === '' ? '' : Number(e.target.value))} style={{ maxWidth: 360 }}><option value="">— 시장 분석용 (업체 없음)</option>{cands.map(c => <option key={c.rank} value={c.rank}>{c.rank}위 · {c.mallName} · {c.title.slice(0, 30)}</option>)}</select></label>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>담당자 연락처<input value={phone} onChange={e => setPhone(e.target.value)} onBlur={() => pick(tgt)} placeholder="010-0000-0000" style={{ width: 140 }} /></label>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={!!busy} onClick={toPdf}>{busy === 'pdf' ? '만드는 중…' : `PDF 저장 (${docPageCount(doc)}장)`}</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => toPng1(0)}>표지 PNG</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={mkLink}>{busy === 'link' ? '…' : '링크 만들기'}</button>
        </span>
      </>}
    </div>
    {link && <div className="card" style={{ padding: '10px 14px', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>링크</b><code style={{ userSelect: 'all' }}>{link}</code><span className="cell-sub">열람하면 알림 · 참한 도메인만 노출 · 메일·카톡에 붙여 보내세요</span></div>}
    {!doc ? <div className="card"><Empty>키워드를 넣고 「제안서 만들기」</Empty></div> :
      <div ref={wrap} style={{ overflowX: 'auto', paddingBottom: 10 }}>{busy === 'tgt' && <div className="cell-sub" style={{ textAlign: 'center' }}>대상 반영 중…</div>}<ProposalDoc d={doc} total={docPageCount(doc)} img={u => `/api/img?u=${encodeURIComponent(u)}`} /></div>}
  </div>;
}
