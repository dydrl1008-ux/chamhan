// ykreward (리워드 슬롯 관리, 별도 Supabase 프로젝트) 연동 — 서비스 키로 서버에서만 호출
//   env: YKREWARD_URL, YKREWARD_SERVICE_KEY
import { createClient } from '@supabase/supabase-js';

export const ykrReady = () => !!(process.env.YKREWARD_URL && process.env.YKREWARD_SERVICE_KEY);
export const ykr = () => createClient(process.env.YKREWARD_URL!, process.env.YKREWARD_SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const EMAIL_DOMAIN = 'ykad.local';                                   // ykreward 로그인 이메일 규칙: <아이디>@ykad.local

export type Seller = { id: string; login_id: string; name: string; parent: string; manager: string | null; active: boolean; slots: number };
export type SlotType = { name: string; sort_order: number };

/** 셀러 아이디 하나 조회 (목록은 안 보여줌 — 각자 자기 고객만) */
export async function findSeller(login: string): Promise<Seller | null> {
  const sb = ykr(); const id = login.trim().toLowerCase(); if (!id) return null;
  const { data: a } = await sb.from('accounts').select('id,login_id,name,role,parent_id,manager,active').eq('login_id', id).maybeSingle();
  if (!a || a.role !== 'seller') return null;
  const [{ data: parent }, { count }] = await Promise.all([
    a.parent_id ? sb.from('accounts').select('name').eq('id', a.parent_id).maybeSingle() : Promise.resolve({ data: null as any }),
    sb.from('slots').select('id', { count: 'exact', head: true }).eq('owner_id', a.id).is('stopped_at', null).is('dropped_at', null),
  ]);
  return { id: a.id, login_id: a.login_id, name: a.name ?? '', parent: parent?.name ?? '', manager: a.manager, active: !!a.active, slots: count ?? 0 };
}
export const DEFAULT_BLOCK = '아센도,리얼,세이브';
export const parseBlock = (v: string | null | undefined) => (v ?? DEFAULT_BLOCK).split(',').map(x => x.trim()).filter(Boolean);
export const isBlocked = (type: string, block: string[]) => block.some(b => type.replace(/\s/g, '').includes(b.replace(/\s/g, '')));
/** 발급 가능한 유형만 (설정 ykreward_block_types 에 걸리는 유형 제외) */
export async function listSlotTypes(block: string[]): Promise<SlotType[]> {
  const { data } = await ykr().from('slot_types').select('name,sort_order').eq('active', true).order('sort_order');
  return ((data ?? []) as SlotType[]).filter(t => !isBlocked(t.name, block));
}
/** 활성 유형이 하나도 없으면 ykreward 도 유형 없이(null) 발급하므로 그대로 허용 */
export async function hasActiveTypes(): Promise<boolean> {
  const { count } = await ykr().from('slot_types').select('id', { count: 'exact', head: true }).eq('active', true);
  return (count ?? 0) > 0;
}
/** 셀러 계정 생성: auth 유저(<id>@ykad.local) + accounts 행. 소속(parent)은 app_settings.ykreward_parent_login */
export async function createSeller(p: { login: string; password: string; name: string; parentLogin: string; manager: string }): Promise<{ ok: boolean; msg: string }> {
  const login = p.login.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(login)) return { ok: false, msg: '아이디는 영문 소문자·숫자·_ 3~30자' };
  if (p.password.length < 6) return { ok: false, msg: '비밀번호는 6자 이상' };
  const sb = ykr();
  const { data: dup } = await sb.from('accounts').select('id').eq('login_id', login).maybeSingle();
  if (dup) return { ok: false, msg: `이미 있는 아이디입니다: ${login}` };
  const { data: parent } = await sb.from('accounts').select('id,role').eq('login_id', p.parentLogin).maybeSingle();
  if (!parent) return { ok: false, msg: `소속 계정(${p.parentLogin})을 ykreward 에서 찾을 수 없습니다. 설정 › ykreward_parent_login 확인` };
  const { data: u, error: e1 } = await sb.auth.admin.createUser({ email: `${login}@${EMAIL_DOMAIN}`, password: p.password, email_confirm: true, user_metadata: { login_id: login, created_by: 'workhub' } });
  if (e1 || !u.user) return { ok: false, msg: `auth 생성 실패: ${e1?.message ?? ''}` };
  const { error: e2 } = await sb.from('accounts').insert({ id: u.user.id, login_id: login, role: 'seller', parent_id: parent.id, name: p.name.trim() || login, manager: p.manager, active: true });
  if (e2) { await sb.auth.admin.deleteUser(u.user.id).catch(() => {}); return { ok: false, msg: `계정 행 생성 실패: ${e2.message}` }; }
  return { ok: true, msg: `셀러 계정 생성: ${login}` };
}
/** 슬롯 발급 (ykreward workhub_issue_slots) → 발급된 슬롯 code 목록 */
export async function issueSlots(p: { login: string; count: number; dailyGoal: number; start: string; days: number; slotType: string; rewardName: string; openedBy: string }): Promise<{ ok: boolean; msg: string; codes: number[] }> {
  const { data, error } = await ykr().rpc('workhub_issue_slots', { p_target_login: p.login, p_count: p.count, p_daily_goal: p.dailyGoal, p_start: p.start, p_days: p.days, p_slot_type: p.slotType || null, p_reward_name: p.rewardName || null, p_opened_by: p.openedBy });
  if (error) return { ok: false, msg: error.message.replace(/^.*?: /, ''), codes: [] };
  const codes = ((data ?? []) as any[]).map(s => Number(s.code)).filter(Boolean);
  return { ok: true, msg: `${codes.length}개 발급`, codes };
}
/** 워크허브에서 연 슬롯 현황 (opened_by = 워크허브 직원 이름) */
export type OpenedSlot = { id: string; code: number; owner: string; owner_login: string; slot_type: string | null; reward_name: string | null; opened_by: string; keyword: string | null; mid: string | null; registered_at: string | null; stopped_at: string | null; dropped_at: string | null; start_date: string | null; end_date: string | null; daily_goal: number | null; rank: number | null; prev_rank: number | null; rank_at: string | null; title: string | null; store: string | null };
/** 내 슬롯 = 워크허브에서 연 것(opened_by) ∪ 내 셀러 계정의 슬롯. 둘 다 비우면(총괄·대표) 전체 */
export async function openedSlots(openedBy?: string[], sellerLogins?: string[]): Promise<OpenedSlot[]> {
  const sb = ykr(); const sel = 'id,code,owner_id,slot_type,reward_name,opened_by,keyword,mid,registered_at,stopped_at,dropped_at,accounts!owner_id(login_id,name),slot_segments(start_date,end_date,daily_goal,seq)';
  const all = openedBy === undefined && sellerLogins === undefined;
  let rows: any[] = [];
  if (all) { const { data, error } = await sb.from('slots').select(sel).or('opened_by.not.is.null').order('code', { ascending: false }).limit(1000); if (error) throw new Error('ykreward 조회 실패: ' + error.message); rows = data ?? []; }
  else {
    const qs: PromiseLike<any>[] = [];
    if (openedBy?.length) qs.push(sb.from('slots').select(sel).in('opened_by', openedBy).order('code', { ascending: false }).limit(1000));
    if (sellerLogins?.length) {
      const { data: accs } = await sb.from('accounts').select('id').in('login_id', sellerLogins);
      if (accs?.length) qs.push(sb.from('slots').select(sel).in('owner_id', accs.map(a => a.id)).is('dropped_at', null).order('code', { ascending: false }).limit(1000));
    }
    for (const r of await Promise.all(qs)) { if (r.error) throw new Error('ykreward 조회 실패: ' + r.error.message); rows.push(...(r.data ?? [])); }
    const seen = new Set<string>(); rows = rows.filter(x => !seen.has(x.id) && seen.add(x.id)).sort((a, b) => Number(b.code) - Number(a.code));
  }
  const data = rows; const error = null as any;
  if (error) throw new Error('ykreward 조회 실패: ' + error.message);
  const codes = (data ?? []).map((s: any) => s.code);
  const { data: vs } = codes.length ? await ykr().from('v_slots').select('code,rank,prev_rank,rank_at,title,store').in('code', codes) : { data: [] as any[] };
  const rk = new Map((vs ?? []).map((v: any) => [Number(v.code), v]));
  return (data ?? []).map((s: any) => { const v = rk.get(Number(s.code)); const segs = [...(s.slot_segments ?? [])].sort((a: any, b: any) => a.seq - b.seq); const acc = Array.isArray(s.accounts) ? s.accounts[0] : s.accounts;
    return { id: s.id, code: Number(s.code), owner: acc ? `${acc.name ?? ''} (${acc.login_id})` : '', owner_login: acc?.login_id ?? '', slot_type: s.slot_type, reward_name: s.reward_name, opened_by: s.opened_by, keyword: s.keyword, mid: s.mid, registered_at: s.registered_at, stopped_at: s.stopped_at, dropped_at: s.dropped_at, start_date: segs[0]?.start_date ?? null, end_date: segs.at(-1)?.end_date ?? null, daily_goal: segs[0]?.daily_goal ?? null, rank: v?.rank ?? null, prev_rank: v?.prev_rank ?? null, rank_at: v?.rank_at ?? null, title: v?.title ?? null, store: v?.store ?? null }; });
}

