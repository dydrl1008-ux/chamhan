'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { saveForm, deactivateForm } from './actions';
type F = { id: number; name: string; period: string; description: string | null };
type Fd = { id: number; form_id: number; key: string; label: string; type: string; options: string[] | null; required: boolean; sort_order: number };
type A = { form_id: number; team_id: number | null; role: string | null; user_id: string | null; only_mgmt: boolean };
const TYPES: [string, string][] = [['text', '짧은 글'], ['textarea', '긴 글'], ['number', '숫자'], ['select', '선택'], ['date', '날짜'], ['checkbox', '체크'], ['auto_margin_today', '자동: 금일 마진'], ['auto_margin_month', '자동: 이달 마진'], ['auto_plan_rate', '자동: 계획 달성률'], ['auto_attendance', '자동: 이달 근태']];
const PERIOD: Record<string, string> = { daily: '매일', weekly: '매주', monthly: '매월', adhoc: '비정기' };
export default function FormsAdmin({ forms, fields, asg, teams, people, counts }: { forms: F[]; fields: Fd[]; asg: A[]; teams: { id: number; name: string }[]; people: { id: string; name: string; role: string }[]; counts: Record<number, number> }) {
  const r = useRouter(); const [edit, setEdit] = useState<F | null>(null);
  const [rows, setRows] = useState<Partial<Fd>[]>([{ label: '', type: 'text' }]);
  const open = (f: F | null) => { setEdit(f); setRows(f ? fields.filter(x => x.form_id === f.id) : [{ label: '', type: 'text' }]); };
  const A = (fid: number) => asg.filter(a => a.form_id === fid);
  const roleName: Record<string, string> = { admin: '어드민', head: '총책임자', manager: '팀장', staff: '직원' };
  const asgText = (fid: number) => A(fid).map(a => a.team_id ? teams.find(t => t.id === a.team_id)?.name + ' 직원' : a.role ? roleName[a.role] : a.user_id ? people.find(p => p.id === a.user_id)?.name : a.only_mgmt ? '관리팀' : '').join(', ') || '미배정';
  const inp: React.CSSProperties = { padding: '6px 8px', fontSize: 12.5 };
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>보고서 양식 관리 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>양식 만들고 팀·역할·개인·관리팀에 배정 → 배정된 사람의 '보고서' 메뉴에 자동 노출</span></h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18 }}>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>양식 목록</h3>
          {forms.map(f => <div key={f.id} style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><b>{f.name}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{PERIOD[f.period]} · {asgText(f.id)} · 필드 {fields.filter(x => x.form_id === f.id).length} · 제출 {counts[f.id] ?? 0}</div></div><div style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => open(f)}>편집</button> <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={async () => { if (confirm('비활성화할까요? 제출물은 보존됩니다.')) { const x = await deactivateForm(f.id); notify(x.msg); r.refresh(); } }}>비활성</button></div></div>)}
          {forms.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>양식이 없습니다. 우측에서 만드세요.</div>}
          <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => open(null)}>+ 새 양식</button></div>
        <form className="card" key={edit?.id ?? 'new'} action={async fd => { const x = await saveForm(fd); notify(x.msg); if (x.ok) { open(null); r.refresh(); } }}>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? `편집 — ${edit.name}` : '새 양식'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}><input name="name" placeholder="양식 이름 (예: 총책임자 주간보고)" defaultValue={edit?.name ?? ''} required /><select name="period" defaultValue={edit?.period ?? 'daily'}>{Object.entries(PERIOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <input name="description" placeholder="설명 (선택)" defaultValue={edit?.description ?? ''} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>필드</div>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1.5fr 1.2fr 1fr 50px 50px', gap: 6, fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}><span>키</span><span>라벨</span><span>타입</span><span>선택지(콤마)</span><span>필수</span><span></span></div>
          {rows.map((f, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1.5fr 1.2fr 1fr 50px 50px', gap: 6, marginBottom: 6 }}><input name="f_key" defaultValue={f.key ?? ''} placeholder={`f${i + 1}`} style={inp} /><input name="f_label" defaultValue={f.label ?? ''} placeholder="예: 금일 콜 수" style={inp} /><select name="f_type" defaultValue={f.type ?? 'text'} style={inp}>{TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><input name="f_options" defaultValue={(f.options ?? []).join(',')} placeholder="A,B,C" style={inp} /><select name="f_required" defaultValue={f.required ? '1' : '0'} style={inp}><option value="0">-</option><option value="1">필수</option></select><button type="button" className="btn ghost" style={{ padding: '4px 6px', fontSize: 11 }} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button></div>)}
          <button type="button" className="btn ghost" style={{ padding: '5px 10px', fontSize: 12, marginBottom: 14 }} onClick={() => setRows([...rows, { label: '', type: 'text' }])}>+ 필드 추가</button>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>배정 (복수 선택)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            <div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>팀 (해당 팀 직원)</div>{teams.map(t => <label key={t.id} style={{ display: 'block' }}><input type="checkbox" name="a_team" value={t.id} defaultChecked={!!edit && A(edit.id).some(a => a.team_id === t.id)} style={{ width: 'auto', marginRight: 6 }} />{t.name}</label>)}</div>
            <div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>역할</div>{Object.entries(roleName).filter(([k]) => k !== 'admin').map(([k, v]) => <label key={k} style={{ display: 'block' }}><input type="checkbox" name="a_role" value={k} defaultChecked={!!edit && A(edit.id).some(a => a.role === k)} style={{ width: 'auto', marginRight: 6 }} />{v}</label>)}<label style={{ display: 'block' }}><input type="checkbox" name="a_mgmt" defaultChecked={!!edit && A(edit.id).some(a => a.only_mgmt)} style={{ width: 'auto', marginRight: 6 }} />관리팀 (체크된 인원)</label></div>
          </div>
          <div style={{ marginTop: 8 }}><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>개인 지정</div><select name="a_user" multiple defaultValue={edit ? A(edit.id).filter(a => a.user_id).map(a => a.user_id!) : []} style={{ height: 90 }}>{people.map(p => <option key={p.id} value={p.id}>{p.name} ({roleName[p.role]})</option>)}</select><div style={{ fontSize: 11, color: 'var(--muted)' }}>Ctrl 누르고 복수 선택</div></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn">{edit ? '저장' : '양식 만들기'}</button>{edit && <button type="button" className="btn ghost" onClick={() => open(null)}>취소</button>}</div>
        </form>
      </div>
    </div>
  );
}
