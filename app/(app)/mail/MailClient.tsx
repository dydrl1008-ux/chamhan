'use client';
// 메일 발송 — ① 키워드 대상(이메일 있는 업체) ② 체크 ③ 제안서 만들어 미리보기 ④ 제목/본문 ⑤ 본인 PC 의 SNS_Manager 가 본인 네이버 계정으로 발송. 회신은 10분마다 SNS_Manager IMAP 확인
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { PageHeader, Section, Empty, Status } from '@/components/ui';
import ProposalDoc, { PD_CSS, docPageCount } from '@/components/ProposalDoc';
import { fmtKST } from '@/lib/date/kst';
import { fillVars, MAIL_VARS } from '@/lib/mail';
import { agentHealth, agentPost, type AgentHealth } from '@/lib/snsAgent';
import type { Doc } from '@/lib/proposalDoc';
import { loadKeywords, loadCandidates, makeDoc, prepareSend, failQueued, saveTemplate, cancelQueued, replyPayload, ingestReplies, type Candidate, type AgentJob } from './actions';

type Hist = { id: number; target?: { phone: string; store_url: string } | null; to_email: string; store_name: string; keyword: string; status: string; error: string | null; queued_at: string; sent_at: string | null; opened_at: string | null; open_cnt: number; replied_at: string | null; proposal_code: string | null };
type Acct = { id: number; email: string; provider: string; today: number; limit: number };
type Prog = { running: boolean; total: number; done: number; ok: number; fail: number; current: string; log: string[] };
const ST: Record<string, [string, 'ok' | 'wait' | 'bad' | 'off']> = { queued: ['대기', 'wait'], sending: ['발송 중', 'wait'], sent: ['완료', 'ok'], failed: ['실패', 'bad'], skipped: ['취소', 'off'] };

