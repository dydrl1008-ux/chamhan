'use client';
import { notify } from '@/components/Toast';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitKpi } from './actions';
type K = { calls: number; new_cnt: number; margin: number; margin_auto?: number; margin_manual?: number; kakao_db: number; overtime: boolean; new_margin: number; work_report: string | null; feedback: string | null } | null;
export default function KpiForm({ date, today, existing }: { date: string; today: string; existing: K }) {
  const r = useRouter(); const [msg, setMsg] = useState('');
  const box: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', background: 'var(--bg)' };
  const lab: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 };
  const big: React.CSSProperties = { fontSize: 18, fontWeight: 700 };
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{existing ? '제출 완료 · 수정 가능' : '작성'} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>퇴근 전 제출</span></h3>
        <input type="date" value={date} max={today} onChange={e => r.push(`/kpi?d=${e.target.value}`)} style={{ width: 160 }} />
      </div>
      <form action={async fd => { const x = await submitKpi(fd); { notify(x.msg); setMsg(x.msg); }; if (x.ok) r.refresh(); }} style={{ display: 'grid', gap: 14 }}>
        <input type="hidden" name="work_date" value={date} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <div style={box}><label style={lab}>콜 수</label><input name="calls" type="number" min={0} defaultValue={existing?.calls ?? ''} placeholder="0" style={big} /></div>
          <div style={box}><label style={lab}>신규 건수</label><input name="new_cnt" type="number" min={0} defaultValue={existing?.new_cnt ?? ''} placeholder="0" style={big} /></div>
          <div style={box}><label style={lab}>정산 자동 마진 <span style={{ color: 'var(--muted)' }}>(정산승인 ÷1.1 · 수정 불가)</span></label><div style={{ ...big, padding: '6px 0', color: (existing?.margin_auto ?? 0) < 0 ? 'var(--bad)' : 'inherit' }}>₩{Number(existing?.margin_auto ?? 0).toLocaleString('ko-KR')}</div></div>
          <div style={box}><label style={lab}>추가 마진 <span style={{ color: 'var(--muted)' }}>(정산 외 · 카페배포 등, 마이너스 가능)</span></label><input name="margin_manual" type="number" step={1} defaultValue={existing?.margin_manual ?? ''} placeholder="0" style={big} /></div>
          <div style={box}><label style={lab}>금일 카톡 DB</label><input name="kakao_db" type="number" min={0} defaultValue={existing?.kakao_db ?? ''} placeholder="0" style={big} /></div>
          <div style={box}><label style={lab}>신규 마진 <span style={{ color: 'var(--muted)' }}>(원)</span></label><input name="new_margin" type="number" step={1} defaultValue={existing?.new_margin ?? ''} placeholder="0" style={big} /></div>
          <div style={box}><label style={lab}>야근</label><select name="overtime" defaultValue={existing?.overtime ? '1' : '0'} style={big}><option value="0">없음</option><option value="1">야근</option></select></div>
        </div>
        <div><label style={lab}>업무량 미달 사유 OR 해당 일자 업무 보고</label><textarea name="work_report" rows={4} defaultValue={existing?.work_report ?? ''} placeholder="오전 / 오후 진행 업무, 연장·CS·신규 영업 내용" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }} /></div>
        <div><label style={lab}>느낀점 · 건의사항</label><textarea name="feedback" rows={2} defaultValue={existing?.feedback ?? ''} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }} /></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button className="btn">{existing ? '수정 제출' : '제출'}</button>{msg && <span style={{ fontSize: 13, color: msg.includes('실패') || msg.includes('없') ? 'var(--bad)' : 'var(--ok)' }}>{msg}</span>}</div>
      </form>
    </div>
  );
}
