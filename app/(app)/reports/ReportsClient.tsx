'use client';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { saveSubmission } from './actions';
import { fmtKST } from '@/lib/date/kst';
import type { Profile } from '@/lib/auth/session';
type F = { id: number; name: string; period: string; description: string | null; period_key: string };
type Fd = { id: number; form_id: number; key: string; label: string; type: string; options: string[] | null; required: boolean };
type S = { id: number; form_id: number; user_id: string; period_key: string; data: Record<string, string>; status: string; submitted_at: string | null };
const PERIOD: Record<string, string> = { daily: '매일', weekly: '매주', monthly: '매월', adhoc: '비정기' };
export default function ReportsClient({ me, forms, allForms, fields, subs, people, auto, openForm, viewSub, today }: { me: Profile; forms: F[]; allForms: { id: number; name: string; period: string }[]; fields: Fd[]; subs: S[]; people: { id: string; name: string }[]; auto: Record<string, string>; openForm: number | null; viewSub: number | null; today: string }) {
  const r = useRouter(); const nm = (id: string) => people.find(p => p.id === id)?.name ?? '-'; const fname = (id: number) => allForms.find(f => f.id === id)?.name ?? '-';
  const mine = (f: F) => subs.find(s => s.form_id === f.id && s.user_id === me.id && s.period_key === f.period_key);
  const cur = openForm ? forms.find(f => f.id === openForm) : null; const curSub = cur ? mine(cur) : null;
  const view = viewSub ? subs.find(s => s.id === viewSub) : null;
  const Fld = ({ f, val, ro }: { f: Fd; val?: string; ro?: boolean }) => {
    const isAuto = f.type.startsWith('auto'); const v = isAuto ? auto[f.type] : val ?? '';
    if (ro || isAuto) return <div style={{ whiteSpace: 'pre-wrap', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, minHeight: 36, fontSize: 13 }}>{v || <span style={{ color: 'var(--muted)' }}>미입력</span>}</div>;
    const s: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: 9, width: '100%' };
    if (f.type === 'textarea') return <textarea name={`d_${f.key}`} rows={3} defaultValue={v} style={s} />;
    if (f.type === 'select') return <select name={`d_${f.key}`} defaultValue={v}><option value="">선택</option>{(f.options ?? []).map(o => <option key={o}>{o}</option>)}</select>;
    if (f.type === 'checkbox') return <select name={`d_${f.key}`} defaultValue={v || '아니오'}><option>예</option><option>아니오</option></select>;
    return <input name={`d_${f.key}`} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} defaultValue={v} />;
  };
  const others = subs.filter(s => s.status === 'submitted' && (me.role !== 'staff' || s.user_id === me.id));
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>보고서 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>배정된 양식 · 제출물 열람 (직원=본인, 팀장=팀, 총괄·어드민=전체)</span></h1>
      {cur && <form className="card" style={{ borderColor: 'var(--accent)' }} action={async fd => { const x = await saveSubmission(fd); notify(x.msg); if (x.ok) { r.push('/reports'); r.refresh(); } }}>
        <input type="hidden" name="form_id" value={cur.id} /><input type="hidden" name="period_key" value={cur.period_key} />
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>{cur.name} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{cur.period_key} · {curSub?.status === 'submitted' ? '제출 완료 (수정 가능)' : curSub ? '임시저장' : '작성'}</span></h3>
        {cur.description && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>{cur.description}</div>}
        <div style={{ display: 'grid', gap: 12 }}>{fields.filter(f => f.form_id === cur.id).map(f => <div key={f.id}><label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>{f.label}{f.required && <span style={{ color: 'var(--bad)' }}> *</span>}{f.type.startsWith('auto') && <span className="pill" style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg)', color: 'var(--muted)' }}>자동</span>}</label><Fld f={f} val={curSub?.data?.[f.key]} /></div>)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><button name="submit" value="0" className="btn ghost">임시저장</button><button name="submit" value="1" className="btn">제출</button><button type="button" className="btn ghost" onClick={() => r.push('/reports')}>닫기</button></div>
      </form>}
      {view && <div className="card" style={{ borderColor: 'var(--accent)' }}><h3 style={{ margin: '0 0 10px', fontSize: 16, display: 'flex', justifyContent: 'space-between' }}><span>{fname(view.form_id)} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{view.period_key} · {nm(view.user_id)} · {fmtKST(view.submitted_at, true)}</span></span><button className="btn ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => r.push('/reports')}>닫기</button></h3>
        <table><tbody>{fields.filter(f => f.form_id === view.form_id).map(f => <tr key={f.id}><td style={{ width: 200, color: 'var(--muted)', fontSize: 13, verticalAlign: 'top' }}>{f.label}</td><td style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{f.type.startsWith('auto') ? <span style={{ color: 'var(--muted)' }}>(제출 당시 자동값은 저장되지 않음)</span> : view.data?.[f.key] || <span style={{ color: 'var(--muted)' }}>미입력</span>}</td></tr>)}</tbody></table></div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 18 }}>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>작성할 보고서</h3>
          {forms.map(f => { const s = mine(f); const st = s?.status === 'submitted' ? ['제출 완료', 'var(--ok-soft)', 'var(--ok)'] : s ? ['임시저장', '#FDF1DD', '#D97706'] : ['미제출', 'var(--bad-soft)', 'var(--bad)']; return <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12, marginBottom: 8, background: st[0] === '미제출' ? 'linear-gradient(90deg,var(--bad-soft),var(--panel) 60%)' : undefined }}><div><b>{f.name}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{PERIOD[f.period]} · {f.period_key}</div></div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="pill" style={{ background: st[1], color: st[2] }}>{st[0]}</span><button className="btn" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => r.push(`/reports?f=${f.id}`)}>{s?.status === 'submitted' ? '열기' : '작성'}</button></div></div>; })}
          {forms.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>배정된 양식이 없습니다. 일간 KPI·주간보고는 각 메뉴에서 작성합니다.</div>}</div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{me.role === 'staff' ? '내 제출 이력' : '제출물'} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{others.length}건 · 클릭하면 열람</span></h3>
          <div style={{ maxHeight: 520, overflow: 'auto' }}>{others.map(s => <div key={s.id} onClick={() => r.push(`/reports?v=${s.id}`)} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px', gap: 10, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 6, cursor: 'pointer', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>{s.period_key}</span><span><b>{fname(s.form_id)}</b></span><span style={{ textAlign: 'right' }}>{nm(s.user_id)}</span></div>)}{others.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>없음</div>}</div></div>
      </div>
    </div>
  );
}
