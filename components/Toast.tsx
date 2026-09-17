'use client';
import { useEffect, useState } from 'react';
/** 어디서든 notify('메시지') 호출 → 우측 하단 알림창 */
export function notify(msg: string, kind?: 'ok' | 'bad') {
  if (typeof window === 'undefined' || !msg) return;
  const k = kind ?? (/실패|불가|에러|없|권한|부족|않|초과|이전|미래/.test(msg) ? 'bad' : 'ok');
  window.dispatchEvent(new CustomEvent('wh-toast', { detail: { msg, kind: k } }));
}
export default function Toast() {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  useEffect(() => {
    const h = (e: Event) => { const { msg, kind } = (e as CustomEvent).detail; const id = Date.now() + Math.random(); setItems(x => [...x, { id, msg, kind }]); setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 3200); };
    window.addEventListener('wh-toast', h); return () => window.removeEventListener('wh-toast', h);
  }, []);
  return <div style={{ position: 'fixed', right: 22, bottom: 22, display: 'grid', gap: 8, zIndex: 100 }}>{items.map(i => <div key={i.id} style={{ background: i.kind === 'bad' ? '#B91C1C' : '#0F1B3D', color: '#fff', padding: '12px 18px', borderRadius: 12, fontSize: 13.5, fontWeight: 500, boxShadow: '0 10px 30px -10px rgba(0,0,0,.45)', minWidth: 220, maxWidth: 420 }}>{i.kind === 'bad' ? '⚠ ' : '✓ '}{i.msg}</div>)}</div>;
}
