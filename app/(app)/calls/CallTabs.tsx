'use client';
import { useState } from 'react';
import CallsClient, { type Lead, type Prop, type Hist } from './CallsClient';
import type { LeadIndex } from '@/lib/leadIndex';

export type TabDef = { key: string; label: string; rows: Lead[]; empty: string; sub?: string };

/** 오늘 / 관심 / 계약 탭 — 같은 CallsClient 를 탭별 행으로 렌더 */
export default function CallTabs({ tabs, props, origin, history, indexes, initial }: { tabs: TabDef[]; props: Prop[]; origin: string; history: Record<number, Hist[]>; indexes: Record<number, LeadIndex>; initial?: string }) {
  const [cur, setCur] = useState(initial && tabs.some(t => t.key === initial) ? initial : tabs[0]?.key);
  const t = tabs.find(x => x.key === cur) ?? tabs[0];
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
        {tabs.map(x => <button key={x.key} type="button" onClick={() => setCur(x.key)} className={`btn ${x.key === cur ? '' : 'ghost'}`} style={{ padding: '6px 14px' }}>{x.label} <b style={{ marginLeft: 4 }}>{x.rows.length}</b></button>)}
        {t?.sub && <span className="help" style={{ marginLeft: 8 }}>{t.sub}</span>}
      </div>
      {t && (t.rows.length ? <CallsClient rows={t.rows} props={props} origin={origin} history={history} indexes={indexes} /> : <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>{t.empty}</div>)}
    </div>
  );
}
