'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestCorrection, decideCorrection } from './actions';
import type { Profile } from '@/lib/auth/session';
type R = { id: number; work_date: string; check_in: string | null; check_out: string | null };
type C = { id: number; attendance_id: number; user_id: string; field: string; old_time: string | null; new_time: string; reason: string; status: string; created_at: string };
export default function Corrections({ me, myRows, corrections, names, rowsById }: { me: Profile; myRows: R[]; corrections: C[]; names: Record<string, string>; rowsById: Record<number, string> }) {
  const r = useRouter(); const [msg, setMsg] = useState('');
  const isFinal = me.role === 'admin' || me.role === 'head';
  const pending = corrections.filter(c => c.status === 'pending');
  const st: Record<string, [string, React.CSSProperties]> = { pending: ['대기', { background: '#FDF1DD', color: '#D97706' }], approved: ['승인', { background: 'var(--ok-soft)', color: 'var(--ok)' }], rejected: ['반려', { background: 'var(--bad-soft)', color: 'var(--bad)' }] };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isFinal ? '1fr 1fr' : '1fr 1fr', gap: 18 }}>
      <div className="card">
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>출퇴근 시각 수정 요청 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>잘못 눌렀을 때 · 총괄 승인 후 변경</span></h3>
        {myRows.length ? <form action={async fd => { const x = await requestCorrection(fd); setMsg(x.msg); if (x.ok) r.refresh(); }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <select name="attendance_id">{myRows.map(x => <option key={x.id} value={x.id}>{x.work_date} ({x.check_in?.slice(0, 5) ?? '-'} / {x.check_out?.slice(0, 5) ?? '-'})</option>)}</select>
          <select name="field"><option value="check_in">출근 시각</option><option value="check_out">퇴근 시각</option></select>
          <input type="time" name="new_time" required />
          <input name="reason" placeholder="사유 (필수)" required style={{ gridColumn: '1 / 3' }} />
          <button className="btn">요청</button>
        </form> : <div style={{ fontSize: 13, color: 'var(--muted)' }}>최근 7일 출퇴근 기록이 없습니다.</div>}
        {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg.includes('요청됨') || msg.includes('승인') ? 'var(--ok)' : 'var(--bad)' }}>{msg}</div>}
        {corrections.filter(c => c.user_id === me.id).length > 0 && <table style={{ marginTop: 12 }}><thead><tr><th>날짜</th><th>항목</th><th>변경</th><th>사유</th><th>상태</th></tr></thead><tbody>{corrections.filter(c => c.user_id === me.id).slice(0, 5).map(c => <tr key={c.id}><td>{rowsById[c.attendance_id] ?? '-'}</td><td>{c.field === 'check_in' ? '출근' : '퇴근'}</td><td style={{ fontVariantNumeric: 'tabular-nums' }}>{c.old_time?.slice(0, 5) ?? '-'} → <b>{c.new_time.slice(0, 5)}</b></td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.reason}</td><td><span className="pill" style={st[c.status][1]}>{st[c.status][0]}</span></td></tr>)}</tbody></table>}
      </div>
      {isFinal ? <div className="card">
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>수정 요청 승인 <span className="pill" style={pending.length ? { background: 'var(--bad-soft)', color: 'var(--bad)' } : undefined}>{pending.length}건 대기</span></h3>
        <table><thead><tr><th>이름</th><th>날짜</th><th>항목</th><th>변경</th><th>사유</th><th></th></tr></thead><tbody>
          {pending.map(c => <tr key={c.id}><td><b>{names[c.user_id] ?? '-'}</b></td><td>{rowsById[c.attendance_id] ?? '-'}</td><td>{c.field === 'check_in' ? '출근' : '퇴근'}</td><td style={{ fontVariantNumeric: 'tabular-nums' }}>{c.old_time?.slice(0, 5) ?? '-'} → <b>{c.new_time.slice(0, 5)}</b></td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.reason}</td>
            <td style={{ whiteSpace: 'nowrap' }}><button className="btn" style={{ padding: '4px 10px', fontSize: 12, background: 'var(--ok)' }} onClick={async () => { const x = await decideCorrection(c.id, 'approved'); setMsg(x.msg); r.refresh(); }}>승인</button> <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={async () => { const x = await decideCorrection(c.id, 'rejected'); setMsg(x.msg); r.refresh(); }}>반려</button></td></tr>)}
          {pending.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>대기 중인 요청 없음</td></tr>}
        </tbody></table>
        {corrections.filter(c => c.status !== 'pending').length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>처리 완료 {corrections.filter(c => c.status !== 'pending').length}건 (감사 로그에 기록)</div>}
      </div> : <div className="card"><h3 style={{ margin: '0 0 8px', fontSize: 15 }}>안내</h3><div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>· 출근/퇴근은 실제 자리에 앉은 시각으로 기록합니다. 현재 시각보다 앞선 시각은 입력할 수 없습니다.<br />· 잘못 눌렀으면 좌측에서 수정 요청 → 총괄이 승인하면 변경되고 지각 여부도 다시 계산됩니다.<br />· 지각·무단결근은 총괄이 직접 승인합니다.</div></div>}
    </div>
  );
}
