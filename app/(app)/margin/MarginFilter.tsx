'use client';
import { useRouter } from 'next/navigation';
export default function MarginFilter({ teams, people, fTeam, fUser, canTeam, base }: { teams: { id: number; name: string }[]; people: { id: string; name: string; team_id: number | null; role: string }[]; fTeam: number; fUser: string; canTeam: boolean; base: { t: string; m: string } }) {
  const r = useRouter();
  const go = (team: number, u: string) => r.push(`/margin?t=${base.t}&m=${base.m}${team ? `&team=${team}` : ''}${u ? `&u=${u}` : ''}`);
  return <div style={{ display: 'flex', gap: 6 }}>
    {canTeam && <select value={fTeam} onChange={e => go(Number(e.target.value), '')} style={{ width: 120, padding: '6px 10px' }}><option value={0}>전체 팀</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
    <select value={fUser} onChange={e => go(fTeam, e.target.value)} style={{ width: 150, padding: '6px 10px' }}><option value="">전체 인원</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}{p.role === 'manager' ? ' (팀장)' : ''}</option>)}</select>
    {(fTeam || fUser) ? <button className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => go(0, '')}>초기화</button> : null}
  </div>;
}
