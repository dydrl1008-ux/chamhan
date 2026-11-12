'use client';
import { useState } from 'react';
import { notify } from '@/components/Toast';
import { manualPlan, manualExport, type ManualRow, type Tpl } from '../actions';

const A: Tpl = { subject: "{업체명} '{키워드}' 지수 확인 후 연락드립니다 — 회신만 주셔도 테스트부터 봐드립니다", body: `안녕하세요, {업체명} 대표님. {담당자}입니다.

'{키워드}' 검색 결과에서 {업체명} 상품을 보고 연락드립니다.

저희는 키워드마다 상위 100개 상품을 클릭지수·판매지수·리뷰지수로 쪼개서 봅니다.
'{키워드}'는 상위 10개와 그 아래가 리뷰 수로 갈리는 게 아니라 클릭·유입 지수에서 벌어지는 키워드고, 그 지수를 채우면 올라가는 구조입니다.
어느 지수가 비는지, 상위 10개는 어디까지 채워져 있는지 한 장씩 정리했습니다.
아래는 해당 제안서 내용입니다.
{제안서링크}

저희 일은 그 비는 지수를 메우고 고객들에게 상품을 노출하는 겁니다.
진행 중에는 순위를 매일 확인하고, 변동은 주간 리포트로 공유하며, 요청은 당일 반영합니다.

자료 보시고 이 메일에 회신 주시면 {업체명} 상품 기준으로 어느 지수가 비는지 바로 짚어드리겠습니다.
카카오톡이 편하시면 아래 오픈채팅으로 주셔도 됩니다.
{오픈채팅}

꼭 읽어보시고 회신주세요.` };
const B: Tpl = { subject: "{업체명} '{키워드}' 상위 10개와 벌어진 지수, 한 장으로 정리했습니다", body: `안녕하세요, {업체명} 대표님. {담당자}입니다.

'{키워드}'에서 {업체명} 상품을 보고 연락드립니다.

같은 키워드 상위 100개를 클릭·판매·리뷰 지수로 나눠 보면, 상위 10개와 그 아래는 리뷰 수가 아니라 클릭·유입 지수에서 갈립니다. '{키워드}'도 그 구조입니다.
{업체명} 상품은 어느 지수가 비는지, 상위 10개는 어디까지 채워져 있는지 아래 자료에 정리했습니다.
{제안서링크}

저희는 그 비는 지수를 채워 상품을 노출시키는 일을 합니다. 진행 중엔 순위를 매일 확인하고, 변동은 주간 리포트로, 요청은 당일 반영합니다.

회신 주시면 {업체명} 기준으로 비는 지수부터 짚어드리겠습니다.` };
const C: Tpl = { subject: "'{키워드}' {업체명} 순위, 리뷰 문제가 아닙니다", body: `안녕하세요, {업체명} 대표님. {담당자}입니다.

'{키워드}' 검색 결과를 보다가 {업체명} 상품에서 멈춰서 연락드립니다.

'{키워드}' 상위 100개를 지수별로 놓고 보면 리뷰가 많은 상품이 위에 있는 게 아닙니다. 상위 10개를 가르는 건 클릭·유입 지수고, 그 지수가 채워지면 순위가 움직입니다.
{업체명} 상품은 지금 어느 지수가 비어 있는지, 상위 10개 기준선은 어디인지 정리했습니다.
{제안서링크}

저희는 그 지수를 채우는 작업을 합니다. 매일 순위 확인, 주간 리포트, 요청 당일 반영이 기본입니다.

회신 주시면 {업체명} 상품 기준으로 먼저 봐드리겠습니다.` };

