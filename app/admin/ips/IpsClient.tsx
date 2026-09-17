'use client';
import { useState } from 'react';
import { addIp, toggleIp } from './actions';
type R = { id: number; label: string; cidr: string; is_active: boolean; created_at: string };
export default function IpsClient({ rows, myIp }: { rows: R[]; myIp: string }) {
  const [msg, setMsg] = useState('');
  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 760 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>허용 IP</h1>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>현재 접속 IP <b style={{ fontFamily: 'monospace' }}>{myIp || '-'}</b></span><span style={{ fontSize: 12, color: 'var(--muted)' }}>변경은 최대 60초 후 적용 · 마지막 활성 IP를 끄면 본인도 차단됩니다</span></div>
      {msg && <div className="card" style={{ background: 'var(--accent-soft)' }}>{msg}</div>}
      <div className="card">
        <table><thead><tr><th>라벨</th><th>IP / CIDR</th><th>등록</th><th>활성</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td><b>{r.label}</b></td><td style={{ fontFamily: 'monospace' }}>{r.cidr}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.created_at.slice(0, 10)}</td>
            <td><input type="checkbox" checked={r.is_active} style={{ width: 'auto' }} onChange={async e => { const on = e.target.checked; if (!on && rows.filter(x => x.is_active).length === 1 && !confirm('마지막 활성 IP입니다. 끄면 모든 접속이 차단됩니다. 계속할까요?')) return; const res = await toggleIp(r.id, on); setMsg(res.msg); }} /></td></tr>)}</tbody></table>
        <form action={async fd => { const r = await addIp(fd); setMsg(r.msg); }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 14 }}>
          <input name="label" placeholder="라벨 (예: 참한기획 사무실)" /><input name="cidr" placeholder="IP 또는 CIDR (예: 211.205.68.33)" /><button className="btn">추가</button>
        </form>
      </div>
    </div>
  );
}
