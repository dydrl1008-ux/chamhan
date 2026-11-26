'use server';
// 메타팀 인바운드 DB — 표(meta_leads)는 RLS 로 막아 두고 여기서만 권한을 따져 읽고 쓴다. 사원: 본인 배정분 / 메타팀 팀장·총괄·어드민: 전체 + 올리기·배분
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { metaAccess, metaTeamId, META_STATUSES } from '@/lib/meta';
type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
export type MetaLead = { id: number; received_on: string; source: string; name: string; phone: string; product: string; inquiry: string; url: string; owner_id: string | null; status: string; paid_amt: number | null; paid_at: string | null; next_on: string | null; memo: string; updated_at: string };
export type MetaIn = { received_on?: string | null; source?: string; name?: string; phone?: string; product?: string; inquiry?: string; url?: string };
const COLS = 'id,received_on,source,name,phone,product,inquiry,url,owner_id,status,paid_amt,paid_at,next_on,memo,updated_at';
const needSql = (m: string) => /meta_leads|meta_ad_spend/.test(m) ? '0100 SQL(메타팀 표)을 먼저 실행해 주세요' : m;
const s = (x: unknown, n: number) => String(x ?? '').trim().slice(0, n); const day = (x: unknown) => { const t = String(x ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };
async function who() { const me = await getProfile(); if (!me || !me.is_active) return null; const a = await metaAccess(me); return a.ok ? { me, ...a } : null; }
/** 메타팀 사람들 (배분 대상) */
export async function metaPeople(): Promise<{ id: string; name: string; role: string }[]> {
  const tid = await metaTeamId(); if (tid == null) return [];
  const { data } = await supabaseAdmin().from('profiles').select('id,name,role').eq('team_id', tid).eq('is_active', true).in('role', ['manager', 'staff']).order('name'); return (data ?? []) as any[];
}
/** 목록 — owner: 사람 id / 'none'(미배정) / 'all'. 사원은 무조건 본인 것 */
export async function mdList(owner?: string): Promise<R<{ rows: MetaLead[] }>> {
  const x = await who(); if (!x) return { ok: false, msg: '권한 없음' };
  const sb = supabaseAdmin(); const o = x.lead ? (owner || 'all') : x.me.id; const rows: MetaLead[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    let q = sb.from('meta_leads').select(COLS).order('received_on', { ascending: false }).order('id', { ascending: false }).range(from, from + 999);
    if (o === 'none') q = q.is('owner_id', null); else if (o !== 'all') q = q.eq('owner_id', o);
    const { data, error } = await q; if (error) return { ok: false, msg: needSql(error.message) }; rows.push(...((data ?? []) as unknown as MetaLead[])); if ((data ?? []).length < 1000) break;
  }
  return { ok: true, msg: '', rows };
}
/** 올리기 (팀장·총괄) — to: 사람 id / 'auto'(미연락 적은 사람부터 번갈아) / ''(미배정). 이미 있는 전화번호는 「중복」으로 들어가고 배정하지 않는다 */
export async function mdAdd(rows: MetaIn[], to: string): Promise<R<{ added: number; dup: number }>> {
  const x = await who(); if (!x || !x.lead) return { ok: false, msg: '팀장·총괄만 올릴 수 있습니다' };
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const list = (rows ?? []).slice(0, 3000).map(r => ({ received_on: day(r.received_on) ?? today, source: s(r.source, 20) || '상담신청', name: s(r.name, 100), phone: s(r.phone, 40), phone_key: s(r.phone, 40).replace(/\D/g, '').slice(0, 15), product: s(r.product, 80), inquiry: s(r.inquiry, 2000), url: s(r.url, 400) })).filter(r => r.name || r.phone_key);
  if (!list.length) return { ok: false, msg: '넣을 문의가 없습니다 (이름이나 전화번호가 있어야 합니다)' };
  const sb = supabaseAdmin(); const keys = [...new Set(list.map(r => r.phone_key).filter(k => k.length >= 8))]; const have = new Set<string>();
  for (let i = 0; i < keys.length; i += 300) { const { data, error } = await sb.from('meta_leads').select('phone_key').in('phone_key', keys.slice(i, i + 300)); if (error) return { ok: false, msg: needSql(error.message) }; for (const r of data ?? []) have.add(r.phone_key); }
  const people = await metaPeople(); let order: string[] = [];
  if (to === 'auto') { if (!people.length) return { ok: false, msg: '메타팀에 사람이 없습니다 — 「사용자 · 팀」에서 팀을 메타팀으로 지정해 주세요' };
    const { data: op } = await sb.from('meta_leads').select('owner_id').eq('status', '미연락').in('owner_id', people.map(p => p.id)).limit(10000); const load = new Map<string, number>(people.map(p => [p.id, 0])); for (const r of op ?? []) load.set(r.owner_id, (load.get(r.owner_id) ?? 0) + 1);
    order = people.map(p => p.id); var pick = () => { order.sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0)); const id = order[0]; load.set(id, (load.get(id) ?? 0) + 1); return id; };
  } else if (to && !people.some(p => p.id === to)) return { ok: false, msg: '메타팀 사람에게만 배정할 수 있습니다' };
  const now = new Date().toISOString(); const seen = new Set<string>(); let dup = 0; const got = new Map<string, number>();
  const ins = list.map(r => { const k = r.phone_key.length >= 8 ? r.phone_key : ''; const isDup = !!k && (have.has(k) || seen.has(k)); if (k) seen.add(k); if (isDup) { dup++; return { ...r, status: '중복', owner_id: null, assigned_at: null, created_by: x.me.id }; }
    const owner = to === 'auto' ? pick!() : (to || null); if (owner) got.set(owner, (got.get(owner) ?? 0) + 1); return { ...r, status: '미연락', owner_id: owner, assigned_at: owner ? now : null, created_by: x.me.id }; });
  for (let i = 0; i < ins.length; i += 500) { const { error } = await sb.from('meta_leads').insert(ins.slice(i, i + 500)); if (error) return { ok: false, msg: needSql(error.message) }; }
  const noti = [...got].filter(([u]) => u !== x.me.id).map(([user_id, n]) => ({ user_id, kind: 'info', title: `인바운드 DB ${n}건이 배정되었습니다`, body: '', link: '/meta-db' })); if (noti.length) await sb.from('notifications').insert(noti);
  revalidatePath('/meta-db'); return { ok: true, msg: `${ins.length - dup}건 등록${dup ? ` · 중복 ${dup}건(중복으로 표시)` : ''}`, added: ins.length - dup, dup };
}
/** 배정·재배정 (팀장·총괄) — to: 사람 id 또는 ''(미배정으로) */
export async function mdAssign(ids: number[], to: string): Promise<R> {
  const x = await who(); if (!x || !x.lead) return { ok: false, msg: '팀장·총괄만 배정할 수 있습니다' };
  const list = (ids ?? []).map(Number).filter(Number.isFinite).slice(0, 3000); if (!list.length) return { ok: false, msg: '먼저 체크해 주세요' };
  if (to && !(await metaPeople()).some(p => p.id === to)) return { ok: false, msg: '메타팀 사람에게만 배정할 수 있습니다' };
  const sb = supabaseAdmin(); const { data, error } = await sb.from('meta_leads').update({ owner_id: to || null, assigned_at: to ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).in('id', list).select('id'); if (error) return { ok: false, msg: needSql(error.message) };
  if (to && to !== x.me.id && data?.length) await sb.from('notifications').insert({ user_id: to, kind: 'info', title: `인바운드 DB ${data.length}건이 배정되었습니다`, body: '', link: '/meta-db' });
  revalidatePath('/meta-db'); return { ok: true, msg: `${data?.length ?? 0}건 ${to ? '배정' : '미배정으로'}` };
}
/** 처리 기록 — 담당자 본인 또는 팀장·총괄. 결제로 바꾸면 결제 시각이 찍힌다 */
export async function mdUpdate(id: number, patch: { status?: string; paid_amt?: number | null; next_on?: string | null; memo?: string; product?: string; name?: string; phone?: string }): Promise<R<{ row: MetaLead }>> {
  const x = await who(); if (!x) return { ok: false, msg: '권한 없음' };
  const sb = supabaseAdmin(); const { data: cur, error } = await sb.from('meta_leads').select('owner_id,status').eq('id', id).maybeSingle(); if (error) return { ok: false, msg: needSql(error.message) }; if (!cur) return { ok: false, msg: '없는 DB' };
  if (!x.lead && cur.owner_id !== x.me.id) return { ok: false, msg: '본인에게 배정된 DB 만 고칠 수 있습니다' };
  const up: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('status' in patch) { if (!META_STATUSES.includes(String(patch.status))) return { ok: false, msg: '상태 값이 올바르지 않습니다' }; up.status = patch.status; if (patch.status !== cur.status) up.paid_at = patch.status === '결제' ? new Date().toISOString() : null; }
  if ('paid_amt' in patch) { const n = Number(patch.paid_amt); up.paid_amt = Number.isFinite(n) && n > 0 && n < 1e12 ? Math.round(n) : null; }
  if ('next_on' in patch) up.next_on = day(patch.next_on); if ('memo' in patch) up.memo = s(patch.memo, 2000); if ('product' in patch) up.product = s(patch.product, 80);
  if ('name' in patch) up.name = s(patch.name, 100); if ('phone' in patch) { up.phone = s(patch.phone, 40); up.phone_key = s(patch.phone, 40).replace(/\D/g, '').slice(0, 15); }
  const { data, error: e2 } = await sb.from('meta_leads').update(up).eq('id', id).select(COLS).single(); return e2 ? { ok: false, msg: e2.message } : { ok: true, msg: '저장됨', row: data as MetaLead };
}
/** 삭제 — 총괄·어드민만 (잘못 올린 것) */
export async function mdDelete(ids: number[]): Promise<R> {
  const x = await who(); if (!x || !x.boss) return { ok: false, msg: '총괄만 지울 수 있습니다' };
  const list = (ids ?? []).map(Number).filter(Number.isFinite).slice(0, 3000); if (!list.length) return { ok: false, msg: '먼저 체크해 주세요' };
  const { data, error } = await supabaseAdmin().from('meta_leads').delete().in('id', list).select('id'); if (error) return { ok: false, msg: needSql(error.message) };
  revalidatePath('/meta-db'); return { ok: true, msg: `${data?.length ?? 0}건 삭제` };
}
/** 회사월(21일~20일) 광고비 입력 — 총괄·어드민만 */
export async function mdSpend(month: string, amount: number): Promise<R> {
  const x = await who(); if (!x || !x.boss) return { ok: false, msg: '총괄만 입력할 수 있습니다' };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, msg: '월이 올바르지 않습니다' }; const n = Math.max(0, Math.round(Number(amount) || 0));
  const { error } = await supabaseAdmin().from('meta_ad_spend').upsert({ month, source: '전체', amount: n, updated_by: x.me.id, updated_at: new Date().toISOString() }, { onConflict: 'month,source' }); if (error) return { ok: false, msg: needSql(error.message) };
  revalidatePath('/meta-stats'); return { ok: true, msg: `${month} 광고비 ${n.toLocaleString()}원 저장` };
}
