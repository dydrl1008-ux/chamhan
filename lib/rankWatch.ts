// 순위 체크 — 워크허브 자체 기능. 항목(rank_watch_items)·순위(rank_watch_ranks)·이력(rank_watch_hist) 모두 워크허브 DB.
//   순위는 지수 프로그램(lib/nsc)으로 키워드당 한 번 조회해 상위 100 안에서 찾는다. 단일 = 상품 번호, 원부 = 카탈로그 번호로 매칭.
//   ykreward 는 예전 항목·이력을 한 번 가져올 때만 읽는다 (계정 연결 불필요)
import { supabaseAdmin } from '@/lib/supabase/admin';
import { search } from '@/lib/nsc';
import { ykr, ykrReady } from '@/lib/ykreward';

export type WatchRow = { id: string; user_id: string; owner: string; group: string; keyword: string; title: string | null; store: string | null; url: string | null; memo: string | null; cur_rank: number | null; cur_at: string | null; prev_rank: number | null; diff: number | null; trend: string | null; active: boolean; q_status: string | null; mid: string | null; mid_type: string | null; cmp_mid: string | null; image_url: string | null; click?: number | null; prev_click?: number | null; sale?: number | null; prev_sale?: number | null; quality?: number | null; prev_quality?: number | null };
export type HistPt = { t: string; r: number | null };
export const GROUP_NONE = '(미분류)';
const DROP_ALERT = 10;   // 직전 조회보다 이만큼 이상 떨어지면 급하락 알림
const needSql = (m: string) => /rank_watch_items/.test(m) ? '0097 SQL(순위 체크 항목 표)을 먼저 실행해 주세요' : /rank_watch_(ranks|hist)/.test(m) ? '0096 SQL(순위 체크 표)을 먼저 실행해 주세요' : m;

