'use client';
// 제안서 전체 보기 → PDF 한 파일 (장마다 한 페이지, 페이지 크기는 그 장 크기 그대로)
import { useState } from 'react';
export default function PdfButton({ name }: { name: string }) {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const run = async () => {
    if (busy) return; setBusy('준비 중…'); setErr('');
    try {
      const els = Array.from(document.querySelectorAll<HTMLElement>('#pv3-page > div')); if (!els.length) throw new Error('장을 찾지 못했습니다');
      try { await (document as any).fonts?.ready; } catch {}
      const h2i = await import('html-to-image'); const { jsPDF } = await import('jspdf');
      let fontCss: string | undefined; try { fontCss = await h2i.getFontEmbedCSS(els[0]); } catch {}
      let pdf: InstanceType<typeof jsPDF> | null = null;
      for (let i = 0; i < els.length; i++) {
        setBusy(`${i + 1}/${els.length}장`);
        const el = (els[i].firstElementChild as HTMLElement) ?? els[i]; const w = el.offsetWidth, h = el.offsetHeight;
        const url = await h2i.toJpeg(el, { pixelRatio: 2, quality: 0.92, backgroundColor: '#ffffff', ...(fontCss ? { fontEmbedCSS: fontCss } : {}) });
        const o = h >= w ? 'portrait' : 'landscape';
        if (!pdf) pdf = new jsPDF({ unit: 'px', format: [w, h], orientation: o, hotfixes: ['px_scaling'], compress: true }); else pdf.addPage([w, h], o);
        pdf.addImage(url, 'JPEG', 0, 0, w, h, undefined, 'FAST');
      }
      pdf!.save(`${name.replace(/[\\/:*?"<>|]/g, ' ').trim() || '제안서'}.pdf`); setBusy('');
    } catch (e: any) { setBusy(''); console.error(e); setErr(String(e?.message ?? e).slice(0, 80)); }
  };
  return <div data-noprint style={{ position: 'fixed', top: 14, right: 14, zIndex: 50, display: 'grid', gap: 6, justifyItems: 'end', fontFamily: 'Pretendard, "Malgun Gothic", sans-serif' }}>
    <button type="button" onClick={run} disabled={!!busy} style={{ padding: '10px 16px', fontSize: 14, fontWeight: 800, color: '#fff', background: busy ? '#8A94AD' : '#16255E', border: 0, borderRadius: 10, cursor: busy ? 'default' : 'pointer', boxShadow: '0 2px 10px rgba(10,18,51,.25)' }}>{busy ? `PDF 만드는 중 ${busy}` : 'PDF 저장'}</button>
    {err && <div style={{ background: '#fff', color: '#B42318', fontSize: 12.5, padding: '6px 10px', borderRadius: 8, boxShadow: '0 1px 6px rgba(0,0,0,.15)' }}>실패: {err}</div>}
  </div>;
}
