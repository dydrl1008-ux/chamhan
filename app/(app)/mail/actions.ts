'use server';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/crypto/secret';
import { searchFresh, search } from '@/lib/nsc';
import { buildDoc, BRAND, type Doc } from '@/lib/proposalDoc';
import { fillVars } from '@/lib/mail';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;

import { autoPrepareV3, v3Status, ensureKeyword } from '@/lib/pv3Tasks';
import { fallbackKwAi, type KwData, type KwAi } from '@/lib/proposalV3';
import { settings, kstDayStart, siteBase, linkBase, prepareCore, autoPrepareCore, eligible, v3ImagesFor, v3Html, type Candidate, type AgentItem, type AgentJob } from '@/lib/mailSend';
export type { Candidate, AgentItem, AgentJob };


/** 내 정보: 메일 계정 추가/갱신 (네이버·지메일, 브라우저가 SNS_Manager 로 로그인 확인한 뒤 호출) */
export async function saveMailAccount(email: string, appPw: string, fromName: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  email = email.trim().toLowerCase(); const pw = appPw.replace(/\s+/g, '');
  if (!/^[a-z0-9._+-]+@(naver|gmail)\.com$/.test(email)) return { ok: false, msg: '네이버(@naver.com) 또는 지메일(@gmail.com)만 등록할 수 있습니다' };
  if (pw.length < 8) return { ok: false, msg: '앱 비밀번호가 짧습니다' };
  let enc: string; try { enc = encrypt(pw); } catch (e: any) { return { ok: false, msg: e.message }; }
  const sb = supabaseAdmin(); const provider = email.endsWith('@gmail.com') ? 'gmail' : 'naver';
  const { data: ex } = await sb.from('mail_accounts').select('id').eq('user_id', me.id).ilike('email', email).maybeSingle();
  const row = { user_id: me.id, email, provider, app_pw_enc: enc, from_name: fromName.trim() || `참한기획 ${me.name}`, verified_at: new Date().toISOString() };
  const { error } = ex ? await sb.from('mail_accounts').update(row).eq('id', ex.id) : await sb.from('mail_accounts').insert(row);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/me'); revalidatePath('/mail');
  return { ok: true, msg: `${email} 연결 완료` };
}
export async function deleteMailAccount(id: number): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { error } = await supabaseAdmin().from('mail_accounts').delete().eq('id', id).eq('user_id', me.id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/me'); revalidatePath('/mail'); return { ok: true, msg: '계정 삭제' };
}

export async function saveTemplate(subject: string, body: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { error } = await supabaseAdmin().from('mail_accounts').update({ tpl_subject: subject.slice(0, 200), tpl_body: body.slice(0, 5000) }).eq('user_id', me.id);
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '내 템플릿 저장' };
}

export async function loadKeywords(): Promise<R<{ rows: { keyword: string; n: number }[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseAdmin().rpc('mail_keywords_json');   // jsonb 한 덩어리 — 1,000행 상한 없음
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '', rows: (data ?? []) as any[] };
}

export async function loadCandidates(keyword: string): Promise<R<{ rows: Candidate[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { days } = await settings();
  const { data, error } = await supabaseAdmin().rpc('mail_candidates_json', { p_keyword: keyword.trim(), p_days: days });   // jsonb — 1,000행 상한 없음
  if (error) return { ok: false, msg: error.message };
  return { ok: true, msg: '', rows: (data ?? []) as Candidate[] };
}

/** 3단계 미리보기용 제안서 (키워드 시장 분석, 대상 업체 없음) — 시크릿 지수 오늘 데이터 */
export async function makeDoc(keyword: string, owner: string, phone: string, offer: { basic: string; rec: string }): Promise<R<{ doc: Doc }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const r = await searchFresh(keyword.trim(), me.id); return { ok: true, msg: '', doc: buildDoc(r, { ...BRAND, owner: owner.trim() || me.name, phone: phone.trim() }, null, { basic: offer.basic.trim().slice(0, 40), rec: offer.rec.trim().slice(0, 40) }) }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}

