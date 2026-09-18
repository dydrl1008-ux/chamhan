'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { loadApprove, previewApprove, doApprove } from './actions';
const w = (v: number) => '₩' + Math.round(v).toLocaleString('ko-KR');
export default function ApproveModal({ settlementSeq, onClose }: { settlementSeq: string; onClose: () => void }) {
  const r = useRouter(); const [st, setSt] = useState<{ d: any; row: any } | null>(null); const [err, setErr] = useState(''); const [amt, setAmt] = useState(''); const [remark, setRemark] = useState(''); const [busy, setBusy] = useState(false); const [calc, setCalc] = useState<any>(null);
  useEffect(() => { loadApprove(settlementSeq).then(x => { if (!x.ok) setErr(x.msg); else { setSt({ d: x.d, row: x.row }); setAmt(String(x.d.confirmAmt)); setCalc(x.d); } }).catch(e => setErr('불러오기 실패: ' + (e?.message ?? '서버 응답 없음(시간 초과)'))); }, [settlementSeq]);
  useEffect(() => { if (!st || st.d.refund || st.d.fixedAmt) return; const t = setTimeout(async () => { const x = await previewApprove(settlementSeq, Number(amt) || 0); if (x.ok) setCalc(x.d); }, 400); return () => clearTimeout(t); }, [amt, st, settlementSeq]);
  const submit = async () => { if (!st) return; try { if (!st.d.refund && !st.d.fixedAmt && amt.trim() === '') return notify('입금금액을 입력하세요', 'bad'); if (!confirm(`${settlementSeq} 승인 처리하시겠습니까?\n정산 사이트에 즉시 반영됩니다.`)) return; setBusy(true); const x = await doApprove(settlementSeq, st.d.refund || st.d.fixedAmt ? null : Number(amt) || 0, remark); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { onClose(); r.refresh(); } } catch (e: any) { setBusy(false); notify('전송 실패: ' + (e?.message ?? '시간 초과') + ' — 정산 사이트에서 상태를 확인하세요', 'bad'); } };
  const L = ({ l, v, c }: { l: string; v: React.ReactNode; c?: string }) => <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--line)' }}><span style={{ color: 'var(--muted)' }}>{l}</span><b style={{ color: c }}>{v}</b></div>;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,26,74,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div className="card" style={{ width: 520, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>정산 승인 <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--muted)' }}>{settlementSeq}</span></h3>
        {err && <div style={{ color: 'var(--bad)', fontSize: 13 }}>{err}</div>}
        {!st && !err && <div style={{ fontSize: 13, color: 'var(--muted)' }}>정산 사이트에서 불러오는 중…</div>}
        {st && calc && <>
          <div style={{ fontSize: 13, marginBottom: 10 }}>{st.row.empName} · {st.row.custName} · {st.row.prodName} · {st.row.reqGubunName}{st.d.refund ? ` (${st.row.gubunName})` : ''} · 요청일 {st.row.dispReqDate}</div>
          {st.d.refund ? <>
            <L l="환불 구분" v={st.d.gubunName} /><L l="환불일수" v={st.d.refundWorkDay + '일'} /><L l="환불금액(상품가)" v={w(Number(st.d.refundProdTotalAmt || 0))} /><L l="환불수수료(예정)" v={w(Number(st.d.refundExpectRateAmt || 0))} />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>환불 건은 정산 사이트가 환불금액·수수료를 자동 확정합니다 (입력 없음).</div>
          </> : <>
            <L l="상품총액 (상품가×유입수×작업일, VAT포함)" v={w(calc.prodTotalAmt)} /><L l="판매총액" v={w(calc.saleTotalAmt)} /><L l="사용 마일리지" v={w(calc.useMileage)} /><L l="입금예정 (판매총액−마일리지)" v={w(calc.expectedAmt)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}><span style={{ fontSize: 13, color: 'var(--bad)', fontWeight: 600 }}>입금금액 (실제 입금) *</span>{st.d.fixedAmt ? <b>{w(calc.confirmAmt)} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>고정</span></b> : <input type="number" value={amt} onChange={e => setAmt(e.target.value)} style={{ width: 170, textAlign: 'right' }} />}</div>
            <L l="적립 마일리지 (초과 입금분)" v={w(calc.confirmMileage)} /><L l="영업이익" v={w(calc.costAmt)} c={calc.costAmt < 0 ? 'var(--bad)' : undefined} /><L l={`담당자 확정수수료 (${st.d.prodIncentiveInd === 'Y' ? '상품별 예정액' : `영업이익 × ${calc.incentiveRate} ÷ 1.1`})`} v={w(calc.confirmRateAmt)} c="var(--accent)" />
          </>}
          <textarea value={remark} onChange={e => setRemark(e.target.value)} placeholder="비고 (선택)" rows={2} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: 8, marginTop: 10 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}><button className="btn ghost" onClick={onClose}>닫기</button><button className="btn" disabled={busy} onClick={submit}>{busy ? '전송 중…' : '승인'}</button></div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>승인 즉시 정산 사이트에 반영되고, 재조회로 승인완료를 확인한 뒤 워크허브에 기록됩니다. 되돌리려면 승인취소.</div>
        </>}
      </div>
    </div>
  );
}
