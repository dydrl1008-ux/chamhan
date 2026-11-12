// 메일 발송 공통 — 브라우저 액션(actions.ts)과 SNS_Manager 자동 끌어가기(/api/mail/pull)가 같이 씀
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto/secret';
import { fillVars } from '@/lib/mail';
import { search } from '@/lib/nsc';
import { buildDoc, BRAND, type Doc } from '@/lib/proposalDoc';
import { autoPrepareV3 } from '@/lib/pv3Tasks';
import { hasPages, PV3_PAGES, PV3_STORE_PAGES, PV3_COMMON_PAGES, PV3_DESIGN, type Pv3Img } from '@/lib/proposalV3';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;

export type Candidate = { id: number; store_name: string; store_url: string; email: string; phone: string; rank_now: number | null; review_cnt: number | null; optout: boolean; replied: boolean; ours: string | null; interest: string | null; recent_by: string | null; recent_at: string | null };
export type AgentItem = { id: number; to: string; subject: string; body: string; message_id: string; store: string; html?: string };   // html 있으면 SNS_Manager 가 그걸 HTML 파트로 (제안서 v3 이미지 인라인)
export type AgentJob = { job_id: string; sender_email: string; password: string; sender_name: string; items: AgentItem[]; gap_sec: number; callback_url: string; callback_token: string };

