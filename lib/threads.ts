// 쓰레드(Threads) 자동 발행 — 공식 API(graph.threads.net). 토큰은 threads_accounts.token_enc 에 암호화 저장, 로그·오류 문구에 절대 넣지 않는다
import { supabaseAdmin } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/crypto/secret';
import { parseLoose, type KwData } from '@/lib/proposalV3';
type Sb = ReturnType<typeof supabaseAdmin>;
const G = 'https://graph.threads.net';
export const TH_AI_TITLE = '[쓰레드] 글 작성';
export const TH_RV_TITLE = '[쓰레드] 글 검수';
export type ThAccount = { id: number; owner_id: string; username: string; th_user_id: string; token_enc: string; token_expires_at: string | null; enabled: boolean; per_day: number; hours: string; tail: string; tone: string; persona?: Persona | null };
export type Persona = { who?: string; audience?: string; voice?: string; view?: string; samples?: string };
/** 글 작성·검수 지시문에 붙는 페르소나 설명 (없으면 빈 문자열) */
export function personaText(a: { persona?: Persona | null; tone?: string }): string {
  const p = a.persona ?? {}; const L = [p.who && `나는 누구: ${p.who}`, p.audience && `누구에게 말하나: ${p.audience}`, (p.voice || a.tone) && `말투: ${p.voice || a.tone}`, p.view && `관점·주제: ${p.view}`].filter(Boolean) as string[];
  if (p.samples?.trim()) L.push(`예시 글 (말투·호흡만 참고하고 내용·숫자는 베끼지 않는다)\n${p.samples.trim().slice(0, 1500)}`);
  return L.length ? `\n\n페르소나 (이 사람이 쓴 것처럼)\n${L.join('\n')}` : '';
}

async function api(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`${G}${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.error) throw new Error(`쓰레드 API ${r.status}: ${String(j?.error?.message ?? j?.error_message ?? '응답 오류').slice(0, 160)}`);
  return j;
}
/** 토큰 확인 — 계정 id·아이디 */
export const thMe = (token: string): Promise<{ id: string; username: string }> => api(`/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
/** 장기 토큰 갱신 (60일짜리 → 새 60일) */
export const thRefresh = (token: string): Promise<{ access_token: string; expires_in: number }> => api(`/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`);
/** 글 한 개 발행 (텍스트). 컨테이너 생성 → 발행 2단계 */
export async function thPublish(userId: string, token: string, text: string): Promise<string> {
  const body = (o: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...o, access_token: token }).toString() });
  const c = await api(`/v1.0/${userId}/threads`, body({ media_type: 'TEXT', text: text.slice(0, 500) }));
  await new Promise(r => setTimeout(r, 2500));
  const p = await api(`/v1.0/${userId}/threads_publish`, body({ creation_id: String(c.id) }));
  return String(p.id);
}
export const tokenOf = (a: ThAccount) => decrypt(a.token_enc);
export const encToken = (t: string) => encrypt(t);

// ── 발행 시각 ─────────────────────────────────────────────────────────
const hoursOf = (a: { hours: string; per_day: number }) => { const h = Array.from(new Set(String(a.hours).split(/[,\s]+/).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 23))).sort((x, y) => x - y); return (h.length ? h : [9, 13, 20]).slice(0, Math.max(1, Math.min(10, a.per_day))); };
/** 다음 빈 발행 시각 n 개 (KST 기준 시각표, 이미 잡힌 시각은 건너뜀). 사람이 올린 것처럼 분은 3~27분 사이로 흩는다 */
export function nextSlots(a: { hours: string; per_day: number }, taken: string[], n: number, from = Date.now()): string[] {
  const hs = hoursOf(a); const used = new Set(taken.map(t => { const d = new Date(new Date(t).getTime() + 9 * 3600e3); return `${d.toISOString().slice(0, 10)}#${d.getUTCHours()}`; })); const out: string[] = [];
  const base = new Date(from + 9 * 3600e3);
  for (let day = 0; out.length < n && day < 60; day++) {
    const d0 = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + day));
    for (const h of hs) {
      const key = `${d0.toISOString().slice(0, 10)}#${h}`; if (used.has(key)) continue;
      const at = d0.getTime() + h * 3600e3 + (3 + Math.floor(Math.random() * 25)) * 60e3 - 9 * 3600e3;
      if (at < from + 5 * 60e3) continue; used.add(key); out.push(new Date(at).toISOString()); if (out.length >= n) break;
    }
  }
  return out;
}