/** 발송 준비: 제외 규칙 재검사 → 제안서 링크 1개 → 큐 등록 → SNS_Manager 에 넘길 작업(본인 계정 포함) 반환 */
export async function prepareSend(i: { keyword: string; ids: number[]; subject: string; body: string; doc: Doc; owner: string; phone: string; accountId: number }): Promise<R<{ job: AgentJob; skipped: string[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const kw = i.keyword.trim(); if (!kw || !i.ids.length) return { ok: false, msg: '대상을 선택하세요' };
  if (!i.subject.trim() || !i.body.trim()) return { ok: false, msg: '제목·본문을 입력하세요' };
  if (!i.doc || i.doc.keyword !== kw) return { ok: false, msg: '제안서를 먼저 만들어 확인하세요' };
  const r = await prepareCore(me, { ...i, keyword: kw }); if (r.ok) revalidatePath('/mail'); return r;
}

/** 자동 발송: 키워드 1개 — 서버가 대상 n건 고르고(제외 규칙) 제안서(캐시 지수)까지 만들어 바로 작업 반환. 브라우저가 키워드 목록을 돌며 호출 */
export async function autoPrepare(i: { keyword: string; n: number; subject: string; body: string; owner: string; phone: string; offer: { basic: string; rec: string }; accountId: number; v3?: boolean; quick?: boolean }): Promise<R<{ job: AgentJob; skipped: string[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const r = await autoPrepareCore(me, i); if (r.ok) revalidatePath('/mail'); return r;
}

/** 테스트 발송: 키워드 제안서를 내가 지정한 주소 1곳으로. 큐에 '테스트'로 남고 대상 업체·일 상한엔 영향 없음 */
export async function testSend(i: { keyword: string; to: string; subject: string; body: string; owner: string; phone: string; offer: { basic: string; rec: string }; accountId: number; v3?: boolean; quick?: boolean }): Promise<R<{ job: AgentJob }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const kw = i.keyword.trim(); const to = i.to.trim().toLowerCase();
  if (!kw) return { ok: false, msg: '키워드를 먼저 고르세요' };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)) return { ok: false, msg: '받을 메일 주소를 확인하세요' };
  if (!i.subject.trim() || !i.body.trim()) return { ok: false, msg: '제목·본문을 입력하세요' };
  const sb = supabaseAdmin();
  const { data: acct } = await sb.from('mail_accounts').select('id,email,app_pw_enc,from_name,verified_at').eq('user_id', me.id).eq('id', i.accountId).maybeSingle();
  if (!acct?.verified_at) return { ok: false, msg: '내 정보에서 메일 계정을 먼저 연결하세요' };
  let pw: string; try { pw = decrypt(acct.app_pw_enc); } catch { return { ok: false, msg: '계정 복호화 실패 — 내 정보에서 다시 연결하세요' }; }
  let doc: Doc;
  try { const r = await search(kw, me.id); doc = buildDoc(r, { ...BRAND, owner: i.owner.trim() || me.name, phone: i.phone.trim() }, null, { basic: i.offer.basic.trim().slice(0, 40), rec: i.offer.rec.trim().slice(0, 40) }); }
  catch (e: any) { return { ok: false, msg: `제안서 생성 실패 — ${e.message}` }; }
  const code = randomBytes(6).toString('base64url').slice(0, 8);
  const { error: pe } = await sb.from('proposals').insert({ code, title: `${kw} 상위노출 제안서 (테스트)`, target_url: '', kind: 'native', data: doc, owner_id: me.id });
  if (pe) return { ok: false, msg: '제안서 저장 실패: ' + pe.message };
  const token = randomBytes(16).toString('base64url'); const jobId = `t${Date.now().toString(36)}`;
  // account_id 비움 → 일 상한 집계에서 제외. target_id 없음 → 대상 업체 발송 기록 아님
  const { data: q, error: qe } = await sb.from('mail_queue').insert({ sender_id: me.id, account_id: null, target_id: null, to_email: to, store_name: '테스트 발송', keyword: kw, proposal_code: code, job_token: token, status: 'queued', error: '테스트' }).select('id').single();
  if (qe || !q) return { ok: false, msg: qe?.message ?? '큐 등록 실패' };
  const base = linkBase(); const mid = `wh.${q.id}.${randomBytes(4).toString('hex')}@inquirydesk.bid`;
  const v = { 업체명: '테스트업체', 키워드: kw, 순위: '23위', 담당자: i.owner.trim() || me.name, 연락처: i.phone.trim(), 제안서링크: `${base}/p/${code}?m=${q.id}`, 수신거부링크: `${base}/p/${code}?unsub=1&m=${q.id}` };
  let html: string | undefined;
  if (i.v3) {
    const { data: st } = await sb.from('pv3_stores').select('target_id').eq('keyword', kw).not('target_id', 'is', null).limit(50);
    let m = await v3ImagesFor(kw, (st ?? []).map(x => x.target_id!)); let first = [...m.values()][0];
    if (!first) {   // 없으면 자동 준비 (메일 대상 상위 3곳으로)
      const { days } = await settings(); const { data: cand } = await sb.rpc('mail_candidates_json', { p_keyword: kw, p_days: days });
      const picks = ((cand ?? []) as Candidate[]).filter(c => c.email).slice(0, 3);
      const pr = await autoPrepareV3(kw, me, picks.map(c => ({ target_id: c.id, store: c.store_name, rank: c.rank_now, reviews: c.review_cnt, link: c.store_url })), !!i.quick);
      if (pr.ready) { const { data: st2 } = await sb.from('pv3_stores').select('target_id').eq('keyword', kw).not('target_id', 'is', null).limit(50); m = await v3ImagesFor(kw, (st2 ?? []).map(x => x.target_id!)); first = [...m.values()][0]; }
      if (!first) return { ok: false, msg: pr.msg + ' · 준비되면 다시 「테스트 1건 발송」' };
    }
    v.제안서링크 = ''; html = v3Html(fillVars(i.body, v), first.urls);
  }
  const subject = `[테스트] ` + fillVars(i.subject, v).slice(0, 190), body = fillVars(i.body, v);
  await sb.from('mail_queue').update({ subject, body, message_id: `<${mid}>` }).eq('id', q.id);
  revalidatePath('/mail');
  return { ok: true, msg: `테스트 1건 → ${to}${html ? ' (맞춤 제안서 이미지 포함)' : ''}`, job: { job_id: jobId, sender_email: acct.email, password: pw, sender_name: acct.from_name || `참한기획 ${me.name}`, items: [{ id: q.id, to, subject, body, message_id: `<${mid}>`, store: '테스트 발송', ...(html ? { html } : {}) }], gap_sec: 1, callback_url: `${siteBase()}/api/mail/agent-callback`, callback_token: token } };
}