export async function settings() {
  const { data } = await supabaseAdmin().from('app_settings').select('key,value').in('key', ['mail_recontact_days', 'mail_daily_limit']);
  const g = (k: string, d: number) => { const v = Number(String((data ?? []).find(x => x.key === k)?.value ?? '').replace(/"/g, '')); return Number.isFinite(v) && v > 0 ? v : d; };
  return { days: g('mail_recontact_days', 3), limit: g('mail_daily_limit', 200) };
}
export const kstDayStart = () => { const d = new Date(Date.now() + 9 * 3600_000); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() - 9 * 3600_000).toISOString(); };
export const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://chamhan.vercel.app').replace(/\/$/, '');
export const linkBase = () => (process.env.NEXT_PUBLIC_PROPOSAL_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://chamhan.vercel.app').replace(/\/$/, '');
export const eligible = (c: Candidate) => !!c.email && !c.optout && !c.replied && !c.ours && !c.interest && !c.recent_by;

/** 제안서 v3 이미지: 업체별 장 + 키워드 공통 장이 현재 디자인 버전으로 다 있어야 발송 가능. urls = 1~N장 순서 */
export async function v3ImagesFor(keyword: string, targetIds: number[]): Promise<Map<number, { storeId: number; urls: string[] }>> {
  const out = new Map<number, { storeId: number; urls: string[] }>(); if (!targetIds.length) return out;
  const sb = supabaseAdmin();
  const { data: k } = await sb.from('pv3_keywords').select('images').eq('keyword', keyword).maybeSingle();
  if (!hasPages(k?.images, PV3_COMMON_PAGES)) return out;
  const cur = (imgs: unknown) => new Map<number, string>(((Array.isArray(imgs) ? imgs : []) as Pv3Img[]).filter(x => x.v === PV3_DESIGN).map(x => [x.page, x.url]));
  const kimg = cur(k?.images);
  const { data: ss } = await sb.from('pv3_stores').select('id,target_id,images').eq('keyword', keyword).in('target_id', targetIds);
  for (const st of ss ?? []) {
    if (!hasPages(st.images, PV3_STORE_PAGES)) continue;
    const simg = cur(st.images);
    out.set(st.target_id!, { storeId: st.id, urls: Array.from({ length: PV3_PAGES }, (_, i) => (simg.get(i + 1) ?? kimg.get(i + 1))!).filter(Boolean) });
  }
  return out;
}
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** 본문 텍스트 + 제안서 이미지 → 메일 HTML. 본문은 쓴 그대로(URL 은 링크로) · 이미지는 본문 뒤 · 수신거부는 본문에 {수신거부링크} 넣었을 때만 */
export function v3Html(body: string, urls: string[]) {
  const text = esc(body).replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1" style="color:#2F5BFF">$1</a>').replace(/\n/g, '<br>');
  const imgs = urls.map((u, i) => `<img src="${u}" alt="제안서 ${i + 1}" width="720" style="display:block;width:100%;max-width:720px;height:auto;margin:0;border:0">`).join('');
  return `<div style="font-family:'Malgun Gothic',Apple SD Gothic Neo,sans-serif;font-size:14px;line-height:1.7;color:#222;max-width:720px">${text}<div style="margin:18px 0 10px;border:1px solid #E6E9F0;border-radius:8px;overflow:hidden">${imgs}</div></div>`;
}

export async function prepareCore(me: { id: string; name: string }, i: { keyword: string; ids: number[]; subject: string; body: string; doc: Doc; owner: string; phone: string; accountId: number; campaignId?: number | null; v3?: boolean; quick?: boolean }): Promise<R<{ job: AgentJob; skipped: string[] }>> {
  const kw = i.keyword;
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
  let v3map = i.v3 ? await v3ImagesFor(kw, picks.map(c => c.id)) : null; let v3msg = '';
  if (v3map) {
    const missing = picks.filter(c => !v3map!.has(c.id));
    if (missing.length) {   // 없으면 자동으로 계산·워커 요청·렌더 큐 → 이번엔 준비된 업체만, 나머진 다음에
      const pr = await autoPrepareV3(kw, me, missing.map(c => ({ target_id: c.id, store: c.store_name, rank: c.rank_now, reviews: c.review_cnt, link: c.store_url })), !!i.quick);
      if (pr.ready) v3map = await v3ImagesFor(kw, picks.map(c => c.id)); v3msg = pr.msg;
    }
    for (let x = picks.length - 1; x >= 0; x--) if (!v3map!.has(picks[x].id)) { skipped.push(`${picks[x].store_name}: 맞춤 제안서 준비 중`); picks.splice(x, 1); }
  }
  if (!picks.length) return { ok: false, msg: i.v3 ? (v3msg || '맞춤 제안서 준비 중') : '보낼 수 있는 대상이 없습니다', skipped };
  if (picks.length > remain) { skipped.push(`일 상한 초과 ${picks.length - remain}곳 제외`); picks.length = remain; }
  // 미리본 제안서 그대로 링크 1개 (수신자 구분은 ?m=큐번호)
  const code = randomBytes(6).toString('base64url').slice(0, 8);
  const { error: pe } = await sb.from('proposals').insert({ code, title: `${kw} 상위노출 제안서`, target_url: '', kind: 'native', data: i.doc, owner_id: me.id });
  if (pe) return { ok: false, msg: '제안서 저장 실패: ' + pe.message };
  await sb.from('proposal_logs').insert({ user_id: me.id, keyword: kw, target: null, action: 'link', code });
  const token = randomBytes(16).toString('base64url'); const jobId = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const { data: ins, error: qe } = await sb.from('mail_queue').insert(picks.map(c => ({ sender_id: me.id, account_id: acct.id, target_id: c.id, to_email: c.email.toLowerCase(), store_name: c.store_name, keyword: kw, proposal_code: code, job_token: token, status: 'queued', campaign_id: i.campaignId ?? null, pv3_store_id: v3map?.get(c.id)?.storeId ?? null }))).select('id,target_id');
  if (qe) return { ok: false, msg: qe.message };
  const byT = new Map(picks.map(c => [c.id, c])); const base = linkBase(); const items: AgentItem[] = [];
  await Promise.all((ins ?? []).map(q => {
    const c = byT.get(q.target_id!)!; const mid = `wh.${q.id}.${randomBytes(4).toString('hex')}@inquirydesk.bid`;
    const v3 = v3map?.get(c.id);
    const v = { 업체명: c.store_name || '담당자', 키워드: kw, 순위: c.rank_now ? `${c.rank_now}위` : '-', 담당자: i.owner.trim() || me.name, 연락처: i.phone.trim(), 제안서링크: v3 ? '' : `${base}/p/${code}?m=${q.id}`, 수신거부링크: `${base}/p/${code}?unsub=1&m=${q.id}` };
    const subject = fillVars(i.subject, v).slice(0, 200), body = fillVars(i.body, v);
    items.push({ id: q.id, to: c.email.toLowerCase(), subject, body, message_id: `<${mid}>`, store: c.store_name, ...(v3 ? { html: v3Html(body, v3.urls) } : {}) });
    return sb.from('mail_queue').update({ subject, body, message_id: `<${mid}>` }).eq('id', q.id);
  }));
  items.sort((a, b) => a.id - b.id);
  return { ok: true, msg: `${items.length}건 발송 시작${skipped.length ? ` · 제외 ${skipped.length}` : ''}`, skipped, job: { job_id: jobId, sender_email: acct.email, password: pw, sender_name: acct.from_name || `참한기획 ${me.name}`, items, gap_sec: 4, callback_url: `${siteBase()}/api/mail/agent-callback`, callback_token: token } };
}


/** 자동 발송(캠페인) 1키워드: 대상 n건 고르고 제안서 만들어 작업 반환 — 브라우저 자동 모드와 SNS_Manager 끌어가기 공용 */
export async function autoPrepareCore(me: { id: string; name: string }, i: { keyword: string; n: number; subject: string; body: string; owner: string; phone: string; offer: { basic: string; rec: string }; accountId: number; campaignId?: number | null; v3?: boolean; quick?: boolean }): Promise<R<{ job: AgentJob; skipped: string[] }>> {
  const kw = i.keyword.trim(); if (!kw) return { ok: false, msg: '키워드 없음' };
  if (!i.subject.trim() || !i.body.trim()) return { ok: false, msg: '제목·본문을 입력하세요' };
  const { days } = await settings();
  const { data: cand, error } = await supabaseAdmin().rpc('mail_candidates_json', { p_keyword: kw, p_days: days }); if (error) return { ok: false, msg: error.message };
  const ids = ((cand ?? []) as Candidate[]).filter(eligible).slice(0, Math.max(1, Math.min(500, i.n))).map(c => c.id);
  if (!ids.length) return { ok: false, msg: `${kw}: 보낼 수 있는 대상 없음`, skipped: [] };
  let doc: Doc;
  try { const r = await search(kw, me.id); doc = buildDoc(r, { ...BRAND, owner: i.owner.trim() || me.name, phone: i.phone.trim() }, null, { basic: i.offer.basic.trim().slice(0, 40), rec: i.offer.rec.trim().slice(0, 40) }); }
  catch (e: any) { return { ok: false, msg: `${kw}: 제안서 생성 실패 — ${e.message}` }; }
  return prepareCore(me, { keyword: kw, ids, subject: i.subject, body: i.body, doc, owner: i.owner, phone: i.phone, accountId: i.accountId, campaignId: i.campaignId, v3: i.v3, quick: i.quick });
}