/** 상품 URL → MID (스마트스토어·브랜드스토어 상품 페이지만, 가격비교(catalog)는 ykreward 에서) */
export function parseMid(url: string): { ok: true; mid: string; url: string } | { ok: false; msg: string } {
  const u = url.trim(); if (!u) return { ok: false, msg: '상품 URL이 없습니다' };
  const m = u.match(/^https?:\/\/(?:m\.)?(?:smartstore|brand)\.naver\.com\/[^/?#]+\/products\/(\d+)/i);
  if (m) return { ok: true, mid: m[1], url: u.split(/[?#]/)[0] };
  if (/shopping\.naver\.com\/.*catalog\/\d+/i.test(u)) return { ok: false, msg: '가격비교(카탈로그) 상품은 ykreward 에서 등록해 주세요' };
  return { ok: false, msg: '스마트스토어·브랜드스토어 상품 URL(…/products/숫자)만 등록할 수 있습니다' };
}
/** 발급된 슬롯에 상품·키워드 등록 — 워크허브가 연 슬롯(opened_by 있음)만. 트리거가 수집 큐에 넣음 */
export async function registerSlots(p: { codes: number[]; url: string; keyword: string }): Promise<{ ok: boolean; msg: string; n: number }> {
  const r = parseMid(p.url); if (!r.ok) return { ok: false, msg: r.msg, n: 0 };
  const kw = p.keyword.trim(); if (!kw) return { ok: false, msg: '키워드를 입력하세요', n: 0 };
  const sb = ykr();
  const { data: rows, error: e0 } = await sb.from('slots').select('id,code,opened_by,dropped_at,stopped_at').in('code', p.codes);
  if (e0) return { ok: false, msg: 'ykreward 조회 실패: ' + e0.message, n: 0 };
  if (!rows?.length) return { ok: false, msg: `슬롯 #${p.codes.join(',')} 을 ykreward 에서 찾지 못함`, n: 0 };
  const targets = rows.filter(x => x.opened_by && !x.dropped_at);
  if (!targets.length) return { ok: false, msg: '워크허브에서 연 슬롯만 등록할 수 있습니다 (opened_by 없음 또는 회수됨)', n: 0 };
  const { data, error } = await sb.from('slots').update({ url: r.url, mid: r.mid, keyword: kw, cmp_checked: true, cmp_mid: null, registered_at: new Date().toISOString() })
    .in('id', targets.map(x => x.id)).select('code');
  if (error) return { ok: false, msg: 'ykreward 등록 실패: ' + error.message + (error.details ? ` (${error.details})` : ''), n: 0 };
  if (!data?.length) return { ok: false, msg: '등록 요청은 갔지만 바뀐 행이 없음 (ykreward 트리거/권한 확인 필요)', n: 0 };
  return { ok: true, msg: `${data.length}개 슬롯에 등록 (MID ${r.mid} · ${kw})`, n: data.length };
}

// ───────── 순위 체크 (rank_watch) ─────────
export type WatchRow = { id: string; owner_login: string; owner: string; group: string; keyword: string; title: string | null; store: string | null; url: string | null; memo: string | null; cur_rank: number | null; cur_at: string | null; prev_rank: number | null; diff: number | null; trend: string | null; active: boolean; q_status: string | null; mid: string | null; mid_type: string | null; cmp_mid: string | null; image_url: string | null };
export const GROUP_NONE = '(미분류)';
/** ykreward 계정 → 순위 체크 항목 (v_rank_watch). logins 비우면 전체 */
export async function watchRows(logins?: string[]): Promise<WatchRow[]> {
  const sb = ykr();
  let ids: string[] | undefined;
  if (logins) { if (!logins.length) return []; const { data: accs } = await sb.from('accounts').select('id').in('login_id', logins); ids = (accs ?? []).map(a => a.id); if (!ids.length) return []; }
  let q = sb.from('v_rank_watch').select('id,owner_id,owner,url,mid,mid_type,cmp_mid,image_url,keyword,title,store,memo,active,cur_rank,cur_at,prev_rank,diff,trend,group_name,group_order,sort_order,q_status').eq('active', true).order('group_order', { ascending: true, nullsFirst: false }).order('sort_order').limit(3000);
  if (ids) q = q.in('owner_id', ids);
  const { data, error } = await q; if (error) throw new Error('ykreward 순위 체크 조회 실패: ' + error.message);
  const { data: accs2 } = await sb.from('accounts').select('id,login_id').in('id', [...new Set((data ?? []).map((x: any) => x.owner_id))]);
  const lg = new Map((accs2 ?? []).map(a => [a.id, a.login_id]));
  return (data ?? []).map((x: any) => ({ id: x.id, owner_login: lg.get(x.owner_id) ?? '', owner: x.owner ?? '', group: x.group_name?.trim() || GROUP_NONE, keyword: x.keyword, title: x.title, store: x.store, url: x.url, memo: x.memo, cur_rank: x.cur_rank > 0 ? x.cur_rank : null, cur_at: x.cur_at, prev_rank: x.prev_rank > 0 ? x.prev_rank : null, diff: x.diff, trend: x.trend, active: !!x.active, q_status: x.q_status, mid: x.mid, mid_type: x.mid_type, cmp_mid: x.cmp_mid, image_url: x.image_url }));
}
export async function accountExists(login: string): Promise<{ ok: boolean; name?: string }> {
  const { data } = await ykr().from('accounts').select('name').eq('login_id', login.trim().toLowerCase()).maybeSingle();
  return data ? { ok: true, name: data.name ?? '' } : { ok: false };
}
/** 순위 변동 알림 — 직원별 ★ 주요 업체의 항목만, 마지막 알림 순위 대비 delta 이상 변동 또는 노출↔미노출 */
export async function rankAlerts(wh: { from: (t: string) => any }, delta: number): Promise<{ users: number; checked: number; notified: number; items: string[] }> {
  const [{ data: links }, { data: stars }] = await Promise.all([wh.from('reward_watch_links').select('user_id,login_id'), wh.from('reward_watch_stars').select('user_id,group_key')]);
  if (!links?.length || !stars?.length) return { users: 0, checked: 0, notified: 0, items: [] };
  const starSet = new Set((stars as any[]).map(x => `${x.user_id}|${x.group_key}`));
  const rows = await watchRows([...new Set((links as any[]).map(l => l.login_id))]);
  const { data: snaps } = await wh.from('reward_watch_snap').select('watch_id,rank,cur_at');
  const snap = new Map<string, any>((snaps ?? []).map((x: any) => [x.watch_id, x]));
  const upserts: any[] = []; const byUser = new Map<string, string[]>(); let checked = 0;
  for (const l of links as any[]) {
    for (const w of rows.filter(x => x.owner_login === l.login_id)) {
      if (!starSet.has(`${l.user_id}|${w.group}`)) continue; checked++;
      const sn = snap.get(w.id); const cur = w.cur_rank;
      if (!sn) { upserts.push({ watch_id: w.id, user_id: l.user_id, rank: cur, cur_at: w.cur_at }); continue; }
      if (w.cur_at && sn.cur_at && w.cur_at <= sn.cur_at) continue;
      const prev: number | null = sn.rank > 0 ? sn.rank : null;
      const changed = (prev === null) !== (cur === null) || (prev !== null && cur !== null && Math.abs(cur - prev) >= delta);
      if (!changed) continue;
      const up = cur !== null && (prev === null || cur < prev);
      const arr = byUser.get(l.user_id) ?? []; arr.push(`${up ? '▲' : '▼'} ${w.group !== GROUP_NONE ? w.group + ' · ' : ''}${w.keyword} ${prev ?? '미노출'} → ${cur ?? '미노출'}${w.store ? ` (${w.store})` : ''}`); byUser.set(l.user_id, arr);
      upserts.push({ watch_id: w.id, user_id: l.user_id, rank: cur, cur_at: w.cur_at });
    }
  }
  const items: string[] = []; let notified = 0;
  for (const [uid, arr] of byUser) {
    const downs = arr.filter(x => x.startsWith('▼')).length; const ups = arr.length - downs;
    const { error } = await wh.from('notifications').insert({ user_id: uid, kind: downs ? 'alert' : 'info', title: `주요 업체 순위 변동 ${arr.length}건${downs ? ` · 하락 ${downs}` : ''}${ups ? ` · 상승 ${ups}` : ''}`, body: arr.join('\n'), link: '/rank-watch' });
    if (!error) { notified++; items.push(...arr); }
  }
  if (upserts.length) await wh.from('reward_watch_snap').upsert(upserts.map(u => ({ ...u, notified_at: new Date().toISOString() })), { onConflict: 'watch_id' });
  return { users: links.length, checked, notified, items };
}

/** 재체크 — 순위 수집 큐에 다시 넣음 (ykreward 봇이 다음 순서에 수집). rank_watch_requeue 와 같은 효과 */
export async function requeueWatch(rows: WatchRow[]): Promise<{ ok: boolean; msg: string; n: number }> {
  if (!rows.length) return { ok: false, msg: '대상 없음', n: 0 };
  const sb = ykr();
  const { error } = await sb.from('rank_watch_queue').upsert(rows.map(w => ({ watch_id: w.id, keyword: w.keyword, mid: w.mid, mid_type: w.mid_type, url: w.url, cmp_mid: w.cmp_mid, status: 'pending', tries: 0, last_error: null, claimed_at: null })), { onConflict: 'watch_id' });
  if (error) {   // 큐 직접 쓰기가 막혀 있으면 ykreward 함수로
    const { error: e2 } = await sb.rpc('rank_watch_requeue', { p_ids: rows.map(w => w.id) });
    if (e2) return { ok: false, msg: '재체크 요청 실패: ' + e2.message, n: 0 };
  }
  return { ok: true, msg: `${rows.length}건 재체크 요청 — 수집 봇이 순서대로 다시 확인합니다`, n: rows.length };
}

/** 순위 히스토리 (최근 N일, 성공 수집만) → watch_id 별 [{t, r}] 시간순. r = null 은 미노출 */
export type HistPt = { t: string; r: number | null };
export async function watchHistory(ids: string[], days = 30): Promise<Record<string, HistPt[]>> {
  if (!ids.length) return {};
  const since = new Date(Date.now() - days * 864e5).toISOString(); const out: Record<string, HistPt[]> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (let off = 0; ; off += 1000) {                       // PostgREST 1000행 제한 → 페이지로 전부
      const { data } = await ykr().from('rank_watch_history').select('watch_id,rank,checked_at,checked_ok').in('watch_id', chunk).gte('checked_at', since).order('checked_at').range(off, off + 999);
      for (const h of data ?? []) { if (h.checked_ok === false) continue; (out[h.watch_id] ??= []).push({ t: h.checked_at, r: h.rank && h.rank > 0 ? h.rank : null }); }
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

/** 순위 체크 등록 — 내 ykreward 계정 담당으로 상품 URL + 키워드 여러 개. 중복(같은 MID·키워드)은 건너뜀. 수집 큐에 바로 넣음 */
export async function addWatch(p: { ownerLogin: string; url: string; keywords: string[]; group: string; memo: string }): Promise<{ ok: boolean; msg: string; n: number }> {
  const r = parseMid(p.url); if (!r.ok) return { ok: false, msg: r.msg, n: 0 };
  const kws = [...new Set(p.keywords.map(k => k.trim()).filter(Boolean))]; if (!kws.length) return { ok: false, msg: '키워드를 입력하세요', n: 0 };
  const sb = ykr();
  const { data: acc } = await sb.from('accounts').select('id').eq('login_id', p.ownerLogin).maybeSingle(); if (!acc) return { ok: false, msg: 'ykreward 계정을 찾을 수 없습니다', n: 0 };
  const { data: dup } = await sb.from('rank_watch').select('keyword').eq('owner_id', acc.id).eq('mid', r.mid).in('keyword', kws);
  const have = new Set((dup ?? []).map((x: any) => x.keyword)); const todo = kws.filter(k => !have.has(k));
  if (!todo.length) return { ok: false, msg: '이미 등록된 상품·키워드입니다', n: 0 };
  const { data: mx } = await sb.from('rank_watch').select('sort_order').eq('owner_id', acc.id).order('sort_order', { ascending: false }).limit(1);
  let so = Number(mx?.[0]?.sort_order ?? 0);
  const group = p.group.trim() && p.group.trim() !== GROUP_NONE ? p.group.trim() : null;
  const { data: ins, error } = await sb.from('rank_watch').insert(todo.map(k => ({ owner_id: acc.id, mid: r.mid, url: r.url, keyword: k, group_name: group, memo: p.memo.trim() || null, active: true, cmp_checked: true, sort_order: (so += 100) }))).select('id,keyword,mid,url');
  if (error) return { ok: false, msg: '등록 실패: ' + error.message, n: 0 };
  await sb.from('rank_watch_queue').upsert((ins ?? []).map((w: any) => ({ watch_id: w.id, keyword: w.keyword, mid: w.mid, url: w.url, status: 'pending', tries: 0 })), { onConflict: 'watch_id' });
  return { ok: true, msg: `${ins?.length ?? 0}개 등록 — 곧 첫 순위가 수집됩니다${have.size ? ` (이미 있던 ${have.size}개 제외)` : ''}`, n: ins?.length ?? 0 };
}
/** 업체(그룹) 이동 · 이름 변경 */
export async function setWatchGroup(ids: string[], group: string): Promise<{ ok: boolean; msg: string }> {
  const g = group.trim() && group.trim() !== GROUP_NONE ? group.trim() : null;
  const { error } = await ykr().from('rank_watch').update({ group_name: g }).in('id', ids);
  return error ? { ok: false, msg: error.message } : { ok: true, msg: `${ids.length}개 → ${g ?? GROUP_NONE}` };
}
/** 순위 체크 항목 삭제(비활성) */
export async function removeWatch(ids: string[]): Promise<{ ok: boolean; msg: string }> {
  const { error } = await ykr().from('rank_watch').update({ active: false }).in('id', ids);
  return error ? { ok: false, msg: error.message } : { ok: true, msg: `${ids.length}개 삭제` };
}


/** 순서 저장 — 업체(그룹) 순서: group_order, 업체 안 상품 순서: sort_order (내 계정 담당 건만, 호출 쪽에서 필터) */
export async function saveWatchOrder(p: { ownerLogin: string; groups?: string[]; items?: string[] }): Promise<{ ok: boolean; msg: string }> {
  const sb = ykr();
  const { data: acc } = await sb.from('accounts').select('id').eq('login_id', p.ownerLogin).maybeSingle(); if (!acc) return { ok: false, msg: '계정 없음' };
  if (p.groups?.length) {
    for (let i = 0; i < p.groups.length; i++) {
      const g = p.groups[i]; const q = sb.from('rank_watch').update({ group_order: (i + 1) * 10 }).eq('owner_id', acc.id);
      const { error } = g === GROUP_NONE ? await q.is('group_name', null) : await q.eq('group_name', g);
      if (error) return { ok: false, msg: error.message };
    }
  }
  if (p.items?.length) {
    const { data: mine } = await sb.from('rank_watch').select('id').eq('owner_id', acc.id).in('id', p.items); const ok = new Set((mine ?? []).map(x => x.id));
    let i = 0; for (const id of p.items) { if (!ok.has(id)) continue; const { error } = await sb.from('rank_watch').update({ sort_order: (++i) * 100 }).eq('id', id); if (error) return { ok: false, msg: error.message }; }
  }
  return { ok: true, msg: '순서 저장' };
}
