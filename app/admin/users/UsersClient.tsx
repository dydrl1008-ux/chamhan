'use client';
import { useState } from 'react';
import { inviteUser, updateUser, resetPassword } from './actions';
type U = { id: string; name: string; email: string; role: string; team_id: number | null; is_mgmt: boolean; position: string | null; hired_at: string | null; annual_leave_granted: number; is_active: boolean };
type T = { id: number; name: string; leader_id: string | null };
const roleName: Record<string, string> = { admin: '어드민', head: '총책임자', manager: '팀장', staff: '직원' };

export default function UsersClient({ users, teams }: { users: U[]; teams: T[] }) {
  const [msg, setMsg] = useState<{ t: string; temp?: string } | null>(null);
  const [edit, setEdit] = useState<U | null>(null);
  const tn = (id: number | null) => teams.find(t => t.id === id)?.name ?? '-';
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>사용자 · 팀</h1>
      {msg && <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>{msg.t}{msg.temp && <> · 임시 비밀번호 <b style={{ fontFamily: 'monospace' }}>{msg.temp}</b> <span style={{ fontSize: 12, color: 'var(--muted)' }}>(지금만 표시됩니다. 직원에게 전달 후 변경 안내)</span></>}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <div className="card">
          <table>
            <thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>팀</th><th>직급</th><th>연차</th><th>관리팀</th><th>상태</th><th></th></tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.id} style={{ opacity: u.is_active ? 1 : .5 }}>
                <td><b>{u.name}</b></td><td style={{ fontSize: 12.5, color: 'var(--muted)' }}>{u.email}</td>
                <td><span className="pill">{roleName[u.role]}</span></td><td>{tn(u.team_id)}</td><td>{u.position ?? '-'}</td><td>{u.annual_leave_granted}</td><td>{u.is_mgmt ? '○' : ''}</td>
                <td>{u.is_active ? '활성' : '비활성'}</td>
                <td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setEdit(u)}>편집</button> <button className="btn ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={async () => { if (!confirm(`${u.name} 비밀번호를 재발급할까요?`)) return; const r = await resetPassword(u.id); setMsg({ t: r.msg, temp: r.temp }); }}>비번 재발급</button></td>
              </tr>))}</tbody>
          </table>
          {users.length === 0 && <p style={{ color: 'var(--muted)' }}>아직 사용자가 없습니다. 우측에서 첫 어드민을 초대하세요.</p>}
        </div>
        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className="card">
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? `편집 — ${edit.name}` : '사용자 초대'}</h3>
            <form key={edit?.id ?? 'new'} action={async fd => { const r = edit ? await updateUser(fd) : await inviteUser(fd); setMsg({ t: r.msg, temp: (r as any).temp }); if (r.ok) setEdit(null); }} style={{ display: 'grid', gap: 10 }}>
              {edit && <input type="hidden" name="id" value={edit.id} />}
              {!edit && <><input name="name" placeholder="이름" required /><input name="email" type="email" placeholder="이메일" required /></>}
              <select name="role" defaultValue={edit?.role ?? 'staff'}><option value="staff">직원</option><option value="manager">팀장</option><option value="head">총책임자</option><option value="admin">어드민</option></select>
              <select name="team_id" defaultValue={edit?.team_id ?? ''}><option value="">팀 없음</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <input name="position" placeholder="직급 (사원/주임/대리/팀장…)" defaultValue={edit?.position ?? ''} />
              {!edit && <input name="hired_at" type="date" />}
              <input name="annual" type="number" step="0.5" placeholder="연차 부여" defaultValue={edit?.annual_leave_granted ?? 0} />
              <label style={{ fontSize: 13 }}><input type="checkbox" name="is_mgmt" defaultChecked={edit?.is_mgmt ?? false} style={{ width: 'auto', marginRight: 6 }} />관리팀</label>
              {edit && <label style={{ fontSize: 13 }}><input type="checkbox" name="is_active" defaultChecked={edit.is_active} style={{ width: 'auto', marginRight: 6 }} />활성 (해제 시 로그인 불가, 데이터는 보존)</label>}
              <div style={{ display: 'flex', gap: 8 }}><button className="btn">{edit ? '저장' : '초대 (임시 비밀번호 발급)'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>취소</button>}</div>
            </form>
          </div>
          <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>팀</h3><table><tbody>{teams.map(t => <tr key={t.id}><td>{t.name}</td><td style={{ color: 'var(--muted)', fontSize: 12.5 }}>팀장 {users.find(u => u.id === t.leader_id)?.name ?? '-'}</td><td style={{ textAlign: 'right' }}>{users.filter(u => u.team_id === t.id && u.is_active).length}명</td></tr>)}</tbody></table></div>
        </div>
      </div>
    </div>
  );
}