export default function ExportClient({ owner: o0, phone: p0 }: { owner: string; phone: string }) {
  const [total, setTotal] = useState(1000); const [per, setPer] = useState(50); const [owner, setOwner] = useState(o0); const [phone, setPhone] = useState(p0);
  const [basic, setBasic] = useState(''); const [rec, setRec] = useState(''); const [kakao, setKakao] = useState('https://open.kakao.com/o/saz4cuKi'); const [onlyA, setOnlyA] = useState(true);
  const [tpl, setTpl] = useState(A); const [tplB, setTplB] = useState(B); const [tplC, setTplC] = useState(C);
  const [busy, setBusy] = useState(false); const [log, setLog] = useState<string[]>([]); const [plan, setPlan] = useState<{ keyword: string; n: number }[] | null>(null);
  const T = ({ v, set, label }: { v: Tpl; set: (t: Tpl) => void; label: string }) => <div className="card" style={{ display: 'grid', gap: 8 }}><div style={{ fontWeight: 800 }}>{label}</div><input value={v.subject} onChange={e => set({ ...v, subject: e.target.value })} placeholder="제목" /><textarea value={v.body} onChange={e => set({ ...v, body: e.target.value })} rows={12} style={{ fontSize: 13, lineHeight: 1.6 }} /></div>;

  const doPlan = async () => { setBusy(true); const r = await manualPlan(total, per); setBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok && r.plan) { setPlan(r.plan); setLog([`보낼 수 있는 대상 ${r.available}건 중 ${r.plan.reduce((a, p) => a + p.n, 0)}건 배분 (키워드당 최대 ${per})`]); } };
  const run = async () => {
    if (!plan?.length) return notify('먼저 「대상 확인」', 'bad');
    if (!confirm(`${plan.reduce((a, p) => a + p.n, 0)}건 엑셀을 만듭니다. 워크허브에는 기록되지 않습니다. 진행할까요?`)) return;
    setBusy(true); const rows: ManualRow[] = []; let no = 1; const lg: string[] = [];
    for (const p of plan) {
      const r = await manualExport({ keyword: p.keyword, n: p.n, owner, phone, offer: { basic, rec }, tpl, tplB, tplC, startNo: no, kakao });
      lg.push(`${r.ok ? '✓' : '✕'} ${r.msg}`); setLog([...lg]);
      if (r.ok && r.rows) { rows.push(...r.rows); no += r.rows.length; }
    }
    setBusy(false);
    if (!rows.length) return notify('뽑힌 행이 없습니다', 'bad');
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows.map(r => onlyA
      ? { 번호: r.no, 스토어명: r.store, 메일주소: r.email, 키워드: r.keyword, 현재순위: r.rank, 제목: r.subject, 본문: r.body, 제안서링크: r.link, 수신거부링크: r.unsub, 발송계정: '', 발송일: '', 비고: '' }
      : { 번호: r.no, 스토어명: r.store, 메일주소: r.email, 키워드: r.keyword, 현재순위: r.rank, '제목 A': r.subject, '본문 A': r.body, '제목 B': r.subjectB, '본문 B': r.bodyB, '제목 C': r.subjectC, '본문 C': r.bodyC, 제안서링크: r.link, 수신거부링크: r.unsub, 발송계정: '', 발송일: '', 비고: '' }));
    ws['!cols'] = (onlyA ? [4, 22, 30, 14, 8, 50, 70, 46, 46, 18, 12, 20] : [4, 22, 30, 14, 8, 50, 70, 50, 70, 50, 70, 46, 46, 18, 12, 20]).map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '발송');
    const ws2 = XLSX.utils.json_to_sheet(plan.map(p => ({ 키워드: p.keyword, 건수: p.n })));
    XLSX.utils.book_append_sheet(wb, ws2, '키워드별');
    const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
    XLSX.writeFile(wb, `메일발송_수동_${d}_${rows.length}건.xlsx`);
    notify(`${rows.length}건 엑셀 저장됨`, 'ok'); setPlan(null);
  };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <label>총 건수<input type="number" value={total} onChange={e => setTotal(Number(e.target.value))} /></label>
        <label>키워드당 최대<input type="number" value={per} onChange={e => setPer(Number(e.target.value))} /></label>
        <label>담당자 (서명)<input value={owner} onChange={e => setOwner(e.target.value)} /></label>
        <label>연락처<input value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <label>제안서 기본 가격<input value={basic} onChange={e => setBasic(e.target.value)} placeholder="비우면 담당자 안내" /></label>
        <label>제안서 추천 가격<input value={rec} onChange={e => setRec(e.target.value)} placeholder="비우면 담당자 안내" /></label>
        <label>오픈채팅 링크 ({'{오픈채팅}'})<input value={kakao} onChange={e => setKakao(e.target.value)} placeholder="https://open.kakao.com/o/…" /></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'end' }}><input type="checkbox" checked={onlyA} onChange={e => setOnlyA(e.target.checked)} style={{ width: 'auto' }} /> A형만 (제목·본문 1칸)</label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <T v={tpl} set={setTpl} label="A (기본)" />{!onlyA && <><T v={tplB} set={setTplB} label="B (변형)" /><T v={tplC} set={setTplC} label="C (변형)" /></>}
      </div>
      <div className="help">변수: {'{업체명} {키워드} {순위} {담당자} {연락처} {제안서링크} {수신거부링크} {오픈채팅}'}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn ghost" disabled={busy} onClick={doPlan}>{busy ? '확인 중…' : '1. 대상 확인'}</button>
        <button className="btn" disabled={busy || !plan} onClick={run}>{busy ? '만드는 중…' : '2. 엑셀 받기'}</button>
        {plan && <span className="help">키워드 {plan.length}개 · {plan.reduce((a, p) => a + p.n, 0)}건</span>}
      </div>
      {plan && <div className="card" style={{ fontSize: 13, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{plan.map(p => <span key={p.keyword} className="chip">{p.keyword} {p.n}</span>)}</div>}
      {log.length > 0 && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, background: 'var(--bg)', padding: 12, borderRadius: 8, margin: 0 }}>{log.join('\n')}</pre>}
    </div>
  );
}