/** 상품 주소 → 단일(상품 번호) / 원부(카탈로그 번호) */
export function parseTarget(url: string): { ok: true; mid: string; type: '단일' | '원부'; url: string } | { ok: false; msg: string } {
  const u = url.trim(); if (!u) return { ok: false, msg: '상품 URL이 없습니다' };
  const c = u.match(/\/catalog\/(\d+)/i); if (c) return { ok: true, mid: c[1], type: '원부', url: u.split('#')[0] };
  const m = u.match(/\/products\/(\d+)/i); if (m) return { ok: true, mid: m[1], type: '단일', url: u.split(/[?#]/)[0] };
  return { ok: false, msg: '상품 링크(…/products/숫자) 또는 가격비교 원부 링크(…/catalog/숫자)만 등록할 수 있습니다' };
}

/** 예전 ykreward 순위 체크 항목을 한 번만 워크허브로 가져온다 (연결돼 있던 계정 → 워크허브 사용자). id 를 그대로 써서 ★·리포트·이력이 이어진다 */
export async function importOnce(): Promise<string> {
  const wh = supabaseAdmin(); const { data: f } = await wh.from('ai_settings').select('value').eq('key', 'rankwatch_imported').maybeSingle(); if (f?.value) return 'done';
  const mark = (v: string) => wh.from('ai_settings').upsert({ key: 'rankwatch_imported', value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (!ykrReady()) { await mark('no-ykr'); return 'no ykr'; }
  const { data: links } = await wh.from('reward_watch_links').select('user_id,login_id'); if (!links?.length) { await mark('no-links'); return 'no links'; }
  const yk = ykr(); const { data: accs } = await yk.from('accounts').select('id,login_id').in('login_id', links.map((l: any) => l.login_id)); const u = new Map<string, string>();
  for (const a of accs ?? []) { const l = links.find((x: any) => x.login_id === a.login_id); if (l) u.set(a.id, l.user_id); }
  if (!u.size) { await mark('no-accounts'); return 'no accounts'; }
  const rows: any[] = [];
  for (let off = 0; ; off += 1000) { const { data, error } = await yk.from('v_rank_watch').select('id,owner_id,url,mid,cmp_mid,image_url,keyword,title,store,memo,cur_rank,cur_at,prev_rank,group_name,group_order,sort_order,created_at').eq('active', true).in('owner_id', [...u.keys()]).order('id').range(off, off + 999); if (error) throw new Error('예전 항목 가져오기 실패: ' + error.message); rows.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    const { error } = await wh.from('rank_watch_items').upsert(part.map(x => ({ id: x.id, user_id: u.get(x.owner_id), url: x.url ?? '', mid: String(x.cmp_mid || x.mid || ''), mid_type: x.cmp_mid ? '원부' : '단일', keyword: x.keyword, group_name: x.group_name, group_order: x.group_order, sort_order: x.sort_order ?? 0, memo: x.memo, title: x.title, store: x.store, image_url: x.image_url, active: true, created_at: x.created_at })), { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(needSql(error.message));
    await wh.from('rank_watch_ranks').upsert(part.filter(x => x.cur_at).map(x => ({ watch_id: String(x.id), cur_rank: x.cur_rank > 0 && x.cur_rank <= 100 ? x.cur_rank : 0, cur_at: x.cur_at, prev_rank: x.prev_rank > 0 && x.prev_rank <= 100 ? x.prev_rank : (x.prev_rank == null ? null : 0), title: x.title ?? '', store: x.store ?? '' })), { onConflict: 'watch_id', ignoreDuplicates: true });
  }
  await mark(`${new Date().toISOString()} ${rows.length}`); return `imported ${rows.length}`;
}

/** 항목 + 현재 순위. users 를 주면 그 사람들 것만, 비우면 전체 */
export async function watchRows(users?: string[]): Promise<WatchRow[]> {
  if (users && !users.length) return []; const wh = supabaseAdmin();
  try { await importOnce(); } catch { /* 가져오기 실패해도 워크허브 항목은 보여 준다 */ }
  const items: any[] = [];
  for (let off = 0; ; off += 1000) { let q = wh.from('rank_watch_items').select('id,user_id,url,mid,mid_type,keyword,group_name,group_order,sort_order,memo,title,store,image_url').eq('active', true).order('group_order', { ascending: true, nullsFirst: false }).order('sort_order').order('id').range(off, off + 999); if (users) q = q.in('user_id', users);
    const { data, error } = await q; if (error) throw new Error(needSql(error.message)); items.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  const rk = new Map<string, any>(); const ids = items.map(x => String(x.id));
  for (let i = 0; i < ids.length; i += 300) { let { data, error } = await wh.from('rank_watch_ranks').select('watch_id,cur_rank,cur_at,prev_rank,title,store,cur_click,prev_click,cur_sale,prev_sale,cur_quality,prev_quality').in('watch_id', ids.slice(i, i + 300)) as { data: any[] | null; error: any };
    if (error) ({ data } = await wh.from('rank_watch_ranks').select('watch_id,cur_rank,cur_at,prev_rank,title,store').in('watch_id', ids.slice(i, i + 300)) as any);   // 0098 실행 전
    for (const r of data ?? []) rk.set(r.watch_id, r); }
  const uids = [...new Set(items.map(x => x.user_id))]; const nm = new Map<string, string>(); if (uids.length) { const { data } = await wh.from('profiles').select('id,name').in('id', uids); for (const p of data ?? []) nm.set(p.id, p.name); }
  return items.map(x => { const o = rk.get(String(x.id)); const cur = o && o.cur_rank > 0 ? o.cur_rank : null, prev = o && o.prev_rank > 0 ? o.prev_rank : null;
    const trend = !o?.cur_at ? '미수집' : o.prev_rank == null ? 'NEW' : !cur && !prev ? '변동 없음' : !cur ? '이탈' : !prev ? '진입' : cur === prev ? '변동 없음' : cur < prev ? '상승' : '하락';
    return { id: x.id, user_id: x.user_id, owner: nm.get(x.user_id) ?? '', group: x.group_name?.trim() || GROUP_NONE, keyword: x.keyword, title: o?.title || x.title, store: o?.store || x.store, url: x.url, memo: x.memo, cur_rank: cur, cur_at: o?.cur_at ?? null, prev_rank: prev, diff: cur && prev ? prev - cur : null, trend, active: true, q_status: null, mid: x.mid, mid_type: x.mid_type, cmp_mid: x.mid_type === '원부' ? x.mid : null, image_url: x.image_url, click: o?.cur_click ?? null, prev_click: o?.prev_click ?? null, sale: o?.cur_sale ?? null, prev_sale: o?.prev_sale ?? null, quality: o?.cur_quality ?? null, prev_quality: o?.prev_quality ?? null }; });
}

/** 순위 이력 (최근 N일) — 워크허브 조회 기록, 그 이전 구간은 예전 ykreward 기록으로 채움 */
export async function watchHistory(ids: string[], days = 30): Promise<Record<string, HistPt[]>> {
  if (!ids.length) return {}; const since = new Date(Date.now() - days * 864e5).toISOString(); const wh = supabaseAdmin(); const mine: Record<string, HistPt[]> = {}, old: Record<string, HistPt[]> = {};
  for (let i = 0; i < ids.length; i += 100) for (let off = 0; ; off += 1000) { const { data } = await wh.from('rank_watch_hist').select('watch_id,rank,checked_at').in('watch_id', ids.slice(i, i + 100).map(String)).gte('checked_at', since).order('checked_at').range(off, off + 999); for (const h of data ?? []) (mine[h.watch_id] ??= []).push({ t: h.checked_at, r: h.rank > 0 ? h.rank : null }); if (!data || data.length < 1000) break; }
  if (ykrReady()) try { const yk = ykr();
    for (let i = 0; i < ids.length; i += 100) for (let off = 0; ; off += 1000) { const { data } = await yk.from('rank_watch_history').select('watch_id,rank,checked_at,checked_ok').in('watch_id', ids.slice(i, i + 100)).gte('checked_at', since).order('checked_at').range(off, off + 999); for (const h of data ?? []) { if (h.checked_ok === false) continue; (old[h.watch_id] ??= []).push({ t: h.checked_at, r: h.rank && h.rank > 0 && h.rank <= 100 ? h.rank : null }); } if (!data || data.length < 1000) break; }
  } catch { /* 예전 기록을 못 읽어도 워크허브 기록은 보여 준다 */ }
  const out: Record<string, HistPt[]> = {}; for (const id of new Set([...Object.keys(old), ...Object.keys(mine)])) { const m = mine[id] ?? []; out[id] = m.length ? [...(old[id] ?? []).filter(p => p.t < m[0].t), ...m] : (old[id] ?? []); }
  return out;
}

/** 순위 조회 — 키워드별로 묶어 지수 프로그램을 키워드당 한 번만 새로 조회, 그 키워드를 쓰는 항목 전부에 순위 기록. 0 = 100위 밖 */
const GAP_MS = 2500;   // 지수 프로그램 조회 간격
export async function checkWatch(rows: WatchRow[], budgetMs = 40000): Promise<{ ok: boolean; msg: string; n: number; left: number }> {
  if (!rows.length) return { ok: false, msg: '대상 없음', n: 0, left: 0 };
  const wh = supabaseAdmin(); const t0 = Date.now(); const by = new Map<string, WatchRow[]>();
  for (const w of rows) { const k = String(w.keyword ?? '').trim().replace(/\s+/g, ' '); if (!k || k.length > 40 || !w.mid) continue; by.set(k, [...(by.get(k) ?? []), w]); }
  // 키워드를 하나씩, 조회 시작 간격 2.5초로 (동시에 여러 개 넣으면 지수 프로그램이 「너무 빠른 조회」로 막는다). 한 키워드가 실패해도 나머지는 계속. 1인 하루 조회 한도는 적용하지 않는다
  let n = 0, kws = 0, err = '', cooled = false; const failed: string[] = []; const queue = [...by]; const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const one = async ([kw, list]: [string, WatchRow[]]) => {
    let prods: any[] = []; let got = false;
    for (let t = 0; t < 2 && !got; t++) {   // 지수 프로그램이 「너무 빠른 조회」로 막으면 8초 쉬고 한 번 더. 또 막히면 이번 실행은 여기서 멈춘다(남은 건 5분 뒤 이어서)
      try { prods = ((await search(kw, list[0].user_id, true, true)).products ?? []) as any[]; got = true; }
      catch (e: any) { const m = String(e?.message ?? e); const fast = /빠른|잠시 후|429|too many/i.test(m);
        if (fast && t === 0 && Date.now() - t0 + 9000 < budgetMs) { await sleep(8000); continue; }
        if (fast) { cooled = true; queue.unshift([kw, list]); return; }
        failed.push(kw); if (!err) err = `「${kw}」 조회 실패: ${m.slice(0, 80)}`; return; }
    }
    const at = new Date().toISOString(); const ids = list.map(w => String(w.id));
    const { data: old } = await wh.from('rank_watch_ranks').select('watch_id,cur_rank').in('watch_id', ids); const was = new Map<string, number | null>((old ?? []).map((o: any) => [o.watch_id, o.cur_rank]));
    const { data: oc } = await wh.from('rank_watch_ranks').select('watch_id,cur_click,cur_sale,cur_quality').in('watch_id', ids); const wasC = new Map<string, any>((oc ?? []).map((o: any) => [o.watch_id, o]));   // 0098 실행 전엔 빈 값
    const num = (v: unknown) => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
    const ups: any[] = [], hs: any[] = [], imgs: { id: string; image_url: string }[] = [];
    for (const w of list) {
      const hit = prods.filter(p => w.mid_type === '원부' ? String(p.nvmid ?? '') === String(w.mid) : String(p.link ?? '').includes(`/products/${w.mid}`)).sort((a, b) => a.rank - b.rank)[0]; const rk = hit ? Number(hit.rank) || 0 : 0;
      ups.push({ watch_id: String(w.id), cur_rank: rk, cur_at: at, prev_rank: was.has(String(w.id)) ? was.get(String(w.id)) : null, title: hit ? String(hit.productTitle ?? '').slice(0, 200) : (w.title ?? ''), store: hit ? String(hit.mallName ?? '').slice(0, 80) : (w.store ?? ''), cur_click: hit ? num(hit.hitStarScore) : null, prev_click: wasC.get(String(w.id))?.cur_click ?? null, cur_sale: hit ? num(hit.saleStarScore) : null, prev_sale: wasC.get(String(w.id))?.cur_sale ?? null, cur_quality: hit ? num(hit.qualityStarScore) : null, prev_quality: wasC.get(String(w.id))?.cur_quality ?? null });
      hs.push({ watch_id: String(w.id), rank: rk, checked_at: at, click: hit ? num(hit.hitStarScore) : null, sale: hit ? num(hit.saleStarScore) : null, quality: hit ? num(hit.qualityStarScore) : null }); if (hit?.imageUrl && !w.image_url) imgs.push({ id: String(w.id), image_url: String(hit.imageUrl) });
    }
    let { error } = await wh.from('rank_watch_ranks').upsert(ups, { onConflict: 'watch_id' });
    if (error && /click|sale|quality/.test(error.message)) { ({ error } = await wh.from('rank_watch_ranks').upsert(ups.map(({ cur_click, prev_click, cur_sale, prev_sale, cur_quality, prev_quality, ...r }) => r), { onConflict: 'watch_id' })); await wh.from('rank_watch_hist').insert(hs.map(({ click, sale, quality, ...r }) => r)); }   // 0098 실행 전 — 지수 없이 저장
    else if (!error) await wh.from('rank_watch_hist').insert(hs);
    if (error) { failed.push(kw); if (!err) err = needSql(error.message); return; }
    for (const im of imgs) await wh.from('rank_watch_items').update({ image_url: im.image_url }).eq('id', im.id);
    n += list.length; kws++;
  };
  while (queue.length && !cooled && Date.now() - t0 < budgetMs) { const s0 = Date.now(); await one(queue.shift()!); if (queue.length && !cooled) await sleep(Math.max(0, GAP_MS - (Date.now() - s0))); }
  const left = queue.length;   // 시간 안에 손도 못 댄 키워드 수 (실패한 건 다음 회차에 다시)
  if (cooled && !n && !err) err = '지수 프로그램이 「너무 빠른 조회」로 막고 있습니다 — 잠시 후 이어서 조회합니다';
  if (err && !n) return { ok: false, msg: err, n: 0, left };
  return { ok: true, msg: `${n}건 순위 조회 (키워드 ${kws}개)` + (left ? ` · 남은 키워드 ${left}개${cooled ? ' (조회 속도 제한으로 잠시 쉼)' : ''}` : '') + (failed.length ? ` · 실패 ${failed.length}개(${failed.slice(0, 3).join(', ')}) — ${err}` : ''), n, left };
}

/** 등록 — 상품 링크(단일) 또는 원부 링크 + 키워드 여러 개. 같은 상품·키워드는 건너뛰고, 등록하자마자 첫 순위를 조회 */
export async function addWatch(p: { userId: string; url: string; keywords: string[]; group: string; memo: string }): Promise<{ ok: boolean; msg: string; n: number }> {
  const r = parseTarget(p.url); if (!r.ok) return { ok: false, msg: r.msg, n: 0 };
  const kws = [...new Set(p.keywords.map(k => k.trim()).filter(Boolean))]; if (!kws.length) return { ok: false, msg: '키워드를 입력하세요', n: 0 };
  const wh = supabaseAdmin();
  const { data: dup, error: e0 } = await wh.from('rank_watch_items').select('keyword').eq('user_id', p.userId).eq('mid', r.mid).eq('active', true).in('keyword', kws); if (e0) return { ok: false, msg: needSql(e0.message), n: 0 };
  const have = new Set((dup ?? []).map((x: any) => x.keyword)); const todo = kws.filter(k => !have.has(k)); if (!todo.length) return { ok: false, msg: '이미 등록된 상품·키워드입니다', n: 0 };
  const { data: mx } = await wh.from('rank_watch_items').select('sort_order').eq('user_id', p.userId).order('sort_order', { ascending: false }).limit(1); let so = Number(mx?.[0]?.sort_order ?? 0);
  const group = p.group.trim() && p.group.trim() !== GROUP_NONE ? p.group.trim() : null;
  const { data: ins, error } = await wh.from('rank_watch_items').insert(todo.map(k => ({ user_id: p.userId, url: r.url, mid: r.mid, mid_type: r.type, keyword: k, group_name: group, memo: p.memo.trim() || null, sort_order: (so += 100) }))).select('id,keyword,mid,mid_type,url,user_id');
  if (error) return { ok: false, msg: '등록 실패: ' + needSql(error.message), n: 0 };
  let first = ''; try { const c = await checkWatch((ins ?? []).map((w: any) => ({ ...w, title: null, store: null, image_url: null }) as WatchRow), 25000); first = c.ok ? ' · 첫 순위 조회 완료' : ` · 첫 순위는 「재체크」로 (${c.msg})`; } catch { first = ' · 첫 순위는 「재체크」로'; }
  return { ok: true, msg: `${ins?.length ?? 0}개 등록 (${r.type})${first}${have.size ? ` · 이미 있던 ${have.size}개 제외` : ''}`, n: ins?.length ?? 0 };
}
export async function setWatchGroup(ids: string[], group: string): Promise<{ ok: boolean; msg: string }> {
  const g = group.trim() && group.trim() !== GROUP_NONE ? group.trim() : null; const { error } = await supabaseAdmin().from('rank_watch_items').update({ group_name: g }).in('id', ids);
  return error ? { ok: false, msg: error.message } : { ok: true, msg: `${ids.length}건 → ${g ?? GROUP_NONE}` };
}
export async function removeWatch(ids: string[]): Promise<{ ok: boolean; msg: string }> {
  const { error } = await supabaseAdmin().from('rank_watch_items').update({ active: false }).in('id', ids); return error ? { ok: false, msg: error.message } : { ok: true, msg: `${ids.length}건 삭제` };
}
export async function saveWatchOrder(p: { userId: string; groups?: string[]; items?: string[] }): Promise<{ ok: boolean; msg: string }> {
  const wh = supabaseAdmin();
  if (p.groups) for (let i = 0; i < p.groups.length; i++) { const g = p.groups[i]; const q = wh.from('rank_watch_items').update({ group_order: (i + 1) * 10 }).eq('user_id', p.userId); const { error } = g === GROUP_NONE ? await q.is('group_name', null) : await q.eq('group_name', g); if (error) return { ok: false, msg: error.message }; }
  if (p.items) { let i = 0; for (const id of p.items) { const { error } = await wh.from('rank_watch_items').update({ sort_order: (++i) * 100 }).eq('id', id).eq('user_id', p.userId); if (error) return { ok: false, msg: error.message }; } }
  return { ok: true, msg: '순서 저장' };
}

/** 자동 조회 — 평일 10시·14시. 이번 회차에 아직 안 찍힌 항목만 키워드별로 조회, 다 끝나면 급하락 알림 */
export async function rankWatchTick(budgetMs = 20000): Promise<string> {
  const now = new Date(Date.now() + 9 * 3600e3); const today = now.toISOString().slice(0, 10); const hm = now.toISOString().slice(11, 16); const dow = now.getUTCDay();
  if (dow === 0 || dow === 6 || hm < '10:00' || hm >= '19:00') return 'off';
  const hh = hm < '14:00' ? '10' : '14'; const slotKey = `${today} ${hh}`; const slot = new Date(`${today}T${hh}:00:00+09:00`).toISOString();
  const wh = supabaseAdmin(); const { data: done } = await wh.from('ai_settings').select('value').eq('key', 'rankwatch_slot_done').maybeSingle(); if (done?.value === slotKey) return 'done';
  const all = await watchRows(); const todo = all.filter(w => !w.cur_at || w.cur_at < slot).sort((a, b) => String(a.cur_at ?? '').localeCompare(String(b.cur_at ?? '')));   // 오래 안 본 것부터
  if (todo.length) {
    const r = await checkWatch(todo, budgetMs); await wh.from('ai_settings').upsert({ key: 'rankwatch_last', value: `${new Date().toISOString()} ${r.msg}`.slice(0, 400), updated_at: new Date().toISOString() }, { onConflict: 'key' });   // 화면에서 마지막 실행 결과를 볼 수 있게
    // 조회가 한 건도 안 되는 상태(전부 실패)가 이어지면 이 회차는 접는다 — 같은 실패를 5분마다 되풀이하지 않게. 다음 회차에 다시 시도
    if (!r.n && !r.left) { await wh.from('ai_settings').upsert({ key: 'rankwatch_slot_done', value: slotKey, updated_at: new Date().toISOString() }, { onConflict: 'key' }); return 'gave up: ' + r.msg.slice(0, 80); }
    return r.ok ? `rank ${r.n}rows left ${r.left}kw` : 'err ' + r.msg.slice(0, 80);
  }
  await wh.from('ai_settings').upsert({ key: 'rankwatch_slot_done', value: slotKey, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  let sent = 0;
  try { const by = new Map<string, string[]>();
    for (const w of all) { if (!w.cur_at || w.cur_at < slot || w.prev_rank == null) continue; const out = w.cur_rank == null; const d = out ? 0 : (w.cur_rank as number) - w.prev_rank; if (!out && d < DROP_ALERT) continue;
      by.set(w.user_id, [...(by.get(w.user_id) ?? []), `▼ ${w.group !== GROUP_NONE ? w.group + ' · ' : ''}${w.keyword}  ${w.prev_rank}위 → ${out ? '100위 밖' : `${w.cur_rank}위 (${d}↓)`}`]); }
    const rows = [...by].map(([user_id, arr]) => ({ user_id, kind: 'alert', title: `순위 급하락 ${arr.length}건 — ${hh}시 조회`, body: arr.slice(0, 30).join('\n').slice(0, 1500), link: '/rank-watch' }));
    if (rows.length) { await wh.from('notifications').insert(rows); sent = rows.length; }
  } catch { /* 알림 실패는 조회에 영향 없음 */ }
  return `done now alert ${sent}`;
}

/** ★ 주요 업체 순위 변동 알림 — 마지막 알림 순위 대비 delta 이상 변동 또는 100위 안↔밖 */
export async function rankAlerts(wh: { from: (t: string) => any }, delta: number): Promise<{ users: number; checked: number; notified: number; items: string[] }> {
  const { data: stars } = await wh.from('reward_watch_stars').select('user_id,group_key'); if (!stars?.length) return { users: 0, checked: 0, notified: 0, items: [] };
  const starSet = new Set((stars as any[]).map(x => `${x.user_id}|${x.group_key}`)); const users = [...new Set((stars as any[]).map(x => x.user_id))];
  const rows = await watchRows(users); const { data: snaps } = await wh.from('reward_watch_snap').select('watch_id,rank,cur_at'); const snap = new Map<string, any>((snaps ?? []).map((x: any) => [x.watch_id, x]));
  const upserts: any[] = []; const byUser = new Map<string, string[]>(); let checked = 0;
  for (const w of rows) {
    if (!starSet.has(`${w.user_id}|${w.group}`)) continue; checked++;
    const sn = snap.get(w.id); const cur = w.cur_rank;
    if (!sn) { upserts.push({ watch_id: w.id, user_id: w.user_id, rank: cur, cur_at: w.cur_at }); continue; }
    if (w.cur_at && sn.cur_at && w.cur_at <= sn.cur_at) continue;
    const prev: number | null = sn.rank > 0 ? sn.rank : null; const changed = (prev === null) !== (cur === null) || (prev !== null && cur !== null && Math.abs(cur - prev) >= delta); if (!changed) continue;
    const up = cur !== null && (prev === null || cur < prev);
    byUser.set(w.user_id, [...(byUser.get(w.user_id) ?? []), `${up ? '▲' : '▼'} ${w.group !== GROUP_NONE ? w.group + ' · ' : ''}${w.keyword} ${prev ?? '100위 밖'} → ${cur ?? '100위 밖'}${w.store ? ` (${w.store})` : ''}`]);
    upserts.push({ watch_id: w.id, user_id: w.user_id, rank: cur, cur_at: w.cur_at });
  }
  const items: string[] = []; let notified = 0;
  for (const [uid, arr] of byUser) { const downs = arr.filter(x => x.startsWith('▼')).length; const ups = arr.length - downs;
    const { error } = await wh.from('notifications').insert({ user_id: uid, kind: downs ? 'alert' : 'info', title: `주요 업체 순위 변동 ${arr.length}건${downs ? ` · 하락 ${downs}` : ''}${ups ? ` · 상승 ${ups}` : ''}`, body: arr.join('\n'), link: '/rank-watch' }); if (!error) { notified++; items.push(...arr); } }
  if (upserts.length) await wh.from('reward_watch_snap').upsert(upserts.map(u => ({ ...u, notified_at: new Date().toISOString() })), { onConflict: 'watch_id' });
  return { users: users.length, checked, notified, items };
}
