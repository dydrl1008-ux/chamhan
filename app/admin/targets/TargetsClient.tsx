'use client';
import { notify } from '@/components/Toast';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveTargets } from './actions';
export default function TargetsClient({ month, people, teams, targets }: { month: string; people: { id: string; name: string; team_id: number | null; position: string | null }[]; teams: { id: number; name: string }[]; targets: { user_id: string | null; team_id: number | null; margin: number }[] }) {
  const r = useRouter(); const [msg, setMsg] = useState('');
  const tu = (id: string) => targets.find(t => t.user_id === id)?.margin ?? '';
  return (
    <form action={async fd => { const x = await saveTargets(fd); { notify(x.msg); setMsg(x.msg); }; if (x.ok) r.refresh(); }} style={{ display: 'grid', gap: 18, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h1 style={{ fontSize: 20, margin: 0 }}>월 목표 마진 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>월 = 전월 21일 ~ 당월 20일</span></h1><input type="month" name="month" value={month} onChange={e => r.push(`/admin/targets?m=${e.target.value}`)} style={{ width: 160 }} />{msg && <span style={{ fontSize: 13, color: 'var(--ok)' }}>{msg}</span>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>팀 목표 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>= 팀원 개인 목표 합계 (자동)</span></h3><table><tbody>{teams.map(t => <tr key={t.id}><td><b>{t.name}</b></td><td style={{ textAlign: 'right', fontWeight: 700 }}>₩{people.filter(p => p.team_id === t.id).reduce((a, p) => a + Number(targets.find(x => x.user_id === p.id)?.margin ?? 0), 0).toLocaleString('ko-KR')}</td></tr>)}</tbody></table></div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>개인 목표 (원) <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>팀장이 주간보고에서 배정 · 어드민은 조정만</span></h3><table><tbody>{people.map(p => <tr key={p.id}><td><b>{p.name}</b><div style={{ fontSize: 11, color: 'var(--muted)' }}>{teams.find(t => t.id === p.team_id)?.name} {p.position}</div></td><td><input type="hidden" name="user_id" value={p.id} /><input name="user_margin" type="number" defaultValue={tu(p.id)} placeholder="15000000" /></td></tr>)}</tbody></table></div>
      </div>
      <div><button className="btn">저장</button> <span style={{ fontSize: 12, color: 'var(--muted)' }}>영업 마진 탭·주간보고 달성률에 즉시 반영</span></div>
    </form>
  );
}
