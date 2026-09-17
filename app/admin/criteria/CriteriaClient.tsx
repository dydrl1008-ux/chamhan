'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { saveCriteria, deactivateCriteria, saveTiers, saveSettings } from './actions';
import type { Criteria, Tier } from '@/lib/rules';
const inp: React.CSSProperties = { padding: '6px 8px', fontSize: 13 };
export default function CriteriaClient({ criteria, tiers, settings }: { criteria: Criteria[]; tiers: Tier[]; settings: Record<string, string> }) {
  const r = useRouter(); const [edit, setEdit] = useState<Criteria | null>(null);
  const TierForm = ({ scope, title, hint }: { scope: 'staff' | 'manager'; title: string; hint: string }) => {
    const [rows, setRows] = useState<Partial<Tier>[]>(tiers.filter(t => t.scope === scope));
    return <div className="card"><h3 style={{ margin: '0 0 6px', fontSize: 15 }}>{title}</h3><div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{hint} · 구간은 위에서 아래로 이어져야 함(이전 상한 = 다음 하한). 마지막 상한 비우면 무제한</div>
      <form action={async fd => { const x = await saveTiers(fd); notify(x.msg); if (x.ok) r.refresh(); }} style={{ display: 'grid', gap: 6 }}>
        <input type="hidden" name="scope" value={scope} />
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 70px 1fr 60px', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}><span>구간명</span><span>하한(원)</span><span>상한(원, 미만)</span><span>요율 %</span><span>보너스(원)</span><span></span></div>
        {rows.map((t, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 70px 1fr 60px', gap: 6 }}><input type="hidden" name="tier_id" value={t.id ?? ''} /><input name="label" defaultValue={t.label} style={inp} /><input name="min_margin" type="number" defaultValue={t.min_margin ?? 0} style={inp} /><input name="max_margin" type="number" defaultValue={t.max_margin ?? ''} placeholder="무제한" style={inp} /><input name="rate" type="number" step="0.1" defaultValue={((Number(t.rate ?? 0)) * 100).toFixed(1)} style={inp} /><input name="bonus" type="number" defaultValue={t.bonus ?? 0} style={inp} /><button type="button" className="btn ghost" style={{ padding: '4px 6px', fontSize: 11 }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>삭제</button></div>)}
        <div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setRows([...rows, { label: '', min_margin: rows.at(-1)?.max_margin ?? 0, max_margin: null, rate: 0, bonus: 0 }])}>+ 구간 추가</button><button className="btn" style={{ padding: '6px 14px', fontSize: 12 }}>저장</button></div>
      </form></div>;
  };
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>진급 · 인센티브 기준 관리</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>진급 기준</h3>
          <table><thead><tr><th>현재→진급</th><th style={{ textAlign: 'right' }}>월 마진</th><th>연속</th><th style={{ textAlign: 'right' }}>연 누계</th><th>지각/결근/병가</th><th>재직</th><th></th></tr></thead><tbody>{criteria.map(c => <tr key={c.id}><td><b>{c.from_position}</b> → {c.to_position}</td><td style={{ textAlign: 'right' }}>{Number(c.monthly_margin_min).toLocaleString()}</td><td>{c.consecutive_months}개월</td><td style={{ textAlign: 'right' }}>{c.yearly_margin_min ? Number(c.yearly_margin_min).toLocaleString() : '-'}</td><td>{c.max_late}/{c.max_absent}/{c.max_sick}</td><td>{c.min_tenure_months}개월</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEdit(c)}>편집</button> <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={async () => { if (confirm('삭제할까요?')) { const x = await deactivateCriteria(c.id); notify(x.msg); r.refresh(); } }}>삭제</button></td></tr>)}</tbody></table></div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? `편집 — ${edit.from_position}` : '기준 추가'}</h3>
          <form key={edit?.id ?? 'new'} action={async fd => { const x = await saveCriteria(fd); notify(x.msg); if (x.ok) { setEdit(null); r.refresh(); } }} style={{ display: 'grid', gap: 8 }}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input name="from_position" placeholder="현재 직급 (예: 사원)" defaultValue={edit?.from_position ?? ''} required /><input name="to_position" placeholder="진급 직급 (예: 주임)" defaultValue={edit?.to_position ?? ''} required /></div>
            <input name="monthly_margin_min" type="number" placeholder="월 마진 기준 (원)" defaultValue={edit?.monthly_margin_min ?? ''} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input name="consecutive_months" type="number" placeholder="연속 개월" defaultValue={edit?.consecutive_months ?? 3} /><input name="yearly_margin_min" type="number" placeholder="연 누계 기준 (선택)" defaultValue={edit?.yearly_margin_min ?? ''} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}><input name="max_late" type="number" placeholder="허용 지각(월)" defaultValue={edit?.max_late ?? 2} /><input name="max_absent" type="number" placeholder="허용 결근(연)" defaultValue={edit?.max_absent ?? 0} /><input name="max_sick" type="number" placeholder="허용 병가(월)" defaultValue={edit?.max_sick ?? 2} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input name="min_tenure_months" type="number" placeholder="최소 재직(개월)" defaultValue={edit?.min_tenure_months ?? 6} /><input name="sort_order" type="number" placeholder="정렬" defaultValue={edit?.sort_order ?? criteria.length + 1} /></div>
            <input name="note" placeholder="비고" defaultValue={edit?.note ?? ''} />
            <div style={{ display: 'flex', gap: 8 }}><button className="btn">{edit ? '저장' : '추가'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>취소</button>}</div>
          </form></div>
      </div>
      <TierForm scope="staff" title="인센티브 구간 — 팀원" hint="본인 월 마진 기준. 해당 구간 요율 × 월 마진 + 보너스" />
      <TierForm scope="manager" title="인센티브 구간 — 팀장" hint="팀 합계 마진 기준" />
      <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>공통 설정</h3>
        <form action={async fd => { const x = await saveSettings(fd); notify(x.msg); if (x.ok) r.refresh(); }} style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div><label style={{ fontSize: 12, color: 'var(--muted)' }}>신규 마진 가산율 (%)</label><input name="new_margin_bonus_rate" type="number" step="0.1" defaultValue={(Number(settings.new_margin_bonus_rate ?? 0) * 100).toFixed(1)} /></div><div><label style={{ fontSize: 12, color: 'var(--muted)' }}>지각 기준 시각</label><input name="late_after" type="time" defaultValue={settings.late_after ?? '09:30'} /></div></div>
          <div><label style={{ fontSize: 12, color: 'var(--muted)' }}>진급 기준 설명문 (직원 화면에 표시)</label><textarea name="promotion_doc" rows={3} defaultValue={settings.promotion_doc ?? ''} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }} /></div>
          <div><label style={{ fontSize: 12, color: 'var(--muted)' }}>인센티브 설명문</label><textarea name="incentive_doc" rows={3} defaultValue={settings.incentive_doc ?? ''} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }} /></div>
          <div><button className="btn">저장</button></div>
        </form></div>
    </div>
  );
}
