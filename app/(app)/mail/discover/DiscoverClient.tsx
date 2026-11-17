'use client';
import { useState } from 'react';
import { notify } from '@/components/Toast';
import { poolState, discover, take, untake, type PoolRow } from './actions';
type St = { wait: number; taken: number; have: number; top: PoolRow[]; ad: boolean };
export default function DiscoverClient({ init, err }: { init: St | null; err: string }) {
  const [st, setSt] = useState<St | null>(init); const [msg, setMsg] = useState(err); const [busy, setBusy] = useState('');
  const [seeds, setSeeds] = useState(''); const [minVol, setMinVol] = useState('3000'); const [n, setN] = useState('100'); const [got, setGot] = useState<PoolRow[]>([]); const [log, setLog] = useState<string[]>([]);
  const reload = async () => { const r = await poolState(); if (r.ok) { setSt({ wait: r.wait, taken: r.taken, have: r.have, top: r.top, ad: r.ad }); setMsg(''); } else setMsg(r.msg); };
  const find = async (rounds: number) => {
    setBusy('find'); let total = 0;
    try { for (let i = 0; i < rounds; i++) { setBusy(`find${i + 1}/${rounds}`); const r = await discover(i === 0 ? seeds : '', Number(minVol)); if (!r.ok) { notify(r.msg, 'bad'); setMsg(r.msg); break; } total += r.added; setLog(l => [`${r.msg} — 씨앗: ${r.seeds.slice(0, 6).join(', ')}${r.seeds.length > 6 ? ' …' : ''}`, ...l].slice(0, 12)); }
      if (total) notify(`새 키워드 ${total}개 추가`, 'ok'); await reload(); }
    catch (e: any) { notify('오류: ' + String(e?.message ?? e).slice(0, 80), 'bad'); } finally { setBusy(''); }
  };
  const copy = async (t: string, ok: string) => { try { await navigator.clipboard.writeText(t); notify(ok, 'ok'); } catch { notify('자동 복사가 안 됐습니다 — 아래 칸에서 직접 복사해 주세요', 'bad'); } };
  const takeN = async () => { setBusy('take'); const r = await take(Number(n)); setBusy(''); if (!r.ok) return notify(r.msg, 'bad'); setGot(r.list); await copy(r.list.map(x => x.keyword).join(','), `${r.list.length}개 복사됨`); reload(); };
  const undo = async () => { if (!got.length) return; setBusy('undo'); const r = await untake(got.map(x => x.keyword)); setBusy(''); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { setGot([]); reload(); } };
  return <div style={{ display: 'grid', gap: 16 }}>
    {msg && <div className="card" style={{ color: '#B42318' }}>{msg}</div>}
    {st && !st.ad && <div className="card" style={{ color: '#B45309' }}>검색광고 API 환경변수가 없어 「키워드 찾기」가 동작하지 않습니다.</div>}
    <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14 }}>
      <div>이미 수집된 키워드 <b>{(st?.have ?? 0).toLocaleString()}</b></div><div>가져갈 수 있는 후보 <b>{(st?.wait ?? 0).toLocaleString()}</b></div><div>이미 가져간 것 <b>{(st?.taken ?? 0).toLocaleString()}</b></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <b>① 키워드 찾기</b>
        <div className="help">씨앗 키워드의 연관 키워드를 검색광고 API로 받아, 아직 수집 안 된 것만 쌓습니다. 씨앗을 비워 두면 이미 수집된 키워드 중 25개를 무작위로 골라 씁니다 (누를 때마다 다른 묶음).</div>
        <label>씨앗 키워드 (선택 · 콤마나 줄바꿈, 최대 25개)<textarea value={seeds} onChange={e => setSeeds(e.target.value)} rows={3} placeholder="예: 과메기, 김장김치, 전기장판" /></label>
        <label>최소 월 검색량<input type="number" value={minVol} onChange={e => setMinVol(e.target.value)} style={{ width: 140 }} /></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={!!busy} onClick={() => find(1)}>{busy.startsWith('find') ? `찾는 중 ${busy.slice(4)}` : '키워드 찾기'}</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => find(5)} title="무작위 씨앗으로 5번 연달아 찾습니다 (1~2분)">5번 연달아 찾기</button>
        </div>
        {log.length > 0 && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--bg)', padding: 10, borderRadius: 8, margin: 0 }}>{log.join('\n')}</pre>}
      </div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <b>② 가져가기</b>
        <div className="help">검색량 높은 순으로 가져와 콤마로 이어 복사합니다. 가져간 키워드는 다음 목록에서 빠집니다.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" min={1} max={500} value={n} onChange={e => setN(e.target.value)} style={{ width: 90 }} /><span className="help">개</span>
          <button type="button" className="btn" disabled={!!busy || !(st?.wait)} onClick={takeN}>{busy === 'take' ? '가져오는 중…' : '가져가기 (복사)'}</button>
          {got.length > 0 && <><button type="button" className="btn ghost" disabled={!!busy} onClick={() => copy(got.map(x => x.keyword).join(','), '다시 복사됨')}>다시 복사</button><button type="button" className="btn ghost" disabled={!!busy} onClick={undo} title="안 쓸 거면 되돌려서 다음 목록에 다시 나오게">되돌리기</button></>}
        </div>
        {got.length > 0 && <textarea readOnly rows={6} value={got.map(x => x.keyword).join(',')} onFocus={e => e.currentTarget.select()} style={{ fontSize: 13 }} />}
      </div>
    </div>
    <div className="card">
      <b>다음에 나올 후보 (검색량 순 상위 {st?.top.length ?? 0}개)</b>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{(st?.top ?? []).map(r => <span key={r.keyword} className="chip" title={`씨앗: ${r.seed}`}>{r.keyword} <span style={{ color: 'var(--muted)' }}>{r.vol.toLocaleString()}</span></span>)}
        {st && !st.top.length && <span className="help">아직 후보가 없습니다 — 「키워드 찾기」를 눌러 주세요</span>}</div>
    </div>
  </div>;
}
