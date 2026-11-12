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

export type Candidate = { id: number; store_name: string; store_url: string; email: string; phone: string; rank_now: number | null; review_cnt: number | null; optout: boolean; replied: boolean; ours: string | null; interest: string | null; recent_by: string | null; recent_at: string | null };
export type AgentItem = { id: number; to: string; subject: string; body: string; message_id: string; store: string };
export type AgentJob = { job_id: string; sender_email: string; password: string; sender_name: string; items: AgentItem[]; gap_sec: number; callback_url: string; callback_token: string };

async function settings() {
  const { data } = await supabaseAdmin().from('app_settings').select('key,value').in('key', ['mail_recontact_days', 'mail_daily_limit']);
  const g = (k: string, d: number) => { const v = Number(String((data ?? []).find(x => x.key === k)?.value ?? '').replace(/"/g, '')); return Number.isFinite(v) && v > 0 ? v : d; };
  return { days: g('mail_recontact_days', 3), limit: g('mail_daily_limit', 200) };
}
const kstDayStart = () => { const d = new Date(Date.now() + 9 * 3600_000); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() - 9 * 3600_000).toISOString(); };
const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://chamhan.vercel.app').replace(/\/$/, '');
const linkBase = () => (process.env.NEXT_PUBLIC_PROPOSAL_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://chamhan.vercel.app').replace(/\/$/, '');

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
  const sb = supabaseAdmin();
  const { data: acct } = await sb.from('mail_accounts').select('id,email,app_pw_enc,from_name,verified_at,daily_limit').eq('user_id', me.id).eq('id', i.accountId).maybeSingle();
  if (!acct?.verified_at) return { ok: false, msg: '내 정보에서 메일 계정을 먼저 연결하세요' };
  let pw: string; try { pw = decrypt(acct.app_pw_enc); } catch { return { ok: false, msg: '계정 복호화 실패 — 내 정보에서 다시 연결하세요' }; }
  const { days, limit } = await settings(); const lim = Math.min(acct.daily_limit || limit, limit);
  const { count: usedToday } = await sb.from('mail_queue').select('id', { count: 'exact', head: true }).eq('account_id', acct.id).in('status', ['queued', 'sending', 'sent']).gte('queued_at', kstDayStart());
  const remain = lim - (usedToday ?? 0); if (remain <= 0) return { ok: false, msg: `${acct.email} 오늘 발송 상한(${lim}건) 도달 — 다른 계정으로` };
  const { data: cand, error } = await sb.rpc('mail_candidates_json', { p_keyword: kw, p_days: days }); if (error) return { ok: false, msg: error.message };
  const want = new Set(i.ids); const skipped: string[] = []; const picks: Candidate[] = [];
  for (const c of (cand ?? []) as Candidate[]) {
    if (!want.has(c.id)) continue;
    if (!c.email) { skipped.push(`${c.store_name}: 이메일 없음`); continue; }
    if (c.optout) { skipped.push(`${c.store_name}: 수신거부`); continue; }
    if (c.replied) { skipped.push(`${c.store_name}: 회신한 업체`); continue; }
    if (c.ours) { skipped.push(`${c.store_name}: ${c.ours}`); continue; }
    if (c.interest) { skipped.push(`${c.store_name}: ${c.interest} 고객`); continue; }
    if (c.recent_by) { skipped.push(`${c.store_name}: ${c.recent_by} ${days}일 내 발송`); continue; }
    picks.push(c);
  }
  if (!picks.length) return { ok: false, msg: '보낼 수 있는 대상이 없습니다', skipped };
  if (picks.length > remain) { skipped.push(`일 상한 초과 ${picks.length - remain}곳 제외`); picks.length = remain; }
  // 미리본 제안서 그대로 링크 1개 (수신자 구분은 ?m=큐번호)
  const code = randomBytes(6).toString('base64url').slice(0, 8);
  const { error: pe } = await sb.from('proposals').insert({ code, title: `${kw} 상위노출 제안서`, target_url: '', kind: 'native', data: i.doc, owner_id: me.id });
  if (pe) return { ok: false, msg: '제안서 저장 실패: ' + pe.message };
  await sb.from('proposal_logs').insert({ user_id: me.id, keyword: kw, target: null, action: 'link', code });
  const token = randomBytes(16).toString('base64url'); const jobId = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const { data: ins, error: qe } = await sb.from('mail_queue').insert(picks.map(c => ({ sender_id: me.id, account_id: acct.id, target_id: c.id, to_email: c.email.toLowerCase(), store_name: c.store_name, keyword: kw, proposal_code: code, job_token: token, status: 'queued' }))).select('id,target_id');
  if (qe) return { ok: false, msg: qe.message };
  const byT = new Map(picks.map(c => [c.id, c])); const base = linkBase(); const items: AgentItem[] = [];
  await Promise.all((ins ?? []).map(q => {
    const c = byT.get(q.target_id!)!; const mid = `wh.${q.id}.${randomBytes(4).toString('hex')}@inquirydesk.bid`;
    const v = { 업체명: c.store_name || '담당자', 키워드: kw, 순위: c.rank_now ? `${c.rank_now}위` : '-', 담당자: i.owner.trim() || me.name, 연락처: i.phone.trim(), 제안서링크: `${base}/p/${code}?m=${q.id}`, 수신거부링크: `${base}/p/${code}?unsub=1&m=${q.id}` };
    const subject = fillVars(i.subject, v).slice(0, 200), body = fillVars(i.body, v);
    items.push({ id: q.id, to: c.email.toLowerCase(), subject, body, message_id: `<${mid}>`, store: c.store_name });
    return sb.from('mail_queue').update({ subject, body, message_id: `<${mid}>` }).eq('id', q.id);
  }));
  items.sort((a, b) => a.id - b.id);
  revalidatePath('/mail');
  return { ok: true, msg: `${items.length}건 발송 시작${skipped.length ? ` · 제외 ${skipped.length}` : ''}`, skipped, job: { job_id: jobId, sender_email: acct.email, password: pw, sender_name: acct.from_name || `참한기획 ${me.name}`, items, gap_sec: 4, callback_url: `${siteBase()}/api/mail/agent-callback`, callback_token: token } };
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
const isLead = (me: { role: string }) => me.role === 'admin' || me.role === 'head';

/** 1단계: 키워드별로 보낼 수 있는 대상 수 (제외 규칙 적용) → 총 건수 맞춰 배분 */
export async function manualPlan(total: number, perKeyword: number): Promise<R<{ plan: { keyword: string; n: number }[]; available: number }>> {
  const me = await getProfile(); if (!me || !isLead(me)) return { ok: false, msg: '총괄·대표만' };
  const sb = supabaseAdmin(); const { days } = await settings();
  const { data: kws, error } = await sb.rpc('mail_keywords_json'); if (error) return { ok: false, msg: error.message };
  const list = ((kws ?? []) as { keyword: string; n: number }[]).sort((a, b) => b.n - a.n);
  const plan: { keyword: string; n: number }[] = []; let left = Math.max(1, Math.min(5000, total)); let available = 0;
  for (const k of list) {
    if (left <= 0) break;
    const { data: cand } = await sb.rpc('mail_candidates_json', { p_keyword: k.keyword, p_days: days });
    const ok = ((cand ?? []) as Candidate[]).filter(c => c.email && !c.optout && !c.replied && !c.ours && !c.interest && !c.recent_by).length;
    available += ok; if (!ok) continue;
    const n = Math.min(ok, Math.max(1, perKeyword), left); plan.push({ keyword: k.keyword, n }); left -= n;
  }
  return { ok: true, msg: `${plan.reduce((a, p) => a + p.n, 0)}건 · 키워드 ${plan.length}개`, plan, available };
}

/** 2단계: 키워드 1개 — 제안서(캐시 지수) 1개 만들고, 대상 n건을 '발송됨'으로 큐에 기록(중복 발송·열람 추적용) → 엑셀 행 반환 */
export async function manualExport(i: { keyword: string; n: number; owner: string; phone: string; offer: { basic: string; rec: string }; tpl: Tpl; tplB: Tpl; tplC: Tpl; startNo: number }): Promise<R<{ rows: ManualRow[] }>> {
  const me = await getProfile(); if (!me || !isLead(me)) return { ok: false, msg: '총괄·대표만' };
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
  await sb.from('proposal_logs').insert({ user_id: me.id, keyword: kw, target: null, action: 'link', code });
  const now = new Date().toISOString();
  const { data: ins, error: qe } = await sb.from('mail_queue').insert(picks.map(c => ({ sender_id: me.id, account_id: null, target_id: c.id, to_email: c.email.toLowerCase(), store_name: c.store_name, keyword: kw, proposal_code: code, status: 'sent', sent_at: now, error: '수동 발송(엑셀)' }))).select('id,target_id');
  if (qe) return { ok: false, msg: qe.message };
  const byT = new Map(picks.map(c => [c.id, c])); const base = linkBase(); const rows: ManualRow[] = []; let no = i.startNo;
  for (const q of (ins ?? []).sort((a, b) => a.id - b.id)) {
    const c = byT.get(q.target_id!)!;
    const v = { 업체명: c.store_name || '담당자', 키워드: kw, 순위: c.rank_now ? `${c.rank_now}위` : '-', 담당자: i.owner.trim() || me.name, 연락처: i.phone.trim(), 제안서링크: `${base}/p/${code}?m=${q.id}`, 수신거부링크: `${base}/p/${code}?unsub=1&m=${q.id}` };
    const f = (t: Tpl) => [fillVars(t.subject, v).slice(0, 200), fillVars(t.body, v)] as const;
    const [s1, b1] = f(i.tpl), [s2, b2] = f(i.tplB), [s3, b3] = f(i.tplC);
    rows.push({ no: no++, store: c.store_name, email: c.email.toLowerCase(), keyword: kw, rank: v.순위, subject: s1, body: b1, subjectB: s2, bodyB: b2, subjectC: s3, bodyC: b3, link: v.제안서링크, unsub: v.수신거부링크 });
    await sb.from('mail_queue').update({ subject: s1, body: b1 }).eq('id', q.id);
  }
  return { ok: true, msg: `${kw} ${rows.length}건`, rows };
}