/** SNS_Manager 가 안 받았거나 실패한 건 정리 (브라우저가 에이전트 호출 실패 시) */
export async function failQueued(ids: number[], reason: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!ids.length) return { ok: true, msg: '' };
  await supabaseAdmin().from('mail_queue').update({ status: 'failed', error: reason.slice(0, 200) }).in('id', ids).eq('sender_id', me.id).eq('status', 'queued');
  revalidatePath('/mail'); return { ok: true, msg: '' };
}

export type ReplyAcct = { id: number; email: string; password: string; last_uid: number; known_emails: string[] };
/** 회신 확인용: 내 계정 전부 + 계정별 최근 60일 발송 주소 (브라우저 → SNS_Manager /mail/wh-replies) */
export async function replyPayload(force = false): Promise<R<{ accounts: ReplyAcct[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin();
  const { data: accts } = await sb.from('mail_accounts').select('id,email,app_pw_enc,verified_at,imap_last_uid,imap_checked_at').eq('user_id', me.id).not('verified_at', 'is', null);
  if (!accts?.length) return { ok: false, msg: '메일 계정 없음' };
  const out: ReplyAcct[] = [];
  for (const a of accts) {
    if (!force && a.imap_checked_at && Date.now() - new Date(a.imap_checked_at).getTime() < 8 * 60_000) continue;
    let pw: string; try { pw = decrypt(a.app_pw_enc); } catch { continue; }
    const { data: known } = await sb.rpc('mail_known_emails', { p_account: a.id });   // 배열 — 1,000행 상한 없음
    out.push({ id: a.id, email: a.email, password: pw, last_uid: Number(a.imap_last_uid ?? 0), known_emails: (known ?? []) as string[] });
  }
  return out.length ? { ok: true, msg: '', accounts: out } : { ok: false, msg: 'recent' };
}

export type AgentReply = { uid: number; from_email: string; from_name: string; subject: string; received_at: string | null; in_reply_to: string; references: string; snippet: string };
/** SNS_Manager 가 찾은 답장 → 큐 매칭 → 리드 관심·알림 (SQL mail_reply_lead) */
export async function ingestReplies(accountId: number, replies: AgentReply[], lastUid: number): Promise<R<{ matched: number }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin(); let matched = 0;
  for (const r of (replies ?? []).slice(0, 200)) {
    const from = (r.from_email || '').toLowerCase(); if (!from) continue;
    const refs = `${r.in_reply_to || ''} ${r.references || ''}`; const m = refs.match(/wh\.(\d+)\./);
    let q: { id: number } | null = null;
    if (m) q = (await sb.from('mail_queue').select('id').eq('id', Number(m[1])).eq('sender_id', me.id).maybeSingle()).data;
    if (!q) q = (await sb.from('mail_queue').select('id').eq('account_id', accountId).eq('status', 'sent').ilike('to_email', from).order('queued_at', { ascending: false }).limit(1).maybeSingle()).data;
    if (!q) continue;
    const { data: dup } = await sb.from('mail_replies').select('id').eq('queue_id', q.id).eq('from_email', from).eq('subject', r.subject || '').limit(1);
    if (dup?.length) continue;
    const { data: lid } = await sb.rpc('mail_reply_lead', { p_queue_id: q.id, p_subject: r.subject || '', p_snippet: r.snippet || '', p_received: r.received_at });
    await sb.from('mail_replies').insert({ queue_id: q.id, sender_id: me.id, from_email: from, subject: r.subject || '', snippet: r.snippet || '', received_at: r.received_at, lead_id: lid ?? null });
    matched++;
  }
  await sb.from('mail_accounts').update({ imap_last_uid: Math.max(0, Number(lastUid) || 0), imap_checked_at: new Date().toISOString() }).eq('id', accountId).eq('user_id', me.id);
  if (matched) { revalidatePath('/mail'); revalidatePath('/calls'); revalidatePath('/notifications'); }
  return { ok: true, msg: matched ? `회신 ${matched}건 — 콜 리스트에 올렸습니다` : '', matched };
}

