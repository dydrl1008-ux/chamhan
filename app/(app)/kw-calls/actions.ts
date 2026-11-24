'use server';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
export type KwCount = { keyword: string; n: number; open: number };
export type Contact = { id: number; store_name: string; store_url: string; company: string; rep: string; email: string; phone: string; address: string; biz_no: string; keywords: string[]; claimed_by: string | null; claimed_name: string; reserved_by: string | null; reserved_name: string; reserved_until: string | null; result: string; memo: string; result_at: string | null };
const KW_RESULTS = ['부재', '관심', '재연락', '거절', '계약'];   // 'use server' 파일은 async 함수만 export 가능
const needSql = (m: string) => /kw_contact/.test(m) ? '0086 SQL(kw_contacts 표)을 먼저 실행해 주세요' : m;
const active = async () => { const me = await getProfile(); return me && me.is_active ? me : null; };

export async function kwKeywords(): Promise<R<{ list: KwCount[] }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseAdmin().rpc('kw_contact_keywords'); if (error) return { ok: false, msg: needSql(error.message) };
  let list = (data ?? []) as KwCount[];
  if (!(me.role === 'head' || me.role === 'admin')) {   // 다른 직원의 요청 건(우선 기간 중)은 직원 화면에서 아예 뺀다 — 수에서도 빼고, 남는 업체가 없으면 키워드도 숨김
    const { data: rs } = await supabaseAdmin().from('kw_contacts').select('keywords').not('reserved_by', 'is', null).neq('reserved_by', me.id).is('claimed_by', null).gt('reserved_until', new Date().toISOString()).limit(5000);
    const hid = new Map<string, number>(); for (const r of rs ?? []) for (const k of (r.keywords ?? []) as string[]) hid.set(k, (hid.get(k) ?? 0) + 1);
    if (hid.size) list = list.map(k => { const h = hid.get(k.keyword) ?? 0; return h ? { ...k, n: k.n - h, open: Math.max(0, k.open - h) } : k; }).filter(k => k.n > 0);
  }
  return { ok: true, msg: '', list };
}
export async function kwContacts(keyword: string): Promise<R<{ rows: Contact[] }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin(); const base = 'id,store_name,store_url,company,rep,email,phone,address,biz_no,keywords,claimed_by,result,memo,result_at';
  const q = (cols: string) => sb.from('kw_contacts').select(cols).contains('keywords', [keyword]).order('result', { ascending: true }).order('id', { ascending: true }).limit(1000);
  let { data, error } = await q(base + ',reserved_by,reserved_until') as { data: any[] | null; error: { message: string } | null };
  if (error && /reserved_/.test(error.message)) ({ data, error } = await q(base) as any);   // 0090 실행 전
  if (error) return { ok: false, msg: needSql(error.message) };
  const now = Date.now(); const live = (r: any) => r.reserved_by && !r.claimed_by && r.reserved_until && new Date(r.reserved_until).getTime() > now;
  const ids = Array.from(new Set((data ?? []).flatMap(r => [r.claimed_by, live(r) ? r.reserved_by : null]).filter(Boolean))) as string[];
  const names = new Map<string, string>(); if (ids.length) { const { data: ps } = await sb.from('profiles').select('id,name').in('id', ids); for (const p of ps ?? []) names.set(p.id, p.name); }
  const rows = (data ?? []).map(r => { const rv = live(r); return { ...r, claimed_name: r.claimed_by ? names.get(r.claimed_by) ?? '' : '', reserved_by: rv ? r.reserved_by : null, reserved_until: rv ? r.reserved_until : null, reserved_name: rv ? names.get(r.reserved_by) ?? '' : '' }; }) as Contact[];
  const boss = me.role === 'head' || me.role === 'admin';
  const vis = boss ? rows : rows.filter(r => !r.reserved_by || r.reserved_by === me.id);   // 다른 직원 요청 건은 요청자·총괄만 봄
  const rank = (r: Contact) => r.reserved_by === me.id ? 0 : 1;   // 내 요청 건을 맨 위로
  return { ok: true, msg: '', rows: vis.sort((a, b) => rank(a) - rank(b)) };
}
/** 연락 결과·메모 저장 — 처음 남긴 사람이 담당. 다른 사람이 담당인 건은 총괄·어드민만 고칠 수 있음. 결과를 비우면 담당도 풀림 */
export async function kwSetResult(id: number, result: string, memo: string, forUser?: string): Promise<R> {   // forUser: 총괄이 직원 화면에서 대신 남길 때 그 직원을 담당으로
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (result && !KW_RESULTS.includes(result)) return { ok: false, msg: '결과 값이 올바르지 않습니다' };
  const sb = supabaseAdmin(); let { data: cur, error } = await sb.from('kw_contacts').select('claimed_by,reserved_by,reserved_until').eq('id', id).maybeSingle() as { data: any; error: { message: string } | null };
  if (error && /reserved_/.test(error.message)) ({ data: cur, error } = await sb.from('kw_contacts').select('claimed_by').eq('id', id).maybeSingle() as any);   // 0090 실행 전
  if (error) return { ok: false, msg: needSql(error.message) }; if (!cur) return { ok: false, msg: '없는 업체' };
  const boss = me.role === 'head' || me.role === 'admin';
  if (cur.claimed_by && cur.claimed_by !== me.id && !boss) return { ok: false, msg: '다른 직원이 담당 중인 업체입니다' };
  if (!cur.claimed_by && cur.reserved_by && cur.reserved_by !== me.id && !boss && cur.reserved_until && new Date(cur.reserved_until).getTime() > Date.now()) {
    const { data: p } = await sb.from('profiles').select('name').eq('id', cur.reserved_by).maybeSingle();
    return { ok: false, msg: `${p?.name ?? '다른 직원'} 요청 건입니다 — ${new Date(new Date(cur.reserved_until).getTime() + 9 * 3600e3).toISOString().slice(5, 10).replace('-', '/')} 까지 요청자 우선` };
  }
  const m = String(memo ?? '').slice(0, 500); const clear = !result && !m;
  const { error: e2 } = await sb.from('kw_contacts').update({ result, memo: m, claimed_by: clear ? null : (cur.claimed_by ?? (boss && forUser && /^[0-9a-f-]{36}$/i.test(forUser) ? forUser : me.id)), result_at: clear ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
  return e2 ? { ok: false, msg: e2.message } : { ok: true, msg: clear ? '담당 해제' : '저장됨' };
}
/** 추출기 CSV → 키워드 콜 리스트 (총괄만 올림). 화면이 1,000행씩 나눠 부른다 */
export async function kwImport(rows: Record<string, string>[]): Promise<R<{ added: number; updated: number; skipped: number }>> {
  const me = await active(); if (!me || me.role !== 'head') return { ok: false, msg: '총괄만' };
  const s = (x: unknown, n: number) => String(x ?? '').trim().slice(0, n);
  const clean = (rows ?? []).slice(0, 1000).map(r => ({ store_name: s(r.store_name, 100), store_url: s(r.store_url, 300), keyword: s(r.keyword, 60), company: s(r.company, 100), rep: s(r.rep, 40), email: s(r.email, 120).toLowerCase(), phone: s(r.phone, 30).replace(/[^\d-]/g, ''), address: s(r.address, 200), biz_no: s(r.biz_no, 20) }));
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('kw_contacts_import', { p_rows: clean }); if (error) return { ok: false, msg: needSql(error.message) };
  try { await reserveForRequesters(sb, clean.map(r => r.keyword)); } catch { /* 0090 미실행 등 — 올리기에 영향 없음 */ }
  try { await closeRequests(sb, clean.map(r => r.keyword)); } catch { /* 요청 자동 완료 실패는 올리기에 영향 없음 (0087 미실행 등) */ }
  const d = (data ?? {}) as { added?: number; updated?: number; skipped?: number };
  return { ok: true, msg: '', added: d.added ?? 0, updated: d.updated ?? 0, skipped: d.skipped ?? 0 };
}

// ── 키워드 요청 ───────────────────────────────────────────────────────
export type KwReq = { id: number; keyword: string; status: string; created_at: string; done_at: string | null; by: string };
const nk = (x: string) => x.replace(/\s+/g, '').toLowerCase();
const needSql2 = (m: string) => /kw_requests/.test(m) ? '0087 SQL(kw_requests 표)을 먼저 실행해 주세요' : needSql(m);
const RESERVE_DAYS = 7;
/** 요청한 키워드로 올라온 업체를 요청자 몫으로 잡아 둔다 (RESERVE_DAYS 일, 아직 담당 없는 건만 · 먼저 요청한 사람 우선).
 *  CSV 가 1,000행씩 나뉘어 올라오므로 방금(2시간 안) 완료된 요청도 같이 본다 */
async function reserveForRequesters(sb: ReturnType<typeof supabaseAdmin>, keywords: string[]) {
  const csv = new Map<string, Set<string>>(); for (const k of keywords) { const n = nk(k); if (n) csv.set(n, (csv.get(n) ?? new Set()).add(k)); }
  if (!csv.size) return;
  const since = new Date(Date.now() - 2 * 3600e3).toISOString();
  const { data: reqs } = await sb.from('kw_requests').select('id,keyword,requested_by,status,done_at').or(`status.eq.open,and(status.eq.done,done_at.gt.${since})`).order('id', { ascending: true }).limit(2000);
  const { data: bosses } = await sb.from('profiles').select('id').in('role', ['head', 'admin']); const boss = new Set((bosses ?? []).map(b => b.id));   // 총괄·어드민이 넣은 요청은 전체 공용 — 잡아 두지 않음
  const owner = new Map<string, string>(); for (const r of reqs ?? []) { const n = nk(r.keyword); if (csv.has(n) && !owner.has(n) && !boss.has(r.requested_by)) owner.set(n, r.requested_by); }
  const now = new Date().toISOString(); const until = new Date(Date.now() + RESERVE_DAYS * 86400e3).toISOString();
  for (const [n, user] of owner) for (const kw of csv.get(n) ?? [])
    await sb.from('kw_contacts').update({ reserved_by: user, reserved_until: until, reserved_kw: kw }).contains('keywords', [kw]).is('claimed_by', null).or(`reserved_by.is.null,reserved_until.lt.${now}`);
}
/** CSV 로 들어온 키워드의 대기 요청을 완료 처리하고 요청자에게 알림 */
async function closeRequests(sb: ReturnType<typeof supabaseAdmin>, keywords: string[]) {
  const set = new Set(keywords.map(nk).filter(Boolean)); if (!set.size) return;
  const { data: open } = await sb.from('kw_requests').select('id,keyword,requested_by').eq('status', 'open').limit(2000);
  const hit = (open ?? []).filter(r => set.has(nk(r.keyword))); if (!hit.length) return;
  await sb.from('kw_requests').update({ status: 'done', done_at: new Date().toISOString() }).in('id', hit.map(r => r.id));
  const by = new Map<string, string[]>(); for (const r of hit) by.set(r.requested_by, [...(by.get(r.requested_by) ?? []), r.keyword]);
  await sb.from('notifications').insert([...by].map(([user_id, ks]) => ({ user_id, kind: 'info', title: `요청한 키워드 ${ks.length}개가 콜 리스트에 올라왔습니다 — ${RESERVE_DAYS}일간 내 우선`, body: ks.join(', ').slice(0, 300), link: '/kw-calls' })));
}
/** 직원: 키워드 요청 (콤마·줄바꿈으로 여러 개, 한 번에 20개까지). 이미 리스트에 있거나 내가 이미 요청해 둔 건 건너뜀 */
export async function kwRequest(text: string): Promise<R<{ added: string[]; exists: string[]; dup: string[] }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const list = Array.from(new Map(String(text ?? '').split(/[\n,]+/).map(x => x.trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).map(x => [nk(x), x])).values()).slice(0, 20);
  if (!list.length) return { ok: false, msg: '키워드를 적어 주세요' };
  const sb = supabaseAdmin();
  const { data: kws, error: e0 } = await sb.rpc('kw_contact_keywords'); if (e0) return { ok: false, msg: needSql(e0.message) };
  const have = new Set(((kws ?? []) as KwCount[]).map(k => nk(k.keyword)));
  const { data: mine, error: e1 } = await sb.from('kw_requests').select('keyword').eq('requested_by', me.id).eq('status', 'open'); if (e1) return { ok: false, msg: needSql2(e1.message) };
  const mineSet = new Set((mine ?? []).map(r => nk(r.keyword)));
  const exists = list.filter(k => have.has(nk(k))), dup = list.filter(k => !have.has(nk(k)) && mineSet.has(nk(k))), added = list.filter(k => !have.has(nk(k)) && !mineSet.has(nk(k)));
  if (added.length) {
    const { error } = await sb.from('kw_requests').insert(added.map(keyword => ({ keyword, requested_by: me.id }))); if (error) return { ok: false, msg: needSql2(error.message) };
    const { data: heads } = await sb.from('profiles').select('id').eq('role', 'head').eq('is_active', true);
    if (heads?.length) await sb.from('notifications').insert(heads.filter(h => h.id !== me.id).map(h => ({ user_id: h.id, kind: 'info', title: `키워드 요청 ${added.length}개 — ${me.name}`, body: added.join(', ').slice(0, 300), link: '/kw-calls' })));
  }
  const parts = [added.length ? `요청 ${added.length}개 접수` : '', exists.length ? `이미 리스트에 있음: ${exists.join(', ')}` : '', dup.length ? `이미 요청해 둠: ${dup.join(', ')}` : ''].filter(Boolean);
  return { ok: true, msg: parts.join(' · '), added, exists, dup };
}
/** 내 요청 (최근 30개) + 총괄이면 대기 중인 전체 요청 */
export async function kwRequests(): Promise<R<{ mine: KwReq[]; open: KwReq[] }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin(); const boss = me.role === 'head' || me.role === 'admin';
  const { data: m, error } = await sb.from('kw_requests').select('id,keyword,status,created_at,done_at').eq('requested_by', me.id).order('id', { ascending: false }).limit(30);
  if (error) return { ok: false, msg: needSql2(error.message) };
  let open: KwReq[] = [];
  if (boss) {
    const { data: o } = await sb.from('kw_requests').select('id,keyword,status,created_at,done_at,requested_by').eq('status', 'open').order('id', { ascending: true }).limit(1000);
    const ids = Array.from(new Set((o ?? []).map(r => r.requested_by))); const names = new Map<string, string>();
    if (ids.length) { const { data: ps } = await sb.from('profiles').select('id,name').in('id', ids); for (const p of ps ?? []) names.set(p.id, p.name); }
    open = (o ?? []).map(r => ({ id: r.id, keyword: r.keyword, status: r.status, created_at: r.created_at, done_at: r.done_at, by: names.get(r.requested_by) ?? '' }));
  }
  return { ok: true, msg: '', mine: (m ?? []).map(r => ({ ...r, by: me.name })), open };
}
/** 총괄: 요청을 손으로 닫기 — done(올렸음) / rejected(업체가 안 나옴 등). 요청자에게 알림 */
export async function kwCloseRequest(ids: number[], status: 'done' | 'rejected'): Promise<R> {
  const me = await active(); if (!me || !(me.role === 'head' || me.role === 'admin')) return { ok: false, msg: '총괄만' };
  const sb = supabaseAdmin(); const list = (ids ?? []).slice(0, 500); if (!list.length) return { ok: false, msg: '대상 없음' };
  const { data: rows, error } = await sb.from('kw_requests').update({ status, done_at: new Date().toISOString() }).in('id', list).eq('status', 'open').select('keyword,requested_by');
  if (error) return { ok: false, msg: needSql2(error.message) };
  const by = new Map<string, string[]>(); for (const r of rows ?? []) by.set(r.requested_by, [...(by.get(r.requested_by) ?? []), r.keyword]);
  if (by.size) await sb.from('notifications').insert([...by].map(([user_id, ks]) => ({ user_id, kind: 'info', title: status === 'done' ? `요청한 키워드 ${ks.length}개 처리 완료` : `요청한 키워드 ${ks.length}개는 업체가 나오지 않았습니다`, body: ks.join(', ').slice(0, 300), link: '/kw-calls' })));
  return { ok: true, msg: `${rows?.length ?? 0}개 ${status === 'done' ? '완료' : '반려'} 처리` };
}
