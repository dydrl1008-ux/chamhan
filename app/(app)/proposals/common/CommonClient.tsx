'use client';
import { useRef, useState } from 'react';
import { Pv3CommonDoc, PV3_CSS, PV3_FONT, PV3G_PAGES, PV3G_TITLES } from '@/components/Pv3Doc';
import type { KwData, KwAi } from '@/lib/proposalV3';
import { notify } from '@/components/Toast';

export default function CommonClient({ k, ka, worker, brand }: { k: KwData; ka: KwAi; worker: boolean; brand: { name: string; email: string; kakao: string } }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]); const [busy, setBusy] = useState('');
  const pages = Array.from({ length: PV3G_PAGES }, (_, i) => i + 1);
  const name = (n: number) => `${k.keyword}_제안서_${String(n).padStart(2, '0')}`;
  const shot = async (n: number, png = false) => {
    const el = refs.current[n - 1]; if (!el) throw new Error('화면을 찾지 못했습니다');
    const h = await import('html-to-image'); const opt = { pixelRatio: 1.5, backgroundColor: '#ffffff', cacheBust: true };
    return png ? h.toPng(el, opt) : h.toJpeg(el, { ...opt, quality: 0.88 });
  };
  const save = (url: string, file: string) => { const a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); };
  const saveOne = async (n: number) => { setBusy('s' + n); try { save(await shot(n), name(n) + '.jpg'); } catch (e: any) { notify('저장 실패: ' + (e?.message ?? e), 'bad'); } finally { setBusy(''); } };
  const saveAll = async () => {
    setBusy('all');
    try { for (const n of pages) { save(await shot(n), name(n) + '.jpg'); await new Promise(r => setTimeout(r, 350)); } notify(`${PV3G_PAGES}장 저장 — 브라우저가 "여러 파일 다운로드"를 물으면 허용해 주세요`, 'ok'); }
    catch (e: any) { notify('저장 실패: ' + (e?.message ?? e), 'bad'); } finally { setBusy(''); }
  };
  const copyOne = async (n: number) => {
    setBusy('c' + n);
    try { const blob = await (await fetch(await shot(n, true))).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); notify(`${n}장 복사됨 — 붙여넣을 곳에서 Ctrl+V`, 'ok'); }
    catch (e: any) { notify('복사 실패 — 「저장」을 써 주세요 (' + (e?.message ?? '') + ')', 'bad'); } finally { setBusy(''); }
  };
  return <div style={{ display: 'grid', gap: 14 }}>
    <link rel="stylesheet" href={PV3_FONT} crossOrigin="anonymous" />
    <style dangerouslySetInnerHTML={{ __html: PV3_CSS }} />
    <div className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', position: 'sticky', top: 0, zIndex: 5 }}>
      <div style={{ minWidth: 0 }}><b style={{ fontSize: 16 }}>「{k.keyword}」 맞춤 제안서 공용판</b>
        <div className="cell-sub">업체 이름·순위 없이 {PV3G_PAGES}장 — 한 통을 여러 업체에 보낼 때 씁니다. {worker ? '시장·구매자 글: 워커 글' : '시장·구매자 글: 기본 문장 (워커 글이 나오면 새로고침 시 바뀝니다)'}</div></div>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button type="button" className="btn" disabled={!!busy} onClick={saveAll}>{busy === 'all' ? '저장 중…' : `전체 이미지 저장 (${PV3G_PAGES}장)`}</button></span>
    </div>
    {pages.map(n => <div key={n} style={{ display: 'grid', gap: 6, justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: 720 }}><b style={{ fontSize: 13 }}>{String(n).padStart(2, '0')} · {PV3G_TITLES[n - 1]}</b>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}><button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => copyOne(n)}>{busy === 'c' + n ? '복사 중…' : '복사'}</button><button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => saveOne(n)}>{busy === 's' + n ? '저장 중…' : '저장'}</button></span></div>
      <div ref={el => { refs.current[n - 1] = el; }} style={{ width: 720, boxShadow: '0 2px 14px rgba(10,16,36,.12)' }}><Pv3CommonDoc k={k} ka={ka} brand={brand} page={n} /></div>
    </div>)}
  </div>;
}