export async function cancelQueued(id: number): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseAdmin().from('mail_queue').update({ status: 'skipped', error: '사용자 취소' }).eq('id', id).eq('sender_id', me.id).eq('status', 'queued').select('id');
  if (error) return { ok: false, msg: error.message }; if (!data?.length) return { ok: false, msg: '이미 발송 중/완료' };
  revalidatePath('/mail'); return { ok: true, msg: '취소' };
}

// ───────── 수동 발송용 엑셀 내보내기 (총괄·대표) — 다른 계정으로 직접 보낼 때 ─────────
export type ManualRow = { no: number; store: string; email: string; keyword: string; rank: string; subject: string; body: string; subjectB: string; bodyB: string; subjectC: string; bodyC: string; link: string; unsub: string };
export type Tpl = { subject: string; body: string };
const isHeadOnly = (me: { role: string }) => me.role === 'head';   // 수동 발송 엑셀 = 총괄만

/** 1단계: 키워드별로 보낼 수 있는 대상 수 (제외 규칙 적용) → 총 건수 맞춰 배분 */
export async function manualPlan(total: number, perKeyword: number, from = 0): Promise<R<{ plan: { keyword: string; n: number }[]; available: number; next: number | null; totalKw: number }>> {
  const me = await getProfile(); if (!me || !isHeadOnly(me)) return { ok: false, msg: '총괄만' };
  const sb = supabaseAdmin(); const { days } = await settings();
  const { data: kws, error } = await sb.rpc('mail_keywords_json'); if (error) return { ok: false, msg: error.message };
  const list = ((kws ?? []) as { keyword: string; n: number }[]).sort((a, b) => b.n - a.n || a.keyword.localeCompare(b.keyword));   // 순서 고정 (나눠 부를 때 어긋나지 않게)
  const plan: { keyword: string; n: number }[] = []; let left = Math.max(1, Math.min(100000, total)); let available = 0;
  const count = async (kw: string) => { const { data: cand } = await sb.rpc('mail_candidates_json', { p_keyword: kw, p_days: days }); return ((cand ?? []) as Candidate[]).filter(c => c.email && !c.optout && !c.replied && !c.ours && !c.interest && !c.recent_by).length; };
  // 한 번 호출에 키워드 40개까지만 센다 — 전체 뽑기처럼 키워드가 수백 개면 한 번에 다 세다가 시간 초과로 끊기던 문제. 화면이 next 를 받아 이어서 부른다
  const end = Math.min(list.length, Math.max(0, from) + 40); let x = Math.max(0, from);
  for (; x < end && left > 0; x += 8) {
    const part = list.slice(x, Math.min(x + 8, end)); const oks = await Promise.all(part.map(k => count(k.keyword)));
    for (let y = 0; y < part.length; y++) {
      const ok = oks[y]; available += ok; if (!ok || left <= 0) continue;
      const n = Math.min(ok, Math.max(1, perKeyword), left); plan.push({ keyword: part[y].keyword, n }); left -= n;
    }
  }
  const next = left > 0 && end < list.length ? end : null;
  return { ok: true, msg: `${plan.reduce((a, p) => a + p.n, 0)}건 · 키워드 ${plan.length}개`, plan, available, next, totalKw: list.length };
}

