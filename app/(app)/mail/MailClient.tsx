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
import { loadKeywords, loadCandidates, makeDoc, prepareSend, autoPrepare, testSend, failQueued, saveTemplate, cancelQueued, replyPayload, ingestReplies, listCampaigns, createCampaign, setCampaign, agentKey, v3StatusOf, type Candidate, type AgentJob, type Campaign } from './actions';

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
  // 자동 발송 (키워드 여러 개를 순서대로) + 테스트 발송
  const [autoOpen, setAutoOpen] = useState(false); const [autoSel, setAutoSel] = useState<Set<string>>(new Set()); const [perKw, setPerKw] = useState(30); const [autoMax, setAutoMax] = useState(0);
  const [autoLog, setAutoLog] = useState<string[]>([]); const [autoRun, setAutoRun] = useState(false); const stopRef = useRef(false);
  const [testTo, setTestTo] = useState(accounts[0]?.email ?? '');
  const DONE_KEY = 'wh.mail.autoDone'; const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const [autoDone, setAutoDone] = useState<string[]>(() => { try { const j = JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); return j.d === today ? (j.kws ?? []) : []; } catch { return []; } });
  const markDone = (k: string) => setAutoDone(d => { const n = [...new Set([...d, k])]; try { localStorage.setItem(DONE_KEY, JSON.stringify({ d: today, kws: n })); } catch {} return n; });
  const resetDone = () => { setAutoDone([]); try { localStorage.removeItem(DONE_KEY); } catch {} };
  const [useV3, setUseV3] = useState(false); const [quick, setQuick] = useState(false); const [v3st, setV3st] = useState<Awaited<ReturnType<typeof v3StatusOf>>>(null); const [pendTest, setPendTest] = useState(false); const [camps, setCamps] = useState<Campaign[]>([]); const [agentAuto, setAgentAuto] = useState<{ enabled: boolean; last: string; msg: string } | null>(null);
  const loadCamps = async () => { const x = await listCampaigns(); if (x.ok) setCamps(x.rows!); };

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

  const alog = (m: string) => setAutoLog(l => [...l.slice(-200), `${new Date().toLocaleTimeString('ko-KR', { hour12: false })} ${m}`]);
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  /** SNS_Manager 작업이 끝날 때까지 대기 — 성공·실패 수 반환 */
  const waitIdle = async (): Promise<Prog | null> => {
    let last: Prog | null = null;
    for (;;) {
      await sleep(3000);
      try { const s = await agentPost<Prog>('/mail/wh-status', {}, 5000); setProg(s); last = s; if (!s.running) return s; } catch { /* 잠깐 끊김 */ }
      if (stopRef.current) { try { await agentPost('/mail/wh-stop', {}); } catch {} }
    }
  };
  const runAuto = async () => {
    const list = kws.filter(k => autoSel.has(k.keyword) && !autoDone.includes(k.keyword)).sort((a, b) => b.n - a.n).map(k => k.keyword);
    if (!list.length) { notify(autoDone.length ? '고른 키워드는 오늘 이미 다 돌았습니다 — 「처음부터」로 초기화' : '키워드를 고르세요', 'bad'); return; }
    const h = await agentHealth(); setAgent(h);
    if (!h.up || !h.mailWh) { notify(h.up ? 'SNS_Manager 구버전' : 'SNS_Manager 가 꺼져 있습니다', 'bad'); return; }
    if (!account) { notify('발신 계정을 선택하세요', 'bad'); return; }
    if (!subject.trim() || !body.trim()) { notify('④ 제목·본문을 먼저 채우세요', 'bad'); return; }
    const cap = autoMax > 0 ? autoMax : account.limit - account.today;
    if (!confirm(`키워드 ${list.length}개를 순서대로 자동 발송합니다. 키워드당 최대 ${perKw}건 · 이번 실행 최대 ${cap}건 · ${account.email}. 이 탭을 닫으면 멈춥니다.`)) return;
    stopRef.current = false; setAutoRun(true); setAutoLog([]); setBusy('auto');
    let sent = 0, fail = 0;
    for (const k of list) {
      if (stopRef.current) { alog('중단'); break; }
      const left = cap - sent; if (left <= 0) { alog(`이번 실행 한도 ${cap}건 도달 — 종료`); break; }
      const n = Math.min(perKw, left); alog(`'${k}' 대상 ${n}건 준비…`);
      const p = await autoPrepare({ keyword: k, n, subject, body, owner, phone, offer: { basic, rec }, accountId: account.id, v3: useV3, quick });
      if (!p.ok || !p.job) { alog(`'${k}' 건너뜀 — ${p.msg}`); if (/상한/.test(p.msg)) break; if (!/준비 중/.test(p.msg)) markDone(k); continue; }   // v3 준비 중인 키워드는 다음 실행 때 다시
      try {
        const res = await agentPost('/mail/wh-send', p.job, 15_000);
        if (!res?.ok) { await failQueued(p.job.items.map(i => i.id), 'SNS_Manager 거부: ' + (res?.error || '')); alog(`'${k}' SNS_Manager 거부 — ${res?.error || ''}`); break; }
      } catch { await failQueued(p.job.items.map(i => i.id), 'SNS_Manager 연결 실패'); alog('SNS_Manager 연결 끊김 — 종료'); break; }
      setProg({ running: true, total: p.job.items.length, done: 0, ok: 0, fail: 0, current: '', log: [] });
      const s = await waitIdle(); sent += s?.ok ?? 0; fail += s?.fail ?? 0;
      markDone(k); alog(`'${k}' 완료 — 성공 ${s?.ok ?? 0} · 실패 ${s?.fail ?? 0} (누적 ${sent})`);
      await sleep(1500);
    }
    setAutoRun(false); setBusy(''); notify(`자동 발송 종료 — 성공 ${sent} · 실패 ${fail}`, fail ? 'bad' : 'ok'); r.refresh();
  };
  const doTest = async () => {
    const k = loadedKw || [...autoSel][0] || kws[0]?.keyword || ''; if (!k) { notify('키워드를 먼저 불러오거나 고르세요', 'bad'); return; }
    const h = await agentHealth(); setAgent(h);
    if (!h.up || !h.mailWh) { notify(h.up ? 'SNS_Manager 구버전' : 'SNS_Manager 가 꺼져 있습니다', 'bad'); return; }
    if (!account) { notify('발신 계정을 선택하세요', 'bad'); return; }
    setBusy('test');
    const p = await testSend({ keyword: k, to: testTo, subject, body, owner, phone, offer: { basic, rec }, accountId: account.id, v3: useV3, quick });
    if (!p.ok || !p.job) { setBusy(''); if (/준비 중/.test(p.msg)) { setPendTest(true); notify('v3 준비 중 — 준비되면 자동으로 테스트 발송합니다 (이 탭 유지)', 'ok'); } else notify(p.msg, 'bad'); return; }
    setPendTest(false);
    try { const res = await agentPost('/mail/wh-send', p.job, 15_000); if (!res?.ok) { await failQueued(p.job.items.map(i => i.id), 'SNS_Manager 거부'); setBusy(''); notify('테스트 발송 실패: ' + (res?.error || ''), 'bad'); return; } }
    catch { await failQueued(p.job.items.map(i => i.id), 'SNS_Manager 연결 실패'); setBusy(''); notify('SNS_Manager 에 연결할 수 없음', 'bad'); return; }
    notify(`${p.msg} — '${k}' 제안서`, 'ok'); poll(1);
  };

  /** B. 캠페인 등록 + 이 PC의 SNS_Manager 에 끌어가기 키 전달 */
  const handOff = async () => {
    const list = kws.filter(k => autoSel.has(k.keyword)).sort((a, b) => b.n - a.n).map(k => k.keyword);
    if (!list.length) { notify('키워드를 고르세요', 'bad'); return; }
    if (!account) { notify('발신 계정을 선택하세요', 'bad'); return; }
    if (!subject.trim() || !body.trim()) { notify('④ 제목·본문을 먼저 채우세요', 'bad'); return; }
    const h = await agentHealth(); setAgent(h);
    if (!h.up) { notify('SNS_Manager 가 꺼져 있습니다', 'bad'); return; }
    if (!h.autoPull) { notify('SNS_Manager 가 자동 끌어가기 없는 구버전 — 새 exe 로 교체 후 다시', 'bad'); return; }
    if (!confirm(`키워드 ${list.length}개를 이 PC의 SNS_Manager 에 맡깁니다. 브라우저를 닫아도 PC·SNS_Manager 가 켜져 있으면 계속 발송합니다 (키워드당 ${perKw}건 · 하루 ${autoMax > 0 ? autoMax + '건' : '계정 상한'}).`)) return;
    setBusy('camp');
    const c = await createCampaign({ keywords: list, perKw, dailyCap: autoMax, subject, body, owner, phone, offer: { basic, rec }, accountId: account.id, v3: useV3 });
    if (!c.ok) { setBusy(''); notify(c.msg, 'bad'); return; }
    const k = await agentKey(); if (!k.ok || !k.key) { setBusy(''); notify(k.msg, 'bad'); return; }
    try { const res = await agentPost('/mail/wh-auto', { enabled: true, base_url: k.base, key: k.key }, 8000); if (!res?.ok) notify('SNS_Manager 설정 실패: ' + (res?.error || ''), 'bad'); else notify(c.msg, 'ok'); }
    catch { notify('SNS_Manager 연결 실패 — 캠페인은 등록됨. SNS_Manager 켜고 「연결」 누르세요', 'bad'); }
    setBusy(''); loadCamps(); refreshAgentAuto();
  };
  const connectAgent = async () => {
    const k = await agentKey(); if (!k.ok || !k.key) { notify(k.msg, 'bad'); return; }
    try { const res = await agentPost('/mail/wh-auto', { enabled: true, base_url: k.base, key: k.key }, 8000); notify(res?.ok ? 'SNS_Manager 자동 발송 켜짐 — 1분 안에 서버 확인 시작' : '실패: ' + (res?.error || ''), res?.ok ? 'ok' : 'bad'); } catch { notify('SNS_Manager 연결 실패', 'bad'); }
    refreshAgentAuto();
  };
  const refreshAgentAuto = async () => { try { const h = await agentHealth(); setAgent(h); if (h.autoPull) { const st = await agentPost('/mail/wh-auto-status', {}, 5000); setAgentAuto({ enabled: !!st?.enabled, last: st?.last_pull || '', msg: st?.last_msg || '' }); } } catch {} };
  useEffect(() => { loadCamps(); refreshAgentAuto(); const t = setInterval(() => { loadCamps(); refreshAgentAuto(); }, 60_000); return () => clearInterval(t); // eslint-disable-next-line
  }, []);
  const v3kw = loadedKw || [...autoSel][0] || '';
  useEffect(() => { if (!useV3 || !v3kw) { setV3st(null); return; } let on = true; const f = async () => { const x = await v3StatusOf(v3kw); if (on) setV3st(x); }; f(); const t = setInterval(f, 20_000); return () => { on = false; clearInterval(t); }; }, [useV3, v3kw]);
  useEffect(() => { if (pendTest && v3st && v3st.kwImg >= 4 && v3st.storesImg > 0 && !busy) { setPendTest(false); doTest(); } // eslint-disable-next-line
  }, [v3st, pendTest]);

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

    {/* 자동 발송 · 테스트 */}
    <div className="card" style={{ padding: '12px 14px', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>자동 발송</b><span className="cell-sub">키워드 여러 개를 골라두면 순서대로(이메일 업체 많은 순) 대상 추출 → 제안서 → 발송을 반복 · ④ 제목·본문 사용 · 탭을 열어둬야 함</span>
        <button type="button" className="btn ghost xs" style={{ marginLeft: 'auto' }} onClick={() => setAutoOpen(o => !o)}>{autoOpen ? '접기' : '열기'}</button>
      </div>
      {autoOpen && <>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn ghost xs" onClick={() => setAutoSel(new Set(kws.map(k => k.keyword)))}>전체 {kws.length}개</button>
          <button type="button" className="btn ghost xs" onClick={() => setAutoSel(new Set(kws.slice(0, 20).map(k => k.keyword)))}>상위 20개</button>
          <button type="button" className="btn ghost xs" onClick={() => setAutoSel(new Set())}>해제</button>
          <span className="cell-sub">선택 {autoSel.size}개 · 예상 대상 {kws.filter(k => autoSel.has(k.keyword)).reduce((a, k) => a + Math.min(k.n, perKw), 0)}건 (제외 규칙 적용 전)</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 150, overflow: 'auto', padding: 4, background: 'var(--bg)', borderRadius: 8 }}>
          {kws.map(k => <label key={k.keyword} style={{ fontSize: 12.5, display: 'inline-flex', gap: 4, alignItems: 'center', padding: '3px 8px', borderRadius: 999, border: '1px solid var(--line)', background: autoSel.has(k.keyword) ? '#DCFCE7' : '#fff', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoSel.has(k.keyword)} onChange={e => { const n = new Set(autoSel); e.target.checked ? n.add(k.keyword) : n.delete(k.keyword); setAutoSel(n); }} style={{ margin: 0 }} />{k.keyword} <span className="cell-sub">{k.n}</span></label>)}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>키워드당 최대<input type="number" value={perKw} onChange={e => setPerKw(Math.max(1, Number(e.target.value) || 1))} style={{ width: 90 }} /></label>
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>이번 실행 최대 <span style={{ fontWeight: 400 }}>(0 = 오늘 남은 한도)</span><input type="number" value={autoMax} onChange={e => setAutoMax(Math.max(0, Number(e.target.value) || 0))} style={{ width: 110 }} /></label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }} title="제안서 v3 화면에서 이미지가 준비된 업체만 발송 · 본문에 이미지 8장 인라인 · 제안서 링크 없음"><input type="checkbox" checked={useV3} onChange={e => setUseV3(e.target.checked)} style={{ width: 'auto', margin: 0 }} /> 제안서 v3 이미지로 (링크 없음)</label>
          {useV3 && <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }} title="워커 글을 안 기다리고 코드 기본 문장으로 바로 렌더 (1~2분). 워커 글이 나오면 다음 발송부터 자동 반영"><input type="checkbox" checked={quick} onChange={e => setQuick(e.target.checked)} style={{ width: 'auto', margin: 0 }} /> 빠른 모드 (워커 안 기다림)</label>}
          {!autoRun ? <button type="button" className="btn" disabled={!!busy || !autoSel.size || !account} onClick={runAuto} style={{ background: '#03C75A', borderColor: '#03C75A' }}>자동 발송 시작</button>
            : <button type="button" className="btn" onClick={() => { stopRef.current = true; alog('중단 요청 — 현재 키워드 끝나면 멈춤'); }} style={{ background: '#E11D48', borderColor: '#E11D48' }}>중단</button>}
          {account && <span className="cell-sub">{account.email} · 오늘 {account.today}/{account.limit}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'grid', gap: 3 }}>테스트 받을 주소<input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="내 메일" style={{ width: 220 }} /></label>
            <button type="button" className="btn ghost" disabled={!!busy || !account} onClick={doTest}>{busy === 'test' ? '보내는 중…' : '테스트 1건 발송'}</button>
          </span>
        </div>
        <div className="cell-sub">테스트는 {loadedKw ? `'${loadedKw}'` : '고른 키워드 첫 번째'} 제안서로 제목 앞에 [테스트]를 붙여 보냄 · 일 상한·대상 업체 기록에 안 들어감</div>
        {useV3 && v3kw && <div style={{ fontSize: 12.5, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
          <b>v3 '{v3kw}'</b>
          {!v3st ? <span className="cell-sub">확인 중…</span> : !v3st.kwData ? <span className="cell-sub">아직 안 만듦 — 보내기/테스트 누르면 자동 준비</span> : <>
            <span>지수 ✓</span>
            <span>업체 {v3st.stores}곳 (글 {v3st.storesAi} · 이미지 {v3st.storesImg})</span>
            <span>키워드 글 {v3st.kwAi === 'done' ? '✓' : v3st.kwAi === 'fallback' ? '기본 문장' : v3st.kwTask ? `워커 #${v3st.kwTask} ${v3st.kwTaskStatus === 'running' ? '작업 중' : v3st.kwTaskStatus === 'queued' ? '대기' : v3st.kwTaskStatus}` : '요청 전'}</span>
            <span>공통 이미지 {v3st.kwImg}/4</span>
            <span className="cell-sub">렌더 PC {v3st.renderLast ? `${fmtKST(v3st.renderLast)} 연결 · 큐 ${v3st.renderQueue}` : '연결 안 됨 (pv3_render.py 실행 필요)'}</span>
            {v3st.kwImg >= 4 && v3st.storesImg > 0 && <Status kind="ok">보낼 수 있음</Status>}{pendTest && <Status kind="wait">준비되면 자동 테스트 발송</Status>}
          </>}
        </div>}
        {autoDone.length > 0 && <div className="cell-sub">오늘 이미 끝난 키워드 {autoDone.length}개는 건너뜀 (이어하기) · <button type="button" className="btn ghost xs" onClick={resetDone}>처음부터</button></div>}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>PC에 맡기기 (브라우저 없이)</b>
            <span className="cell-sub">고른 키워드를 서버에 등록해 두면 이 PC의 SNS_Manager 가 1분마다 서버에서 할 일을 받아 발송 · 브라우저 닫아도 됨 · 하루 상한 차면 다음 날 자동으로 이어감</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {agent?.autoPull ? (agentAuto?.enabled ? <Status kind="ok">SNS_Manager 자동 발송 켜짐{agentAuto.last ? ` · 마지막 확인 ${agentAuto.last}` : ''}</Status> : <Status kind="off">SNS_Manager 자동 발송 꺼짐</Status>) : <Status kind="bad">SNS_Manager 교체 필요</Status>}
              <button type="button" className="btn ghost xs" onClick={connectAgent}>연결</button>
              <button type="button" className="btn" disabled={!!busy || !autoSel.size || !account} onClick={handOff}>{busy === 'camp' ? '등록 중…' : '이 PC에 맡기기'}</button>
            </span>
          </div>
          {agentAuto?.msg && <div className="cell-sub">SNS_Manager: {agentAuto.msg}</div>}
          {camps.length > 0 && <table><thead><tr><th>등록</th><th>키워드</th><th>진행</th><th>상태</th><th>마지막 확인</th><th></th></tr></thead><tbody>
            {camps.map(c => <tr key={c.id}>
              <td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{fmtKST(c.created_at)}</td>
              <td style={{ fontSize: 12.5 }} title={c.keywords.join(', ')}>{c.keywords.slice(0, 4).join(', ')}{c.keywords.length > 4 ? ` 외 ${c.keywords.length - 4}` : ''}</td>
              <td style={{ fontSize: 12.5 }}>{c.progress?.done?.length ?? 0}/{c.keywords.length} 키워드 · {c.progress?.sent ?? 0}건{c.progress?.log?.length ? <div className="cell-sub" title={c.progress.log.join('\n')}>{c.progress.log[c.progress.log.length - 1]}</div> : null}</td>
              <td><Status kind={c.status === 'active' ? 'ok' : c.status === 'paused' ? 'wait' : 'off'}>{c.status === 'active' ? '진행' : c.status === 'paused' ? '정지' : '완료'}</Status></td>
              <td className="cell-sub">{c.last_pull_at ? fmtKST(c.last_pull_at) : '-'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {c.status === 'active' && <button type="button" className="btn ghost xs" onClick={async () => { const x = await setCampaign(c.id, 'paused'); notify(x.msg, x.ok ? 'ok' : 'bad'); loadCamps(); }}>정지</button>}
                {c.status === 'paused' && <button type="button" className="btn ghost xs" onClick={async () => { const x = await setCampaign(c.id, 'active'); notify(x.msg, x.ok ? 'ok' : 'bad'); loadCamps(); }}>재개</button>}
                <button type="button" className="btn ghost xs" style={{ marginLeft: 4 }} onClick={async () => { if (!confirm('삭제할까요? 이미 나간 메일은 그대로입니다.')) return; const x = await setCampaign(c.id, 'delete'); notify(x.msg, x.ok ? 'ok' : 'bad'); loadCamps(); }}>삭제</button>
              </td></tr>)}
          </tbody></table>}
        </div>
        {autoLog.length > 0 && <div style={{ maxHeight: 160, overflow: 'auto', fontFamily: 'monospace', fontSize: 11.5, background: 'var(--bg)', padding: 8, borderRadius: 8 }}>{autoLog.map((l, i) => <div key={i}>{l}</div>)}</div>}
        {autoRun && prog && <div style={{ fontSize: 12.5 }}><span>현재 키워드 {prog.done}/{prog.total} · 성공 {prog.ok} · 실패 {prog.fail}</span> <span className="cell-sub">{prog.current}</span></div>}
      </>}
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
    {(autoOpen || (loadedKw && rows.length > 0)) && <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14 }}>
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
