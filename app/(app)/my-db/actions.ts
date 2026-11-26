'use server';
// 내 DB — 직원 개인별 가망 고객 정리. 표(my_db)는 RLS 로 막아 두고 여기서만 권한을 따져 읽고 쓴다
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { search } from '@/lib/nsc';
import { syncFromMyDb } from '@/lib/metaLink';
type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
export type DbRow = { id: number; owner_id: string; source: string; contact_date: string | null; name: string; phone: string; biz_no: string; kind: string; gender: string; channel: string; item: string; url: string; url2: string; grade: string; status: string; paid_at: string | null; next_on: string | null; alarm_time: string; rank_now: number | null; rank_prev: number | null; rank_at: string | null; rank_title: string; expect_amt: number | null; rank_hist: { t: string; r: number; k: string }[]; note1: string; note2: string; note3: string; deleted_at: string | null; deleted_by: string | null; created_at: string; updated_at: string; owner_name?: string; deleted_name?: string; meta_id?: number | null; paid_amt?: number | null; cost_amt?: number | null };
export type DbIn = { contact_date?: string | null; name: string; phone?: string; biz_no?: string; kind?: string; gender?: string; channel?: string; item?: string; url?: string; url2?: string; grade?: string; status?: string; next_on?: string | null; alarm_time?: string; expect_amt?: number | string | null; note1?: string; note2?: string; note3?: string; paid_amt?: number | string | null; cost_amt?: number | string | null };
const COLS = 'id,owner_id,source,contact_date,name,phone,biz_no,kind,gender,channel,item,url,url2,grade,status,paid_at,next_on,alarm_time,rank_now,rank_prev,rank_at,rank_title,rank_hist,expect_amt,note1,note2,note3,deleted_at,deleted_by,created_at,updated_at';
const COLS_META = COLS + ',meta_id,paid_amt,cost_amt';   // 0104 (메타 인바운드 연결). SQL 전이면 COLS 로 다시 읽는다
const GRADES = ['', 'S', 'A', 'B', 'C', 'D', 'E', 'F']; const STATUSES = ['진행', '결제', '이탈', '보류', '종료', '부재', '허수'];   // 부재 · 허수는 메타 인바운드 건에서만 고른다   // 이탈 = 결제했다가 빠진 고객
const TRASH_DAYS = 30;   // 직원은 지운 지 30일까지만 되살릴 수 있음. 총괄 화면에는 계속 남는다
const needSql = (m: string) => /expect_amt/.test(m) ? '0095 SQL(결제 예상 금액 칸)을 먼저 실행해 주세요' : /rank_/.test(m) ? '0094 SQL(순위 칸)을 먼저 실행해 주세요' : /alarm_/.test(m) ? '0093 SQL(알람 시각 칸)을 먼저 실행해 주세요' : /my_db/.test(m) ? '0092 SQL(my_db 표)을 먼저 실행해 주세요' : m;
const active = async () => { const me = await getProfile(); return me && me.is_active ? me : null; };
const isBoss = (me: { role: string }) => me.role === 'head' || me.role === 'admin';
const s = (x: unknown, n: number) => String(x ?? '').trim().slice(0, n);
const day = (x: unknown) => { const t = String(x ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };
const pk = (p: string) => p.replace(/\D/g, '');
/** 이 사람의 DB 를 내가 볼 수 있나 — 본인 / 팀장은 팀원 / 총괄·어드민은 전부 */
async function canSee(me: { id: string; role: string; team_id: number | null }, target: string) {
  if (target === me.id || isBoss(me)) return true;
  if (me.role !== 'manager') return false;
  const { data } = await supabaseAdmin().from('profiles').select('team_id').eq('id', target).maybeSingle();
  return !!data && data.team_id != null && data.team_id === me.team_id;
}
const clean = (r: DbIn) => ({ contact_date: day(r.contact_date), name: s(r.name, 100), phone: s(r.phone, 40), phone_key: pk(s(r.phone, 40)).slice(0, 15), biz_no: s(r.biz_no, 20), kind: s(r.kind, 40), gender: s(r.gender, 4), channel: s(r.channel, 20), item: s(r.item, 80), url: s(r.url, 400), url2: s(r.url2, 400),
  grade: GRADES.includes(s(r.grade, 2).toUpperCase()) ? s(r.grade, 2).toUpperCase() : '', status: STATUSES.includes(s(r.status, 4)) ? s(r.status, 4) : '진행', next_on: day(r.next_on), expect_amt: (() => { const n = Number(String(r.expect_amt ?? '').replace(/[^\d.]/g, '')); return n > 0 && n < 1e12 ? Math.round(n) : null; })(), alarm_time: /^\d{2}:\d{2}$/.test(s(r.alarm_time, 5)) ? s(r.alarm_time, 5) : '', note1: s(r.note1, 1000), note2: s(r.note2, 1000), note3: s(r.note3, 1000) });
const amt = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return n > 0 && n < 1e12 ? Math.round(n) : null; };