/** 2단계: 키워드 1개 — 제안서(캐시 지수) 1개 만들고 대상 n건을 엑셀 행으로 반환. 워크허브에 발송 기록은 남기지 않음(총괄 요청) */
export async function manualExport(i: { keyword: string; n: number; owner: string; phone: string; offer: { basic: string; rec: string }; tpl: Tpl; tplB: Tpl; tplC: Tpl; startNo: number; kakao?: string }): Promise<R<{ rows: ManualRow[] }>> {
  const me = await getProfile(); if (!me || !isHeadOnly(me)) return { ok: false, msg: '총괄만' };
  const kw = i.keyword.trim(); const sb = supabaseAdmin(); const { days } = await settings();
  const { data: cand, error } = await sb.rpc('mail_candidates_json', { p_keyword: kw, p_days: days }); if (error) return { ok: false, msg: error.message };
  const picks = ((cand ?? []) as Candidate[]).filter(c => c.email && !c.optout && !c.replied && !c.ours && !c.interest && !c.recent_by).slice(0, Math.max(1, i.n));
  if (!picks.length) return { ok: true, msg: '대상 없음', rows: [] };
  let doc: Doc;
  try { const r = await search(kw, me.id); doc = buildDoc(r, { ...BRAND, owner: i.owner.trim() || me.name, phone: i.phone.trim() }, null, { basic: i.offer.basic.trim().slice(0, 40), rec: i.offer.rec.trim().slice(0, 40) }); }
  catch (e: any) { return { ok: false, msg: `${kw}: 제안서 생성 실패 — ${e.message}` }; }
  const code = randomBytes(6).toString('base64url').slice(0, 8);
  const { error: pe } = await sb.from('proposals').insert({ code, title: `${kw} 상위노출 제안서`, target_url: '', kind: 'native', data: doc, owner_id: me.id });
  if (pe) return { ok: false, msg: '제안서 저장 실패: ' + pe.message };
  const base = linkBase(); const rows: ManualRow[] = []; let no = i.startNo;
  for (const c of picks) {
    const em = c.email.toLowerCase(); const e = Buffer.from(em).toString('base64url');
    const v = { 업체명: c.store_name || '담당자', 키워드: kw, 순위: c.rank_now ? `${c.rank_now}위` : '-', 담당자: i.owner.trim() || me.name, 연락처: i.phone.trim(), 제안서링크: `${base}/p/${code}`, 수신거부링크: `${base}/p/${code}?unsub=1&e=${e}`, 오픈채팅: (i.kakao ?? '').trim() };
    const f = (t: Tpl) => [fillVars(t.subject, v).slice(0, 200), fillVars(t.body, v)] as const;
    const [s1, b1] = f(i.tpl), [s2, b2] = f(i.tplB), [s3, b3] = f(i.tplC);
    rows.push({ no: no++, store: c.store_name, email: em, keyword: kw, rank: v.순위, subject: s1, body: b1, subjectB: s2, bodyB: b2, subjectC: s3, bodyC: b3, link: v.제안서링크, unsub: v.수신거부링크 });
  }
  return { ok: true, msg: `${kw} ${rows.length}건`, rows };
}

