'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { testConnection, saveFieldMap, syncNow, saveEmplMap } from './actions';
import { addDays } from '@/lib/date/kst';
type Run = { id: number; started_at: string; finished_at: string | null; ok: boolean | null; message: string | null; rows_fetched: number; rows_applied: number; range_from: string | null; range_to: string | null; triggered_by: string | null };
const FIELDS: [string, string][] = [['settle_no', '정산번호 (중복 방지 키)'], ['empl_id', '담당자 ID'], ['req_date', '요청일'], ['profit', '영업이익'], ['status', '진행상태']];
export default function SettlementAdmin({ map, vat, runs, emplIds, maps, people, total, today, envReady }: { map: Record<string, string>; vat: string; runs: Run[]; emplIds: string[]; maps: { empl_id: string; user_id: string | null }[]; people: { id: string; name: string; email: string }[]; total: number; today: string; envReady: boolean }) {
  const r = useRouter(); const [test, setTest] = useState<any>(null); const [busy, setBusy] = useState(false); const [from, setFrom] = useState(addDays(today, -7)); const [to, setTo] = useState(today);
  const keys: string[] = test?.keys ?? Object.values(map).filter(Boolean);
  const auto = (empl: string) => people.find(p => p.email.split('@')[0] === empl);
  const mapped = !!(map.settle_no && map.empl_id && map.req_date && map.profit && map.status);
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>정산 연동 <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>lchkgy.com 정산승인 → 담당자·요청일별 영업이익 ÷{vat} → KPI 자동 마진 · 누적 {total.toLocaleString()}건</span></h1>
      {!envReady && <div style={{ background: 'var(--bad-soft)', color: 'var(--bad)', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>Vercel 환경변수 <b>SETTLE_CO_CODE · SETTLE_USER_ID · SETTLE_USER_PW</b>(정산 사이트 어드민 계정)가 없습니다. 추가 후 Redeploy.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>1. 연결 테스트 → 2. 필드 매핑</h3>
          <button className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); const x = await testConnection(); setBusy(false); setTest(x); notify(x.msg); }}>{busy ? '확인 중…' : '연결 테스트 (로그인 + 최근 30일 조회)'}</button>
          {test?.sample && <div style={{ marginTop: 10, fontSize: 12, background: 'var(--bg)', padding: 10, borderRadius: 8, maxHeight: 160, overflow: 'auto', fontFamily: 'monospace' }}>{JSON.stringify(test.sample, null, 1)}</div>}
          <form action={async fd => { const x = await saveFieldMap(fd); notify(x.msg); if (x.ok) r.refresh(); }} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {FIELDS.map(([k, l]) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 12.5 }}>{l}</span>{keys.length ? <select name={k} defaultValue={map[k] || test?.guess?.[k] || ''}><option value="">선택</option>{keys.map(x => <option key={x} value={x}>{x}{test?.sample ? ` = ${String(test.sample[x]).slice(0, 24)}` : ''}</option>)}</select> : <input name={k} defaultValue={map[k] ?? ''} placeholder="연결 테스트 후 선택" />}</div>)}
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 12.5 }}>승인 상태 값</span><input name="status_ok" defaultValue={map.status_ok ?? '승인완료'} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 12.5 }}>VAT 나누기</span><input name="vat" type="number" step="0.01" defaultValue={vat} /></div>
            <div><button className="btn">매핑 저장</button> <span style={{ fontSize: 12, color: mapped ? 'var(--ok)' : 'var(--bad)' }}>{mapped ? '매핑 완료' : '매핑 필요'}</span></div>
          </form></div>
        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>3. 동기화 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>매일 06:00 자동(최근 7일) + 수동</span></h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150 }} /><span>~</span><input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150 }} /><button className="btn" disabled={busy || !mapped} onClick={async () => { setBusy(true); const x = await syncNow(from, to); setBusy(false); notify(x.msg); r.refresh(); }}>{busy ? '실행 중…' : '지금 동기화'}</button></div>
            <table style={{ marginTop: 12, fontSize: 12.5 }}><thead><tr><th>시각</th><th>기간</th><th>결과</th><th>실행</th></tr></thead><tbody>{runs.map(x => <tr key={x.id}><td style={{ whiteSpace: 'nowrap' }}>{x.started_at.slice(5, 16).replace('T', ' ')}</td><td style={{ whiteSpace: 'nowrap' }}>{x.range_from?.slice(5)}~{x.range_to?.slice(5)}</td><td style={{ color: x.ok === false ? 'var(--bad)' : x.ok ? 'var(--ok)' : 'var(--muted)' }}>{x.message ?? '진행 중'}</td><td>{x.triggered_by}</td></tr>)}{runs.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>실행 이력 없음</td></tr>}</tbody></table></div>
          <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>4. 담당자 매핑 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>기본: 정산 담당자ID = 워크허브 이메일 앞부분. 다르면 여기서 지정</span></h3>
            <form action={async fd => { const x = await saveEmplMap(fd); notify(x.msg); if (x.ok) r.refresh(); }}><table style={{ fontSize: 13 }}><thead><tr><th>정산 담당자ID</th><th>워크허브 계정</th></tr></thead><tbody>
              {emplIds.map(e => { const m = maps.find(x => x.empl_id === e); const a = auto(e); return <tr key={e}><td><b>{e}</b><input type="hidden" name="empl_id" value={e} /></td><td><select name="user_id" defaultValue={m?.user_id ?? a?.id ?? ''}><option value="">— 미매핑 (KPI 반영 안 됨) —</option>{people.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email.split('@')[0]}){a?.id === p.id && !m ? ' · 자동' : ''}</option>)}</select></td></tr>; })}
              {emplIds.length === 0 && <tr><td colSpan={2} style={{ color: 'var(--muted)' }}>동기화 후 담당자 ID가 여기 나타납니다</td></tr>}</tbody></table>{emplIds.length > 0 && <button className="btn" style={{ marginTop: 10 }}>매핑 저장</button>}</form></div>
        </div>
      </div>
    </div>
  );
}