export async function dbList(userId?: string, trash = false): Promise<R<{ rows: DbRow[] }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const target = userId || me.id; if (!(await canSee(me, target))) return { ok: false, msg: '권한 없음' };
  const sb = supabaseAdmin(); const cut = new Date(Date.now() - TRASH_DAYS * 86400e3).toISOString(); const rows: DbRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {   // 한 번에 1,000줄까지만 내려오므로 나눠서 끝까지 읽는다
    const run = (cols: string) => { let q = sb.from('my_db').select(cols).eq('owner_id', target).order('id', { ascending: false }).range(from, from + 999);
      if (trash) { q = q.not('deleted_at', 'is', null); if (!isBoss(me)) q = q.gt('deleted_at', cut); } else q = q.is('deleted_at', null); return q; };
    let { data, error } = await run(COLS_META); if (error && /meta_id|paid_amt|cost_amt/.test(error.message)) ({ data, error } = await run(COLS));
    if (error) return { ok: false, msg: needSql(error.message) };
    rows.push(...((data ?? []) as unknown as DbRow[])); if ((data ?? []).length < 1000) break;
  }
  return { ok: true, msg: '', rows };
}
/** 여러 건 넣기 (직접 입력·엑셀·붙여넣기). 다른 직원과 겹쳐도 등록된다 — 막는 건 두 가지뿐: 내 DB 에 이미 있는 번호, 다른 직원이 「결제」로 관리 중인 번호. forUser: 총괄이 다른 직원에게 배정 */
export async function dbAdd(rows: DbIn[], source: string, forUser?: string): Promise<R<{ added: number; dup: { name: string; who: string }[] }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const owner = forUser && forUser !== me.id ? (isBoss(me) ? forUser : null) : me.id; if (!owner) return { ok: false, msg: '다른 직원에게 넣는 건 총괄만 가능합니다' };
  const list = (rows ?? []).slice(0, 2000).map(clean).filter(r => r.name); if (!list.length) return { ok: false, msg: '넣을 업체가 없습니다 (상호명이 비어 있음)' };
  const sb = supabaseAdmin(); const keys = Array.from(new Set(list.map(r => r.phone_key).filter(k => k.length >= 8)));
  const taken = new Map<string, string>();   // 번호 → 막는 사람 (내 것이면 본인, 아니면 결제로 관리 중인 직원)
  for (let i = 0; i < keys.length; i += 300) { const { data, error } = await sb.from('my_db').select('phone_key,owner_id,status').in('phone_key', keys.slice(i, i + 300)).is('deleted_at', null); if (error) return { ok: false, msg: needSql(error.message) };
    for (const r of data ?? []) { if (r.owner_id === owner) taken.set(r.phone_key, owner); else if (r.status === '결제' && taken.get(r.phone_key) !== owner) taken.set(r.phone_key, r.owner_id); } }
  const ids = Array.from(new Set(taken.values())); const names = new Map<string, string>(); if (ids.length) { const { data } = await sb.from('profiles').select('id,name').in('id', ids); for (const p of data ?? []) names.set(p.id, p.name); }
  const dup: { name: string; who: string }[] = []; const seen = new Set<string>(); const ins: any[] = [];
  for (const r of list) {
    const k = r.phone_key.length >= 8 ? r.phone_key : '';
    if (k && taken.has(k)) { dup.push({ name: r.name, who: taken.get(k) === owner ? '이미 있음' : `${names.get(taken.get(k)!) ?? '다른 직원'} 결제 고객` }); continue; }
    if (k && seen.has(k)) { dup.push({ name: r.name, who: '파일 안 중복' }); continue; } if (k) seen.add(k);
    ins.push({ ...r, owner_id: owner, created_by: me.id, source: owner === me.id ? s(source, 10) || '직접' : '배정', paid_at: r.status === '결제' ? new Date().toISOString() : null });
  }
  for (let i = 0; i < ins.length; i += 500) { const { error } = await sb.from('my_db').insert(ins.slice(i, i + 500)); if (error) return { ok: false, msg: needSql(error.message) }; }
  if (owner !== me.id && ins.length) await sb.from('notifications').insert({ user_id: owner, kind: 'info', title: `DB ${ins.length}건이 배정되었습니다 — ${me.name}`, body: ins.slice(0, 8).map(r => r.name).join(', ').slice(0, 300), link: '/my-db' });
  return { ok: true, msg: `${ins.length}건 등록` + (dup.length ? ` · ${dup.length}건 건너뜀(중복)` : ''), added: ins.length, dup: dup.slice(0, 200) };
}
/** 콜 리스트·키워드 콜 리스트의 업체를 내 DB 로 담기 */
export async function dbFrom(kind: 'lead' | 'kw', id: number): Promise<R> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin(); const ref = `${kind}:${id}`;
  const { data: ex, error: e0 } = await sb.from('my_db').select('id').eq('src_ref', ref).eq('owner_id', me.id).is('deleted_at', null).limit(1); if (e0) return { ok: false, msg: needSql(e0.message) };
  if (ex?.length) return { ok: false, msg: '이미 내 DB 에 있습니다' };
  let row: DbIn | null = null;
  if (kind === 'lead') { const { data } = await sb.from('leads').select('store_name,phone,keyword,category,store_url,product_url,note,assigned_to').eq('id', id).maybeSingle(); if (data && (data.assigned_to === me.id || isBoss(me))) row = { name: data.store_name, phone: data.phone ?? '', kind: '스토어', item: data.keyword ?? '', url: data.product_url || data.store_url || '', note1: data.note ?? '' }; }
  else { const { data } = await sb.from('kw_contacts').select('store_name,phone,biz_no,store_url,keywords,memo,result').eq('id', id).maybeSingle(); if (data) row = { name: data.store_name, phone: data.phone ?? '', biz_no: data.biz_no ?? '', kind: '스토어', item: (data.keywords ?? [])[0] ?? '', url: data.store_url ?? '', note1: [data.result, data.memo].filter(Boolean).join(' · ') }; }
  if (!row) return { ok: false, msg: '업체를 찾지 못했습니다' };
  const c = clean({ ...row, contact_date: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) });
  if (c.phone_key.length >= 8) { const { data: d } = await sb.from('my_db').select('owner_id,status').eq('phone_key', c.phone_key).is('deleted_at', null).limit(50); if (d?.some(x => x.owner_id === me.id)) return { ok: false, msg: '같은 전화번호가 이미 내 DB 에 있습니다' }; if (d?.some(x => x.status === '결제')) return { ok: false, msg: '다른 직원의 결제 고객입니다' }; }
  const { error } = await sb.from('my_db').insert({ ...c, owner_id: me.id, created_by: me.id, source: kind === 'lead' ? '콜리스트' : '키워드콜', src_ref: ref });
  return error ? { ok: false, msg: needSql(error.message) } : { ok: true, msg: `「${c.name}」 내 DB 에 담았습니다` };
}
/** 한 칸 고치기 — 본인 또는 총괄. 상태를 결제로 바꾸면 결제 시각이 찍힌다 */
export async function dbUpdate(id: number, patch: Partial<DbIn>): Promise<R<{ row: DbRow }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin(); const { data: cur, error } = await sb.from('my_db').select('owner_id,status,name,deleted_at').eq('id', id).maybeSingle(); const hasAmt = 'paid_amt' in patch || 'cost_amt' in patch;
  if (error) return { ok: false, msg: needSql(error.message) }; if (!cur || cur.deleted_at) return { ok: false, msg: '없는 DB' };
  if (cur.owner_id !== me.id && !isBoss(me)) return { ok: false, msg: '본인 DB 만 고칠 수 있습니다' };
  const c = clean({ name: cur.name, ...patch } as DbIn); const up: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of Object.keys(patch) as (keyof DbIn)[]) { if (k in c) up[k] = (c as any)[k]; if (k === 'phone') up.phone_key = c.phone_key; }
  if ('paid_amt' in patch) up.paid_amt = amt(patch.paid_amt); if ('cost_amt' in patch) up.cost_amt = amt(patch.cost_amt);
  if ('next_on' in patch || 'alarm_time' in patch) up.alarm_sent_on = null;   // 날짜·시각을 바꾸면 알림 다시
  if ('next_on' in patch && !c.next_on) up.alarm_time = '';
  if ('name' in patch && !c.name) return { ok: false, msg: '상호명은 비울 수 없습니다' };
  if ('status' in patch && c.status !== cur.status) { up.paid_at = c.status === '결제' ? new Date().toISOString() : null; await sb.from('my_db_logs').insert({ db_id: id, user_id: me.id, action: '상태', detail: `${cur.status} → ${c.status}` }); }
  let { data, error: e2 } = await sb.from('my_db').update(up).eq('id', id).select(COLS_META).single();
  if (e2 && /meta_id|paid_amt|cost_amt/.test(e2.message)) { if (hasAmt) return { ok: false, msg: '0104 SQL(메타 연결 칸)을 먼저 실행해 주세요' }; ({ data, error: e2 } = await sb.from('my_db').update(up).eq('id', id).select(COLS).single()); }
  if (e2) return { ok: false, msg: e2.message };
  const row = data as unknown as DbRow; if (row.meta_id) { try { await syncFromMyDb(row as any); } catch { /* 효율 집계 반영 실패는 저장을 막지 않는다 */ } }
  return { ok: true, msg: '저장됨', row };
}
/** 지우기 — 휴지통으로. 결제 건은 총괄만 */
export async function dbDelete(ids: number[]): Promise<R> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const list = (ids ?? []).map(Number).filter(Number.isFinite).slice(0, 2000); if (!list.length) return { ok: false, msg: '먼저 체크해 주세요' };
  const sb = supabaseAdmin(); let q = sb.from('my_db').update({ deleted_at: new Date().toISOString(), deleted_by: me.id }).in('id', list).is('deleted_at', null);
  q = q.neq('source', '메타');   // 메타 인바운드 건은 누구도 지울 수 없다 (총괄 포함) — 허수면 상태를 「허수」로
  if (!isBoss(me)) q = q.eq('owner_id', me.id).neq('status', '결제');
  const { data, error } = await q.select('id'); if (error) return { ok: false, msg: needSql(error.message) };
  if (data?.length) await sb.from('my_db_logs').insert(data.map(d => ({ db_id: d.id, user_id: me.id, action: '삭제' })));
  const skip = list.length - (data?.length ?? 0);
  return data?.length ? { ok: true, msg: `${data.length}건 삭제 (휴지통에서 되살릴 수 있습니다)` + (skip ? ` · ${skip}건은 결제 건이라 총괄만 지울 수 있음` : '') } : { ok: false, msg: '지울 수 있는 건이 없습니다 (결제 건은 총괄만 · 메타 인바운드 건은 삭제 불가 — 허수로 표시)' };
}
export async function dbRestore(ids: number[]): Promise<R> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const list = (ids ?? []).map(Number).filter(Number.isFinite).slice(0, 2000); if (!list.length) return { ok: false, msg: '먼저 체크해 주세요' };
  const sb = supabaseAdmin(); let q = sb.from('my_db').update({ deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() }).in('id', list).not('deleted_at', 'is', null);
  if (!isBoss(me)) q = q.eq('owner_id', me.id).gt('deleted_at', new Date(Date.now() - TRASH_DAYS * 86400e3).toISOString());
  const { data, error } = await q.select('id'); if (error) return { ok: false, msg: needSql(error.message) };
  if (data?.length) await sb.from('my_db_logs').insert(data.map(d => ({ db_id: d.id, user_id: me.id, action: '되살림' })));
  return data?.length ? { ok: true, msg: `${data.length}건 되살림` } : { ok: false, msg: '되살릴 수 있는 건이 없습니다' };
}
/** 완전 삭제 — 총괄·어드민만, 휴지통에 있는 것만 */
export async function dbPurge(ids: number[]): Promise<R> {
  const me = await active(); if (!me || !isBoss(me)) return { ok: false, msg: '총괄만' };
  const list = (ids ?? []).map(Number).filter(Number.isFinite).slice(0, 2000); if (!list.length) return { ok: false, msg: '먼저 체크해 주세요' };
  const { data, error } = await supabaseAdmin().from('my_db').delete().in('id', list).not('deleted_at', 'is', null).neq('source', '메타').select('id');   // 메타 건은 완전 삭제도 없음
  return error ? { ok: false, msg: needSql(error.message) } : { ok: true, msg: `${data?.length ?? 0}건 완전 삭제` };
}
/** 다른 직원에게 넘기기 — 본인 DB(결제 건 제외) 또는 총괄은 누구 것이든. 휴지통에 있던 건 되살려서 넘긴다 */
export async function dbTransfer(ids: number[], to: string): Promise<R> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const list = (ids ?? []).map(Number).filter(Number.isFinite).slice(0, 2000); if (!list.length) return { ok: false, msg: '먼저 체크해 주세요' };
  const sb = supabaseAdmin(); const { data: p } = await sb.from('profiles').select('id,name,is_active').eq('id', to).maybeSingle(); if (!p || !p.is_active) return { ok: false, msg: '받을 사람을 골라 주세요' };
  let q = sb.from('my_db').update({ owner_id: to, source: '넘겨받음', deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() }).in('id', list).neq('owner_id', to);
  if (!isBoss(me)) q = q.eq('owner_id', me.id).is('deleted_at', null).neq('status', '결제').neq('source', '메타');   // 메타 건의 담당자 변경은 인바운드 DB 에서 팀장이
  const { data, error } = await q.select('id,name'); if (error) return { ok: false, msg: needSql(error.message) };
  if (!data?.length) return { ok: false, msg: '넘길 수 있는 건이 없습니다 (결제 건은 총괄만)' };
  await sb.from('my_db_logs').insert(data.map(d => ({ db_id: d.id, user_id: me.id, action: '넘김', detail: `→ ${p.name}` })));
  { const { data: ml } = await sb.from('my_db').select('meta_id').in('id', data.map(d => d.id)).not('meta_id', 'is', null); if (ml?.length) await sb.from('meta_leads').update({ owner_id: to, assigned_at: new Date().toISOString() }).in('id', ml.map(m => m.meta_id)); }   // 총괄이 메타 건을 넘기면 인바운드 DB 담당자도 같이
  if (to !== me.id) await sb.from('notifications').insert({ user_id: to, kind: 'info', title: `DB ${data.length}건을 넘겨받았습니다 — ${me.name}`, body: data.slice(0, 8).map(d => d.name).join(', ').slice(0, 300), link: '/my-db' });
  return { ok: true, msg: `${data.length}건을 ${p.name} 님에게 넘겼습니다` };
}