// ── 자동 발송 캠페인 (SNS_Manager 가 서버에서 끌어감 — 브라우저 없어도 PC만 켜져 있으면 진행) ──
export type Campaign = { id: number; account_id: number; keywords: string[]; per_kw: number; daily_cap: number; subject: string; status: 'active' | 'paused' | 'done'; progress: { done: string[]; sent: number; log: string[] }; last_pull_at: string | null; created_at: string; use_v3?: boolean };
export async function listCampaigns(): Promise<R<{ rows: Campaign[] }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseAdmin().from('mail_campaigns').select('id,account_id,keywords,per_kw,daily_cap,subject,status,progress,last_pull_at,created_at,use_v3').eq('owner_id', me.id).order('created_at', { ascending: false }).limit(20);
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '', rows: (data ?? []) as Campaign[] };
}
export async function createCampaign(i: { keywords: string[]; perKw: number; dailyCap: number; subject: string; body: string; owner: string; phone: string; offer: { basic: string; rec: string }; accountId: number; v3?: boolean }): Promise<R<{ id: number }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const kws = [...new Set(i.keywords.map(k => k.trim()).filter(Boolean))]; if (!kws.length) return { ok: false, msg: '키워드를 고르세요' };
  if (!i.subject.trim() || !i.body.trim()) return { ok: false, msg: '제목·본문을 입력하세요' };
  const sb = supabaseAdmin();
  const { data: acct } = await sb.from('mail_accounts').select('id').eq('id', i.accountId).eq('user_id', me.id).maybeSingle(); if (!acct) return { ok: false, msg: '발신 계정을 선택하세요' };
  const { data, error } = await sb.from('mail_campaigns').insert({ owner_id: me.id, account_id: acct.id, keywords: kws, per_kw: Math.max(1, Math.min(500, i.perKw)), daily_cap: Math.max(0, i.dailyCap), subject: i.subject.slice(0, 200), body: i.body.slice(0, 5000), owner_name: i.owner.trim(), phone: i.phone.trim(), offer: { basic: i.offer.basic.slice(0, 40), rec: i.offer.rec.slice(0, 40) }, use_v3: !!i.v3 }).select('id').single();
  if (error || !data) return { ok: false, msg: error?.message ?? '등록 실패' };
  return { ok: true, msg: `자동 발송 등록 — 키워드 ${kws.length}개. SNS_Manager 가 1분 안에 가져갑니다`, id: data.id };
}
export async function setCampaign(id: number, status: 'active' | 'paused' | 'done' | 'delete'): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin();
  const { error } = status === 'delete' ? await sb.from('mail_campaigns').delete().eq('id', id).eq('owner_id', me.id) : await sb.from('mail_campaigns').update({ status }).eq('id', id).eq('owner_id', me.id);
  return error ? { ok: false, msg: error.message } : { ok: true, msg: status === 'delete' ? '삭제' : status === 'active' ? '재개' : status === 'paused' ? '일시정지' : '종료' };
}
/** SNS_Manager 에 넣을 내 끌어가기 키 (없으면 생성). 브라우저가 localhost:5555 로 전달 */
export async function agentKey(regen = false): Promise<R<{ key: string; base: string }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin();
  const { data: ex } = await sb.from('mail_agent_keys').select('key').eq('user_id', me.id).maybeSingle();
  if (ex && !regen) return { ok: true, msg: '', key: ex.key, base: siteBase() };
  const key = randomBytes(24).toString('base64url');
  const { error } = await sb.from('mail_agent_keys').upsert({ user_id: me.id, key }, { onConflict: 'user_id' });
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '', key, base: siteBase() };
}

export async function v3StatusOf(keyword: string) {
  const me = await getProfile(); if (!me) return null;
  return v3Status(keyword.trim());
}

/** 수동 발송(엑셀)용: 키워드 공용판 제안서 데이터 — 화면에서 9장을 그려 이미지로 저장한다. 워커 글이 있으면 그 글, 없으면 기본 문장 */
export async function manualCommonV3(keyword: string): Promise<R<{ k: KwData; ka: KwAi; worker: boolean }>> {
  const me = await getProfile(); if (!me || !isHeadOnly(me)) return { ok: false, msg: '총괄만' };
  const kw = keyword.trim().replace(/\s+/g, ' '); if (!kw) return { ok: false, msg: '키워드 없음' };
  const ek = await ensureKeyword(kw, me); if (!ek.ok || !ek.k) return { ok: false, msg: `${kw}: ${ek.msg}` };
  const { data: kd } = await supabaseAdmin().from('pv3_keywords').select('ai,ai_status').eq('keyword', kw).maybeSingle();
  const worker = kd?.ai_status === 'done' && !!kd.ai;
  return { ok: true, msg: '', k: ek.k, ka: (worker ? kd!.ai : fallbackKwAi(ek.k)) as KwAi, worker };
}
