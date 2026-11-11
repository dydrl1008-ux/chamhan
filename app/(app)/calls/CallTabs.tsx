'use client';
import { useState } from 'react';
import CallsClient, { type Lead, type Prop, type Hist, type Patch } from './CallsClient';
import type { LeadIndex } from '@/lib/leadIndex';

export type TabDef = { key: string; label: string; rows: Lead[]; empty: string; sub?: string };

/** 오늘 / 관심 / 계약 탭 — 같은 CallsClient 를 탭별 행으로 렌더 */
export default function CallTabs({ tabs, props, origin, history, indexes, initial }: { tabs: TabDef[]; props: Prop[]; origin: string; history: Record<number, Hist[]>; indexes: Record<number, LeadIndex>; initial?: string }) {
  const [cur, setCur] = useState(initial && tabs.some(t => t.key === initial) ? initial : tabs[0]?.key);
  // 결과 기록은 화면에서 바로 반영 — 탭 숫자·소속도 새로고침 없이 갱신 (오늘 → 관심/계약 이동)
  const [patches, setPatches] = useState<Record<number, Patch>>({});
  const onPatch = (id: number, p: Patch) => setPatches(s => ({ ...s, [id]: { ...(s[id] ?? {}), ...p } }));
  const P = (l: Lead): Lead => ({ ...l, ...(patches[l.id] ?? {}) });
  const multi = tabs.length > 1;
  const all: Lead[] = []; const seen = new Set<number>(); tabs.forEach(tb => tb.rows.forEach(l => { if (!seen.has(l.id)) { seen.add(l.id); all.push(P(l)); } }));
  const live = tabs.map(tb => {
    if (!multi) return { ...tb, rows: tb.rows.map(P) };
    if (tb.key === 'today') return { ...tb, rows: tb.rows.map(P).filter(l => patches[l.id] || (l.status !== 'interested' && l.status !== 'won')) };   // 방금 기록한 줄은 그 자리에 남겨둠 (날짜 수정·저장 표시 보이게) · 새로고침하면 관심/계약 탭으로
    const want = tb.key === 'interested' ? 'interested' : 'won';
    const base = tb.rows.map(P).filter(l => l.status === want); const ids = new Set(base.map(l => l.id));
    return { ...tb, rows: [...all.filter(l => l.status === want && !ids.has(l.id)), ...base] };
  });
  const t = live.find(x => x.key === cur) ?? live[0];
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
        {live.map(x => <button key={x.key} type="button" onClick={() => setCur(x.key)} className={`btn ${x.key === cur ? '' : 'ghost'}`} style={{ padding: '6px 14px' }}>{x.label} <b style={{ marginLeft: 4 }}>{x.rows.length}</b></button>)}
        {t?.sub && <span className="help" style={{ marginLeft: 8 }}>{t.sub}</span>}
      </div>
      {t && (t.rows.length ? <CallsClient rows={t.rows} props={props} origin={origin} history={history} indexes={indexes} onPatch={onPatch} /> : <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>{t.empty}</div>)}
    </div>
  );
}