/** 순위 체크 — 이 줄의 키워드를 지수 프로그램에서 새로 조회(캐시 안 씀)해 상위 100 안에서 이 업체를 찾는다.
 *  URL 칸의 상품 링크(/products/번호 또는 /catalog/번호)로 그 상품을 찾는다 — 스토어 주소만 있으면 조회하지 않는다. 0 = 100위 밖 */
export async function dbRank(id: number): Promise<R<{ row: DbRow }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin(); const { data: cur, error } = await sb.from('my_db').select('owner_id,name,item,url,url2,rank_now,rank_hist,deleted_at').eq('id', id).maybeSingle();
  if (error) return { ok: false, msg: needSql(error.message) }; if (!cur || cur.deleted_at) return { ok: false, msg: '없는 DB' };
  if (!(await canSee(me, cur.owner_id))) return { ok: false, msg: '권한 없음' };
  const kw = String(cur.item ?? '').trim(); if (!kw) return { ok: false, msg: '키워드 칸을 먼저 채워 주세요' };
  const pid = [cur.url, cur.url2].map(u => String(u ?? '').match(/\/products\/(\d+)/)?.[1]).find(Boolean); const cat = [cur.url, cur.url2].map(u => String(u ?? '').match(/\/catalog\/(\d+)/)?.[1]).find(Boolean);
  if (!pid && !cat) return { ok: false, msg: 'URL 칸에 상품 링크를 넣어 주세요 (…/products/상품번호) — 스토어 주소만으로는 순위를 못 찾습니다' };
  let res; try { res = await search(kw, me.id, true, true); } catch (e: any) { return { ok: false, msg: String(e?.message ?? e).slice(0, 120) }; }
  const prods = (res.products ?? []) as any[];
  const hit = prods.filter(p => (pid && String(p.link ?? '').includes(`/products/${pid}`)) || (cat && String(p.nvmid ?? '') === cat)).sort((a, b) => a.rank - b.rank)[0];
  const now = new Date().toISOString(); const rk = hit ? Number(hit.rank) || 0 : 0;
  const up = { rank_prev: cur.rank_now, rank_now: rk, rank_at: now, rank_title: hit ? String(hit.productTitle ?? '').slice(0, 120) : '', rank_hist: [...(Array.isArray(cur.rank_hist) ? cur.rank_hist : []), { t: now, r: rk, k: kw }].slice(-90) };
  const { data, error: e2 } = await sb.from('my_db').update(up).eq('id', id).select(COLS).single(); if (e2) return { ok: false, msg: needSql(e2.message) };
  return { ok: true, msg: hit ? `「${kw}」 ${hit.rank}위` : `「${kw}」 100위 안에 없음`, row: data as DbRow };
}