// ── 글 만들기 (AI 워커) ────────────────────────────────────────────────
const won = (n: number) => `${Math.round(n).toLocaleString()}원`;
function facts(k: KwData): string {
  const rv = k.top10.map(t => t.reviews).filter(n => Number.isFinite(n)); const pr = k.top10.map(t => t.price).filter(n => n > 0);
  return [`키워드: ${k.keyword}`, `월 검색량 ${k.volume.main.toLocaleString()}회`, `상위 10개 평균가 ${won(k.stats.avgPrice10)}${pr.length ? ` (최저 ${won(Math.min(...pr))} ~ 최고 ${won(Math.max(...pr))})` : ''}`,
    `상위 10개 리뷰 중앙값 ${Math.round(k.stats.medianReview10).toLocaleString()}개${rv.length ? ` (최소 ${Math.min(...rv).toLocaleString()} ~ 최대 ${Math.max(...rv).toLocaleString()})` : ''}`, `상위 10개 중 광고 ${k.stats.adCount10}개`].join(' · ');
}
/** AI 워커에 글 작성 요청 — 아직 글로 안 쓴 키워드 n 개의 실제 데이터를 넘긴다. 반환: 작업 id (없으면 0) */
export async function requestPosts(sb: Sb, a: ThAccount, n = 6): Promise<{ ok: boolean; msg: string }> {
  const { data: used } = await sb.from('threads_posts').select('keyword').eq('account_id', a.id).limit(5000); const usedSet = new Set((used ?? []).map(r => r.keyword));
  const { data: all } = await sb.from('pv3_keywords').select('keyword').not('data', 'is', null).limit(5000);
  const pool = (all ?? []).map(r => r.keyword).filter(k => !usedSet.has(k)); if (!pool.length) return { ok: false, msg: '글로 쓸 키워드 데이터가 없습니다 (맞춤 제안서를 만든 키워드가 재료가 됩니다)' };
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const { data: rows } = await sb.from('pv3_keywords').select('keyword,data').in('keyword', pool.slice(0, n));
  const fs = (rows ?? []).map(r => { try { return facts(r.data as KwData); } catch { return ''; } }).filter(Boolean); if (!fs.length) return { ok: false, msg: '키워드 데이터를 읽지 못했습니다' };
  const instruction = `쓰레드(Threads)에 올릴 짧은 글을 키워드마다 1개씩, 총 ${fs.length}개 써 주세요.\n\n누가 쓰는 글인가: 네이버 쇼핑 판매자를 돕는 일을 하는 사람이, 자기가 본 키워드 데이터를 판매자들에게 툭 던지듯 공유하는 글.${personaText(a)}\n\n규칙\n- 페르소나는 말투와 관점만 정한다. 없는 경험담·성과를 지어내지 않는다 ("내 스토어 매출이 올랐다" 같은 문장 금지)\n- 아래 "데이터"에 있는 숫자만 쓴다. 없는 숫자·순위·매출·효과를 지어내지 않는다. 숫자는 그대로 옮긴다\n- 광고·영업 문구 금지 ("문의 주세요", "저희가 해 드립니다" 등). 업체명·브랜드명·매체명·작업 방식 언급 금지\n- 판매자가 "어, 내 얘기네" 할 만한 관찰 한 가지를 중심으로. 첫 줄에서 바로 본론\n- 반말·존댓말은 한 글 안에서 섞지 않는다. 해시태그·이모지·"안녕하세요" 없이\n- 한 글 150~350자, 줄바꿈으로 2~4문단. 글마다 시작 방식과 구조를 다르게\n\n데이터\n${fs.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n출력은 설명 없이 JSON 배열 하나만: [{"keyword":"키워드","text":"글"}, ...]`;
  const { data: ins, error } = await sb.from('ai_tasks').insert({ kind: 'order', agent: 'chief', title: TH_AI_TITLE, instruction, source: 'workhub', requested_by: '쓰레드 자동 발행', requested_by_id: a.owner_id, status: 'queued' }).select('id').single();
  if (error || !ins) return { ok: false, msg: 'AI 작업 등록 실패: ' + (error?.message ?? '') };
  await sb.from('ai_settings').upsert([{ key: `threads_ai_task:${a.id}`, value: String(ins.id), updated_at: new Date().toISOString() }, { key: `threads_ai_last:${a.id}`, value: new Date().toISOString(), updated_at: new Date().toISOString() }], { onConflict: 'key' });
  return { ok: true, msg: `AI 워커에 글 ${fs.length}개 요청 (작업 #${ins.id}) — 몇 분 뒤 대기열에 들어옵니다` };
}
/** 끝난 AI 작업 → 대기열. 반환: 들어간 글 수 */
async function ingest(sb: Sb, a: ThAccount, taskId: number): Promise<number | null> {
  const { data: t } = await sb.from('ai_tasks').select('status,result').eq('id', taskId).maybeSingle();
  if (!t || ['rejected', 'failed', 'cancelled'].includes(t.status)) { await sb.from('ai_settings').upsert({ key: `threads_ai_task:${a.id}`, value: '', updated_at: new Date().toISOString() }, { onConflict: 'key' }); return 0; }
  if (t.status !== 'done') return null;
  const j = parseLoose(t.result); const arr: any[] = Array.isArray(j) ? j : Array.isArray(j?.posts) ? j.posts : [];
  const posts = arr.map(x => ({ keyword: String(x?.keyword ?? '').slice(0, 60), text: String(x?.text ?? '').trim() })).filter(x => x.text.length >= 40 && x.text.length <= 480);
  if (posts.length) {   // 바로 대기열에 넣지 않는다 — 보류로 넣고 검수를 통과한 글만 발행 시각을 받는다
    const { data: kd } = await sb.from('pv3_keywords').select('keyword,data').in('keyword', posts.map(p => p.keyword).filter(Boolean));
    const fm = new Map((kd ?? []).map(r => { try { return [r.keyword, facts(r.data as KwData)] as [string, string]; } catch { return [r.keyword, ''] as [string, string]; } }));
    const { data: ins } = await sb.from('threads_posts').insert(posts.map(p => ({ account_id: a.id, keyword: p.keyword, text: p.text, facts: fm.get(p.keyword) ?? '', status: 'hold', error: '검수 중' }))).select('id,text,facts');
    if (ins?.length) await requestReview(sb, a, ins);
  }
  await sb.from('ai_settings').upsert({ key: `threads_ai_task:${a.id}`, value: '', updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return posts.length;
}
/** 글에 데이터에 없는 숫자(2자리 이상)가 있으면 그 숫자를 돌려준다 — AI 검수와 별개로 코드가 한 번 더 막는다 */
export function strayNumber(text: string, f: string): string | null {
  const fd = f.replace(/,/g, ''); return (text.replace(/,/g, '').match(/\d{2,}/g) ?? []).find(n => !fd.includes(n)) ?? null;
}
/** 보류 글에 발행 시각을 주고 대기열로 */
export async function queueUp(sb: Sb, a: ThAccount, items: { id: number; text?: string }[]): Promise<void> {
  if (!items.length) return;
  const { data: taken } = await sb.from('threads_posts').select('scheduled_at').eq('account_id', a.id).in('status', ['queued', 'posted']).gte('scheduled_at', new Date(Date.now() - 86400e3).toISOString());
  const slots = nextSlots(a, (taken ?? []).map(r => r.scheduled_at).filter(Boolean) as string[], items.length);
  for (let i = 0; i < items.length; i++) await sb.from('threads_posts').update({ status: 'queued', scheduled_at: slots[i] ?? null, error: null, ...(items[i].text ? { text: items[i].text } : {}) }).eq('id', items[i].id).eq('account_id', a.id).eq('status', 'hold');
}
/** AI 워커에 검수 요청 — 글과 원 데이터를 같이 넘긴다 */
async function requestReview(sb: Sb, a: ThAccount, posts: { id: number; text: string; facts: string }[]): Promise<void> {
  const instruction = `쓰레드(Threads)에 자동으로 올라갈 글 ${posts.length}개를 발행 전에 검수해 주세요. 쓴 사람과 다른 눈으로, 깐깐하게 봅니다. 애매하면 통과시키지 않습니다.\n\n통과 기준 (하나라도 어기면 불합격)\n1. 글에 나온 숫자가 그 글의 "데이터"와 전부 일치한다. 데이터에 없는 숫자·순위·매출·효과가 없다\n2. 광고·영업 문구가 없다 (문의 유도, "저희가 해 드립니다" 등). 업체명·브랜드명·매체명·작업 방식 언급이 없다\n3. 효과를 장담하거나 과장하지 않는다. 특정 판매자·상품을 깎아내리지 않는다\n4. 한국어가 자연스럽고 AI 티(틀에 박힌 도입, 뻔한 마무리, 해시태그·이모지)가 없다. 한 글 안에서 반말·존댓말이 섞이지 않는다\n5. 480자 이하\n6. 없는 경험담·성과를 지어내지 않았다. 아래 페르소나가 있으면 그 말투와 어긋나지 않는다${personaText(a)}\n\n표현만 살짝 고치면 되는 글은 고친 글을 text 에 넣고 합격 처리해도 됩니다 (숫자는 바꾸지 않습니다). 사실이 틀린 글은 고치지 말고 불합격.\n\n${posts.map(p => `[글 ${p.id}]\n데이터: ${p.facts || '(없음 — 숫자가 하나라도 있으면 불합격)'}\n${p.text}`).join('\n\n')}\n\n출력은 설명 없이 JSON 배열 하나만: [{"id":글번호,"pass":true 또는 false,"reason":"불합격 사유 한 줄","text":"고친 글(고쳤을 때만)"}, ...]`;
  const { data: ins } = await sb.from('ai_tasks').insert({ kind: 'order', agent: 'chief', title: TH_RV_TITLE, instruction, source: 'workhub', requested_by: '쓰레드 자동 발행', requested_by_id: a.owner_id, status: 'queued' }).select('id').single();
  if (!ins) { await sb.from('threads_posts').update({ error: '검수 요청 실패 — 직접 확인 후 올려 주세요' }).in('id', posts.map(p => p.id)); return; }
  await sb.from('ai_settings').upsert({ key: `threads_rv_task:${a.id}`, value: String(ins.id), updated_at: new Date().toISOString() }, { onConflict: 'key' });
}
/** 끝난 검수 → 합격한 글만 대기열로, 나머지는 사유와 함께 보류. 반환: 합격 수 (아직이면 null) */
async function ingestReview(sb: Sb, a: ThAccount, taskId: number): Promise<number | null> {
  const clear = () => sb.from('ai_settings').upsert({ key: `threads_rv_task:${a.id}`, value: '', updated_at: new Date().toISOString() }, { onConflict: 'key' });
  const { data: t } = await sb.from('ai_tasks').select('status,result').eq('id', taskId).maybeSingle();
  const { data: wait } = await sb.from('threads_posts').select('id,text,facts').eq('account_id', a.id).eq('status', 'hold').eq('error', '검수 중');
  if (!t || ['rejected', 'failed', 'cancelled'].includes(t.status)) { if (wait?.length) await sb.from('threads_posts').update({ error: '검수를 못 받았습니다 — 직접 확인 후 올려 주세요' }).in('id', wait.map(w => w.id)); await clear(); return 0; }
  if (t.status !== 'done') return null;
  const j = parseLoose(t.result); const arr: any[] = Array.isArray(j) ? j : Array.isArray(j?.posts) ? j.posts : []; const by = new Map(arr.map(x => [Number(x?.id), x]));
  const pass: { id: number; text?: string }[] = [];
  for (const w of wait ?? []) {
    const r = by.get(w.id); let why = '';
    const fixed = typeof r?.text === 'string' && r.text.trim().length >= 40 && r.text.trim().length <= 480 ? r.text.trim() : ''; const text = fixed || w.text;
    if (!r) why = '검수 결과 없음'; else if (r.pass !== true) why = String(r.reason ?? '불합격').slice(0, 150);
    else { const n = strayNumber(text, w.facts); if (n) why = `데이터에 없는 숫자 ${n}`; }
    if (why) await sb.from('threads_posts').update({ error: '검수 보류: ' + why }).eq('id', w.id); else pass.push({ id: w.id, text: fixed || undefined });
  }
  await queueUp(sb, a, pass); await clear(); return pass.length;
}
/** 글 한 개 발행하고 결과 기록 */
export async function publishPost(sb: Sb, a: ThAccount, post: { id: number; text: string }): Promise<{ ok: boolean; msg: string }> {
  try {
    const text = a.tail.trim() ? `${post.text.trim()}\n\n${a.tail.trim()}`.slice(0, 500) : post.text.trim();
    const id = await thPublish(a.th_user_id, tokenOf(a), text);
    await sb.from('threads_posts').update({ status: 'posted', posted_at: new Date().toISOString(), thread_id: id, error: null }).eq('id', post.id);
    return { ok: true, msg: '발행됨' };
  } catch (e: any) { const m = String(e?.message ?? e).slice(0, 200); await sb.from('threads_posts').update({ status: 'failed', error: m }).eq('id', post.id); return { ok: false, msg: m }; }
}
/** cron (2분마다) — AI 글 수거 → 검수 요청 → 검수 결과 반영 · 토큰 갱신 · 시각이 된 글 1개 발행 · 대기열이 비어 가면 글 요청 */
export async function threadsTick(): Promise<string> {
  const sb = supabaseAdmin(); const { data: accs, error } = await sb.from('threads_accounts').select('*'); if (error) return 'no-table'; const out: string[] = [];
  for (const a of (accs ?? []) as ThAccount[]) {
    if (!a.token_enc || !a.th_user_id) continue;
    const { data: st } = await sb.from('ai_settings').select('key,value').in('key', [`threads_ai_task:${a.id}`, `threads_rv_task:${a.id}`, `threads_ai_last:${a.id}`]);
    const taskId = Number(st?.find(x => x.key === `threads_ai_task:${a.id}`)?.value) || 0; const last = st?.find(x => x.key === `threads_ai_last:${a.id}`)?.value || '';
    let pending = !!taskId; if (taskId) { const n = await ingest(sb, a, taskId); if (n !== null) { pending = n > 0; out.push(`@${a.username} 글 ${n}개 검수 요청`); } }
    const rvId = Number(st?.find(x => x.key === `threads_rv_task:${a.id}`)?.value) || 0;
    if (rvId) { const n = await ingestReview(sb, a, rvId); if (n === null) pending = true; else out.push(`@${a.username} 검수 통과 ${n}개`); }
    if (!a.enabled) continue;
    if (a.token_expires_at && new Date(a.token_expires_at).getTime() - Date.now() < 10 * 86400e3) {   // 만료 10일 전부터 갱신
      try { const r = await thRefresh(tokenOf(a)); await sb.from('threads_accounts').update({ token_enc: encToken(r.access_token), token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('id', a.id); a.token_enc = encToken(r.access_token); out.push(`@${a.username} 토큰 갱신`); } catch { /* 다음 회차에 다시 */ }
    }
    const { data: due } = await sb.from('threads_posts').select('id,text').eq('account_id', a.id).eq('status', 'queued').lte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true }).limit(1);
    if (due?.[0]) { const r = await publishPost(sb, a, due[0]); out.push(`@${a.username} ${r.ok ? '발행' : '실패: ' + r.msg.slice(0, 60)}`); }
    const { count } = await sb.from('threads_posts').select('id', { count: 'exact', head: true }).eq('account_id', a.id).eq('status', 'queued');
    if (!pending && (count ?? 0) < Math.max(2, a.per_day) && (!last || Date.now() - new Date(last).getTime() > 3 * 3600e3)) { const r = await requestPosts(sb, a, Math.max(4, a.per_day * 2)); out.push(`@${a.username} ${r.ok ? '글 요청' : r.msg.slice(0, 40)}`); }
  }
  return out.join(' / ') || 'idle';
}