export default function MailClient({ me, accounts, tpl, hist, teamHist = [], base = '', days, initialKw, highlight = 0 }: { highlight?: number; me: { name: string; phone: string }; accounts: Acct[]; tpl: { subject: string; body: string }; hist: Hist[]; teamHist?: (Hist & { sender: string; subject: string })[]; base?: string; days: number; initialKw: string }) {
  const [who, setWho] = useState('');
  const [acctId, setAcctId] = useState<number>(accounts.find(a => a.today < a.limit)?.id ?? accounts[0]?.id ?? 0);
  const account = accounts.find(a => a.id === acctId) ?? null;
  const r = useRouter();
  const [agent, setAgent] = useState<AgentHealth | null>(null);
  const [kws, setKws] = useState<{ keyword: string; n: number }[]>([]);
  const [kw, setKw] = useState(initialKw); const [loadedKw, setLoadedKw] = useState('');
  const [rows, setRows] = useState<Candidate[]>([]); const [sel, setSel] = useState<Set<number>>(new Set());
  const [owner, setOwner] = useState(me.name); const [phone, setPhone] = useState(me.phone); const [basic, setBasic] = useState(''); const [rec, setRec] = useState('');
  const [doc, setDoc] = useState<Doc | null>(null);
  const [subject, setSubject] = useState(tpl.subject); const [body, setBody] = useState(tpl.body);
  const [busy, setBusy] = useState(''); const [prog, setProg] = useState<Prog | null>(null); const [skipped, setSkipped] = useState<string[]>([]);
  const wrap = useRef<HTMLDivElement>(null); const pollRef = useRef<any>(null);

  const eligible = (c: Candidate) => !!c.email && !c.optout && !c.replied && !c.ours && !c.interest && !c.recent_by;
  const reason = (c: Candidate) => !c.email ? '이메일 없음' : c.optout ? '수신거부' : c.replied ? '회신 업체' : c.ours ? c.ours : c.interest ? `${c.interest} 고객` : c.recent_by ? `${c.recent_by} ${c.recent_at ? fmtKST(c.recent_at) : ''} 발송` : '';

  // SNS_Manager 상태 + 키워드 목록 + 회신 확인
  useEffect(() => {
    agentHealth().then(setAgent); loadKeywords().then(x => { if (x.ok) setKws(x.rows!); });
    if (initialKw) load(initialKw);
    if (highlight) setTimeout(() => document.getElementById('mq-' + highlight)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    const t = setInterval(() => agentHealth().then(setAgent), 60_000);
    checkReplies(false); const t2 = setInterval(() => checkReplies(false), 10 * 60_000);
    return () => { clearInterval(t); clearInterval(t2); if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line
  }, []);

  const checkReplies = async (force: boolean) => {
    if (!accounts.length) { if (force) notify('메일 계정을 먼저 연결하세요', 'bad'); return; }
    const p = await replyPayload(force); if (!p.ok || !p.accounts) { if (force && p.msg !== 'recent') notify(p.msg, 'bad'); return; }
    let matched = 0, scanned = 0;
    for (const a of p.accounts) {
      try {
        const res = await agentPost('/mail/wh-replies', { email: a.email, password: a.password, last_uid: a.last_uid, since_days: 30, known_emails: a.known_emails }, 120_000);
        if (!res?.ok) { if (force) notify(`${a.email} 회신 확인 실패: ` + (res?.error || 'SNS_Manager 응답 없음'), 'bad'); continue; }
        const x = await ingestReplies(a.id, res.replies ?? [], res.last_uid ?? a.last_uid); matched += x.matched ?? 0; scanned += res.scanned ?? 0;
      } catch { if (force) notify('SNS_Manager 에 연결할 수 없음 — 켜져 있는지 확인', 'bad'); return; }
    }
    if (matched) { notify(`회신 ${matched}건 — 콜 리스트에 올렸습니다`, 'ok'); r.refresh(); } else if (force) notify(`새 회신 없음 (확인 ${scanned}통)`, 'ok');
  };

  const load = async (k = kw) => {
    const key = k.trim(); if (!key) return; setBusy('load'); setDoc(null);
    const x = await loadCandidates(key); setBusy('');
    if (!x.ok) { notify(x.msg, 'bad'); return; }
    setRows(x.rows!); setLoadedKw(key); setSel(new Set(x.rows!.filter(eligible).map(c => c.id)));
    if (!x.rows!.length) notify('이 키워드로 수집된 이메일 업체가 없습니다', 'bad');
  };
  const mkDoc = async () => { if (!loadedKw) return; setBusy('doc'); const x = await makeDoc(loadedKw, owner, phone, { basic, rec }); setBusy(''); if (x.ok && x.doc) { setDoc(x.doc); setTimeout(() => wrap.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); } else notify(x.msg, 'bad'); };

  const poll = (jobTotal: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await agentPost<Prog>('/mail/wh-status', {}, 5000); setProg(s);
        if (!s.running) { clearInterval(pollRef.current); pollRef.current = null; setBusy(''); notify(`발송 종료 — 성공 ${s.ok} · 실패 ${s.fail}`, s.fail ? 'bad' : 'ok'); r.refresh(); }
      } catch { /* 잠깐 끊김 — 다음 폴링 */ }
    }, 2000);
    setProg({ running: true, total: jobTotal, done: 0, ok: 0, fail: 0, current: '', log: [] });
  };

  const send = async () => {
    if (!doc) { notify('제안서를 먼저 만들어 확인하세요', 'bad'); return; }
    const ids = [...sel]; if (!ids.length) { notify('대상을 선택하세요', 'bad'); return; }
    const h = await agentHealth(); setAgent(h);
    if (!h.up) { notify('SNS_Manager 가 꺼져 있습니다 — 켜고 다시 누르세요', 'bad'); return; }
    if (!h.mailWh) { notify('SNS_Manager 구버전 — 메일 기능이 있는 새 exe 로 교체 필요', 'bad'); return; }
    if (!account) { notify('발신 계정을 선택하세요', 'bad'); return; }
    if (!confirm(`${ids.length}곳에 '${loadedKw}' 제안서 메일을 보냅니다. 본인 PC · ${account.email} 으로 나갑니다.`)) return;
    setBusy('send'); setSkipped([]);
    const p = await prepareSend({ keyword: loadedKw, ids, subject, body, doc, owner, phone, accountId: account.id });
    if (!p.ok || !p.job) { setBusy(''); notify(p.msg, 'bad'); setSkipped(p.skipped ?? []); return; }
    setSkipped(p.skipped ?? []);
    const job: AgentJob = p.job;
    try {
      const res = await agentPost('/mail/wh-send', job, 15_000);
      if (!res?.ok) { await failQueued(job.items.map(i => i.id), 'SNS_Manager 거부: ' + (res?.error || '')); setBusy(''); notify('발송 시작 실패: ' + (res?.error || ''), 'bad'); r.refresh(); return; }
      notify(p.msg, 'ok'); poll(job.items.length);
    } catch {
      await failQueued(job.items.map(i => i.id), 'SNS_Manager 연결 실패'); setBusy(''); notify('SNS_Manager 에 연결할 수 없음', 'bad'); r.refresh();
    }
  };
  const stop = async () => { try { await agentPost('/mail/wh-stop', {}); notify('중단 요청', 'ok'); } catch { notify('SNS_Manager 연결 실패', 'bad'); } };

  const sample = rows.find(c => sel.has(c.id)) ?? rows[0];
  const vars = sample ? { 업체명: sample.store_name || '담당자', 키워드: loadedKw, 순위: sample.rank_now ? `${sample.rank_now}위` : '-', 담당자: owner || me.name, 연락처: phone, 제안서링크: '(발송 시 수신자마다 다른 제안서 링크)', 수신거부링크: '(수신자별 수신거부 링크)' } : null;
  const nSel = sel.size, nElig = rows.filter(eligible).length;

  return <div style={{ display: 'grid', gap: 14 }}>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
    <style dangerouslySetInnerHTML={{ __html: PD_CSS }} />
    <PageHeader title="메일 발송" desc={`키워드 업체 중 이메일 있는 곳에 제안서 링크 발송 · 본인 PC(SNS_Manager)에서 본인 네이버/지메일 계정으로 · 계정당 하루 ${accounts[0]?.limit ?? 200}건 · 누가 보냈든 ${days}일 내 발송 제외`}
      actions={<span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {accounts.length ? <select value={acctId} onChange={e => setAcctId(Number(e.target.value))} style={{ padding: '4px 8px', fontSize: 13 }}>{accounts.map(a => <option key={a.id} value={a.id}>{a.email} · 오늘 {a.today}/{a.limit}{a.today >= a.limit ? ' (상한)' : ''}</option>)}</select> : <a href="/me" className="btn ghost" style={{ padding: '4px 10px' }}>내 정보에서 메일 계정 연결 →</a>}
        {agent === null ? <Status kind="off">SNS_Manager 확인 중</Status> : !agent.up ? <Status kind="bad">SNS_Manager 꺼짐</Status> : !agent.mailWh ? <Status kind="bad">SNS_Manager 구버전 (교체 필요)</Status> : <Status kind="ok">SNS_Manager 켜짐</Status>}
        <button type="button" className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => checkReplies(true)}>회신 확인</button>
      </span>} />

    {/* ① 키워드 */}
    <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>키워드 <span style={{ fontWeight: 400 }}>(수집된 키워드만 · 괄호는 이메일 업체 수)</span>
        <input list="mail-kws" value={kw} onChange={e => setKw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }} placeholder="예: 과메기" style={{ width: 240 }} />
        <datalist id="mail-kws">{kws.map(k => <option key={k.keyword} value={k.keyword}>{`${k.n}곳`}</option>)}</datalist></label>
      <button type="button" className="btn" disabled={busy === 'load'} onClick={() => load()}>{busy === 'load' ? '불러오는 중…' : '대상 불러오기'}</button>
      {kws.length > 0 && <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3, marginLeft: 'auto' }}>전체 키워드 {kws.length}개 <span style={{ fontWeight: 400 }}>(이메일 업체 많은 순)</span>
        <select value={kws.some(k => k.keyword === loadedKw) ? loadedKw : ''} onChange={e => { if (!e.target.value) return; setKw(e.target.value); load(e.target.value); }} style={{ minWidth: 260 }}>
          <option value="">— 골라서 바로 불러오기</option>{kws.map(k => <option key={k.keyword} value={k.keyword}>{k.keyword} · {k.n}곳</option>)}</select></label>}
    </div>

    {/* ② 대상 */}
    {loadedKw && <Section title={`② 대상 — '${loadedKw}'`} sub={`${rows.length}곳 · 보낼 수 있음 ${nElig} · 선택 ${nSel}`} flush
      right={<span style={{ display: 'flex', gap: 6 }}><button type="button" className="btn ghost xs" onClick={() => setSel(new Set(rows.filter(eligible).map(c => c.id)))}>가능한 곳 전체</button><button type="button" className="btn ghost xs" onClick={() => setSel(new Set())}>선택 해제</button></span>}>
      {rows.length === 0 ? <div style={{ padding: 16 }}><Empty>이 키워드로 수집된 이메일 업체가 없습니다 (수집기 → 메일 대상)</Empty></div> :
        <div style={{ maxHeight: 420, overflow: 'auto' }}><table><thead><tr><th style={{ width: 34 }}></th><th>업체</th><th className="num">순위</th><th className="num">리뷰</th><th>이메일</th><th>전화</th><th>상태</th></tr></thead><tbody>
          {rows.map(c => { const ok = eligible(c); return <tr key={c.id} style={{ opacity: ok ? 1 : .55 }}>
            <td><input type="checkbox" disabled={!ok} checked={sel.has(c.id)} onChange={e => { const s = new Set(sel); e.target.checked ? s.add(c.id) : s.delete(c.id); setSel(s); }} /></td>
            <td><b>{c.store_name}</b>{c.store_url && <a href={c.store_url} target="_blank" rel="noreferrer" className="cell-sub" style={{ marginLeft: 6 }}>열기</a>}</td>
            <td className="num">{c.rank_now ?? '-'}</td><td className="num">{c.review_cnt ?? '-'}</td>
            <td style={{ fontSize: 12.5 }}>{c.email}</td><td className="cell-sub">{c.phone || '-'}</td>
            <td>{ok ? <Status kind="ok">가능</Status> : <Status kind={c.recent_by ? 'wait' : 'off'}>{reason(c)}</Status>}</td></tr>; })}
        </tbody></table></div>}
    </Section>}

    {/* ③ 제안서 */}
    {loadedKw && rows.length > 0 && <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <b style={{ fontSize: 13, alignSelf: 'center' }}>③ 제안서</b>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>담당자<input value={owner} onChange={e => setOwner(e.target.value)} style={{ width: 90 }} /></label>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>연락처<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" style={{ width: 140 }} /></label>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>기본 가격<input value={basic} onChange={e => setBasic(e.target.value)} placeholder="비우면 담당자 안내" style={{ width: 130 }} /></label>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>권장 가격<input value={rec} onChange={e => setRec(e.target.value)} placeholder="예: 30만원 / 10일" style={{ width: 130 }} /></label>
      <button type="button" className="btn" disabled={busy === 'doc'} onClick={mkDoc}>{busy === 'doc' ? '만드는 중…' : doc ? '다시 만들기' : '제안서 만들기 (미리보기)'}</button>
      <span className="cell-sub">시크릿 지수 오늘 데이터로 시장 분석 제안서 · 받는 사람 모두 같은 제안서(링크만 수신자별)</span>
    </div>}
    {doc && <div ref={wrap} className="card" style={{ padding: 10 }}>
      <div className="cell-sub" style={{ marginBottom: 6 }}>받는 사람이 링크로 보게 될 제안서 {docPageCount(doc)}장 — 확인 후 아래에서 발송</div>
      <div style={{ overflowX: 'auto', maxHeight: 640, overflowY: 'auto', background: '#E9ECF3', padding: 10, borderRadius: 8 }}><ProposalDoc d={doc} total={docPageCount(doc)} img={u => `/api/img?u=${encodeURIComponent(u)}`} /></div>
    </div>}

    {/* ④ 제목/본문 + ⑤ 발송 */}
    {loadedKw && rows.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14 }}>
      <div className="card" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
        <b style={{ fontSize: 13 }}>④ 제목 · 본문 <span className="cell-sub" style={{ fontWeight: 400 }}>변수: {MAIL_VARS.join(' ')}</span></b>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="제목" />
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={14} style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><button type="button" className="btn ghost xs" onClick={async () => { const x = await saveTemplate(subject, body); notify(x.msg, x.ok ? 'ok' : 'bad'); }}>내 템플릿으로 저장</button><span className="cell-sub">수신거부 링크는 꼭 남겨두세요</span></div>
      </div>
      <div className="card" style={{ padding: '12px 14px', display: 'grid', gap: 8, alignContent: 'start' }}>
        <b style={{ fontSize: 13 }}>받는 사람이 보는 예시 {sample && <span className="cell-sub" style={{ fontWeight: 400 }}>· {sample.store_name}</span>}</b>
        {vars ? <div style={{ fontSize: 13, background: 'var(--bg)', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 330, overflow: 'auto' }}><b>{fillVars(subject, vars)}</b>{'\n\n'}{fillVars(body, vars)}</div> : <Empty>대상 없음</Empty>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={!!busy || !doc || !nSel || !account || account.today >= account.limit} onClick={send} style={{ background: '#03C75A', borderColor: '#03C75A' }}>{busy === 'send' ? '발송 중…' : `${nSel}건 발송`}</button>{account && <span className="cell-sub">{account.email} · 오늘 {account.today}/{account.limit}</span>}
          {prog?.running && <button type="button" className="btn ghost" onClick={stop}>중단</button>}
          {!doc && <span className="cell-sub">③ 제안서를 만들어 확인해야 발송 가능</span>}
        </div>
        {prog && <div style={{ fontSize: 12.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{prog.running ? '발송 중' : '종료'} · {prog.done}/{prog.total} · 성공 {prog.ok} · 실패 {prog.fail}</span><span className="cell-sub">{prog.current}</span></div>
          <div style={{ height: 8, background: 'var(--line)', borderRadius: 6, margin: '6px 0' }}><div style={{ width: `${prog.total ? Math.round(prog.done / prog.total * 100) : 0}%`, height: '100%', background: '#03C75A', borderRadius: 6 }} /></div>
          <div style={{ maxHeight: 120, overflow: 'auto', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--muted)' }}>{(prog.log ?? []).slice(-12).map((l, i) => <div key={i}>{l}</div>)}</div>
        </div>}
        {skipped.length > 0 && <div className="cell-sub">제외: {skipped.slice(0, 10).join(' · ')}{skipped.length > 10 ? ` 외 ${skipped.length - 10}` : ''}</div>}
      </div>
    </div>}

    <Section title="내 발송 기록" sub="최근 300건 · 열람 = 제안서 링크 열람 · 회신 = 답장 (콜 리스트 관심으로 자동 등록)" flush>
      {hist.length === 0 ? <div style={{ padding: 16 }}><Empty>아직 발송 없음</Empty></div> : <table><thead><tr><th>시각</th><th>업체</th><th>이메일</th><th>키워드</th><th>상태</th><th>열람</th><th>회신</th><th></th></tr></thead><tbody>
        {hist.map(h => { const [l, k] = ST[h.status] ?? [h.status, 'off']; return <tr key={h.id} id={`mq-${h.id}`} style={{ background: h.id === highlight ? '#FFF4C2' : h.replied_at ? 'var(--ok-soft)' : undefined, outline: h.id === highlight ? '2px solid #F59E0B' : undefined }}>
          <td className="cell-sub">{fmtKST(h.sent_at ?? h.queued_at)}</td><td><b>{h.store_name}</b>{h.target?.store_url && <a href={h.target.store_url} target="_blank" rel="noreferrer" className="cell-sub" style={{ marginLeft: 6 }}>스토어</a>}{h.target?.phone && <div className="cell-sub">{h.target.phone}</div>}</td><td style={{ fontSize: 12.5 }}>{h.to_email}</td><td>{h.keyword}</td>
          <td><Status kind={k}>{l}</Status>{h.error && <div className="cell-sub" style={{ maxWidth: 220 }}>{h.error}</div>}</td>
          <td>{h.opened_at ? <span style={{ color: 'var(--ok-ink)', fontWeight: 700 }}>{fmtKST(h.opened_at)} ({h.open_cnt})</span> : <span className="cell-sub">-</span>}</td>
          <td>{h.replied_at ? <b style={{ color: 'var(--ok-ink)' }}>📩 {fmtKST(h.replied_at)}</b> : <span className="cell-sub">-</span>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{h.proposal_code && <a href={`${base}/p/${h.proposal_code}?preview=1`} target="_blank" rel="noreferrer" className="btn ghost xs" title="열람 집계 안 됨">미리보기</a>}{h.status === 'queued' && <button type="button" className="btn ghost xs" style={{ marginLeft: 4 }} onClick={async () => { const x = await cancelQueued(h.id); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); }}>취소</button>}</td></tr>; })}
      </tbody></table>}
    </Section>

    {teamHist.length > 0 && <Section title="직원 발송 현황" sub="팀장: 우리 팀 · 총괄·대표·관리팀: 전체 · 최근 500건" flush
      right={<select value={who} onChange={e => setWho(e.target.value)} style={{ padding: '4px 8px', fontSize: 13 }}><option value="">담당자 전체</option>{[...new Set(teamHist.map(h => h.sender))].sort().map(n => <option key={n} value={n}>{n} ({teamHist.filter(h => h.sender === n).length})</option>)}</select>}>
      <div style={{ maxHeight: 560, overflow: 'auto' }}><table><thead><tr><th>시각</th><th>담당자</th><th>업체</th><th>이메일</th><th>키워드</th><th>제목</th><th>상태</th><th>열람</th><th>회신</th></tr></thead><tbody>
        {teamHist.filter(h => !who || h.sender === who).map(h => { const [l, k] = ST[h.status] ?? [h.status, 'off']; return <tr key={h.id} style={{ background: h.replied_at ? 'var(--ok-soft)' : undefined }}>
          <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{fmtKST(h.sent_at ?? h.queued_at)}</td><td><b>{h.sender}</b></td><td>{h.store_name}{h.target?.store_url && <a href={h.target.store_url} target="_blank" rel="noreferrer" className="cell-sub" style={{ marginLeft: 6 }}>스토어</a>}{h.target?.phone && <div className="cell-sub">{h.target.phone}</div>}</td><td style={{ fontSize: 12.5 }}>{h.to_email}</td><td>{h.keyword}</td>
          <td style={{ fontSize: 12.5, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.subject}>{h.proposal_code ? <a href={`${base}/p/${h.proposal_code}?preview=1`} target="_blank" rel="noreferrer" title="미리보기 (열람 집계 안 됨)">{h.subject || '(제목 없음)'}</a> : h.subject}</td>
          <td><Status kind={k}>{l}</Status>{h.error && <div className="cell-sub" style={{ maxWidth: 260, whiteSpace: 'normal' }} title={h.error}>{h.error}</div>}</td>
          <td>{h.opened_at ? <span style={{ color: 'var(--ok-ink)', fontWeight: 700 }}>{fmtKST(h.opened_at)} ({h.open_cnt})</span> : <span className="cell-sub">-</span>}</td>
          <td>{h.replied_at ? <b style={{ color: 'var(--ok-ink)' }}>📩 {fmtKST(h.replied_at)}</b> : <span className="cell-sub">-</span>}</td></tr>; })}
      </tbody></table></div>
    </Section>}
  </div>;
}
