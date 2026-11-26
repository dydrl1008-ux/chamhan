'use server';
// 메타팀 인바운드 DB — 표(meta_leads)는 RLS 로 막아 두고 여기서만 권한을 따져 읽고 쓴다. 사원: 본인 배정분 / 메타팀 팀장·총괄·어드민: 전체 + 올리기·배분
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { metaAccess, metaTeamId, META_STATUSES, META_GRADES, META_WAYS } from '@/lib/meta';
import { metaDeployed } from '@/lib/metaEdu';

type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
export type MetaLead = { id: number; received_on: string; source: string; name: string; phone: string; product: string; inquiry: string; url: string; owner_id: string | null; status: string; paid_amt: number | null; cost_amt: number | null; paid_at: string | null; next_on: string | null; memo: string; updated_at: string; inflow: string; received_at: string | null; assigned_at: string | null; first_contact_at: string | null; last_contact_at: string | null; contacts: number; grade: string; channel: string; alarm_time: string; care_note: string; prev_owner: string | null; moved_at: string | null };
export type MetaIn = { received_on?: string | null; source?: string; name?: string; phone?: string; product?: string; inquiry?: string; url?: string };
const COLS = 'id,received_on,source,name,phone,product,inquiry,url,owner_id,status,paid_amt,cost_amt,paid_at,next_on,memo,updated_at,inflow,received_at,assigned_at,first_contact_at,last_contact_at,contacts,grade,channel,alarm_time,care_note,prev_owner,moved_at';
const needSql = (m: string) => /grade|channel|alarm_time|care_note|prev_owner|moved_at|meta_contacts/.test(m) ? '0107 SQL(메타 DB 칸)을 먼저 실행해 주세요' : /first_contact_at|last_contact_at|contacts|meta_id/.test(m) ? '0104 SQL(내 DB 연결 칸)을 먼저 실행해 주세요' : /inflow|received_at|ext_id/.test(m) ? '0103 SQL(자동 접수 칸)을 먼저 실행해 주세요' : /cost_amt/.test(m) ? '0102 SQL(상품비 칸 · 메타 보고)을 먼저 실행해 주세요' : /meta_leads|meta_ad_spend/.test(m) ? '0100 SQL(메타팀 표)을 먼저 실행해 주세요' : m;
const s = (x: unknown, n: number) => String(x ?? '').trim().slice(0, n); const day = (x: unknown) => { const t = String(x ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };
async function who() { const me = await getProfile(); if (!me || !me.is_active) return null; const a = await metaAccess(me); if (!a.ok) return null; if (!a.lead && !(await metaDeployed(me))) return null;   // 투입 전 사원은 DB 를 볼 수 없다
  return { me, ...a }; }
/** 메타팀 사람들 (배분 대상) */
export async function metaPeople(): Promise<{ id: string; name: string; role: string }[]> {
  const tid = await metaTeamId(); if (tid == null) return [];
  const sb = supabaseAdmin(); const { data } = await sb.from('profiles').select('id,name,role').eq('team_id', tid).eq('is_active', true).in('role', ['manager', 'staff']).order('name'); const all = (data ?? []) as { id: string; name: string; role: string }[];
  // 사원은 교육을 마치고 팀장이 투입 승인한 사람만 배분 대상 (0101 SQL 전에는 전원)
  const { data: ed, error } = await sb.from('meta_edu').select('user_id,deployed_at').in('user_id', all.map(p => p.id).concat('00000000-0000-0000-0000-000000000000')); if (error) return all;
  const ok = new Set((ed ?? []).filter(e => e.deployed_at).map(e => e.user_id)); return all.filter(p => p.role === 'manager' || ok.has(p.id));
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
  for (let i = 0; i < ins.length; i += 500) { const { data: made, error } = await sb.from('meta_leads').insert(ins.slice(i, i + 500)).select('id,owner_id'); if (error) return { ok: false, msg: needSql(error.message) };
    void made; }
  const noti = [...got].filter(([u]) => u !== x.me.id).map(([user_id, n]) => ({ user_id, kind: 'info', title: `인바운드 DB ${n}건이 배정되었습니다`, body: '', link: '/meta-db' })); if (noti.length) await sb.from('notifications').insert(noti);
  revalidatePath('/meta-db'); return { ok: true, msg: `${ins.length - dup}건 등록${dup ? ` · 중복 ${dup}건(중복으로 표시)` : ''}`, added: ins.length - dup, dup };
}
/** 배정·재배정 (팀장·총괄) — to: 사람 id 또는 ''(미배정으로) */
export async function mdAssign(ids: number[], to: string): Promise<R> {
  const x = await who(); if (!x || !x.lead) return { ok: false, msg: '팀장·총괄만 배정할 수 있습니다' };
  const list = (ids ?? []).map(Number).filter(Number.isFinite).slice(0, 3000); if (!list.length) return { ok: false, msg: '먼저 체크해 주세요' };
  if (to && !(await metaPeople()).some(p => p.id === to)) return { ok: false, msg: '메타팀 사람에게만 배정할 수 있습니다' };
  const sb = supabaseAdmin(); const now = new Date().toISOString(); const { data: cur, error: e0 } = await sb.from('meta_leads').select('id,owner_id').in('id', list); if (e0) return { ok: false, msg: needSql(e0.message) };
  const move = (cur ?? []).filter(c => (c.owner_id ?? '') !== (to || '')); if (!move.length) return { ok: false, msg: '이미 그 담당자입니다' };
  // 이전 담당자별로 묶어 넘긴다 — 연락 기록 · 관리 내용 · 결제 내역은 건에 붙어 있어 그대로 따라간다 (인수인계)
  const byPrev = new Map<string, number[]>(); for (const c of move) byPrev.set(c.owner_id ?? '', [...(byPrev.get(c.owner_id ?? '') ?? []), c.id]);
  for (const [prev, idsOf] of byPrev) { const up: Record<string, unknown> = { owner_id: to || null, assigned_at: to ? now : null, updated_at: now, nag_at: null }; if (prev) { up.prev_owner = prev; up.moved_at = now; }
    const { error } = await sb.from('meta_leads').update(up).in('id', idsOf); if (error) return { ok: false, msg: needSql(error.message) }; }
  if (to && to !== x.me.id) await sb.from('notifications').insert({ user_id: to, kind: 'info', title: `메타 DB ${move.length}건이 배정되었습니다`, body: '메타 DB 에서 확인하고 바로 연락해 주세요', link: '/meta-db' });
  revalidatePath('/meta-db'); return { ok: true, msg: `${move.length}건 ${to ? '배정' : '미배정으로'}` };
}
/** 고치기 — 담당자 본인 또는 팀장·총괄. 결제 금액은 여기서 못 고친다(정산요청에서 자동) */
export async function mdUpdate(id: number, patch: { status?: string; grade?: string; channel?: string; next_on?: string | null; alarm_time?: string; care_note?: string; product?: string; name?: string; phone?: string }): Promise<R<{ row: MetaLead }>> {
  const x = await who(); if (!x) return { ok: false, msg: '권한 없음' };
  const sb = supabaseAdmin(); const { data: cur, error } = await sb.from('meta_leads').select('owner_id,status,first_contact_at').eq('id', id).maybeSingle(); if (error) return { ok: false, msg: needSql(error.message) }; if (!cur) return { ok: false, msg: '없는 DB' };
  if (!x.lead && cur.owner_id !== x.me.id) return { ok: false, msg: '본인에게 배정된 DB 만 고칠 수 있습니다' };
  const now = new Date().toISOString(); const up: Record<string, unknown> = { updated_at: now };
  if ('status' in patch) { if (!META_STATUSES.includes(String(patch.status))) return { ok: false, msg: '상태 값이 올바르지 않습니다' }; up.status = patch.status; if (patch.status !== '미연락' && !cur.first_contact_at) { up.first_contact_at = now; up.last_contact_at = now; } }
  if ('grade' in patch) up.grade = META_GRADES.includes(s(patch.grade, 2).toUpperCase()) ? s(patch.grade, 2).toUpperCase() : '';
  if ('channel' in patch) up.channel = s(patch.channel, 30);
  if ('next_on' in patch) { up.next_on = day(patch.next_on); up.alarm_sent_on = null; if (!up.next_on) up.alarm_time = ''; }
  if ('alarm_time' in patch) { up.alarm_time = /^\d{2}:\d{2}$/.test(s(patch.alarm_time, 5)) ? s(patch.alarm_time, 5) : ''; up.alarm_sent_on = null; }
  if ('care_note' in patch) up.care_note = s(patch.care_note, 4000); if ('product' in patch) up.product = s(patch.product, 80);
  if ('name' in patch) up.name = s(patch.name, 100); if ('phone' in patch) { up.phone = s(patch.phone, 40); up.phone_key = s(patch.phone, 40).replace(/\D/g, '').slice(0, 15); }
  const { data, error: e2 } = await sb.from('meta_leads').update(up).eq('id', id).select(COLS).single(); if (e2) return { ok: false, msg: needSql(e2.message) };
  return { ok: true, msg: '저장됨', row: data as MetaLead };
}
export type MetaContact = { id: number; lead_id: number; at: string; way: string; result: string; note: string; by: string };
/** 연락 기록 보기 */
export async function mcList(leadId: number): Promise<R<{ rows: MetaContact[] }>> {
  const x = await who(); if (!x) return { ok: false, msg: '권한 없음' }; const sb = supabaseAdmin();
  const { data: lead } = await sb.from('meta_leads').select('owner_id').eq('id', leadId).maybeSingle(); if (!lead || (!x.lead && lead.owner_id !== x.me.id)) return { ok: false, msg: '권한 없음' };
  const { data, error } = await sb.from('meta_contacts').select('id,lead_id,user_id,at,way,result,note').eq('lead_id', leadId).order('id'); if (error) return { ok: false, msg: needSql(error.message) };
  const ids = [...new Set((data ?? []).map(c => c.user_id).filter(Boolean))]; const { data: ppl } = ids.length ? await sb.from('profiles').select('id,name').in('id', ids) : { data: [] as any[] }; const nm = new Map((ppl ?? []).map((p: any) => [p.id, p.name]));
  return { ok: true, msg: '', rows: (data ?? []).map((c: any) => ({ id: c.id, lead_id: c.lead_id, at: c.at, way: c.way, result: c.result, note: c.note, by: nm.get(c.user_id) ?? '' })) };
}
/** 연락 기록 남기기 — 덮어쓰지 않고 쌓인다. 부재면 상태가 부재로, 통화가 되면 상담중으로 (이미 그 뒤 단계면 그대로). 다음 연락 일시도 같이 정할 수 있다 */
export async function mcAdd(leadId: number, p: { way: string; result: string; note: string; next_on?: string | null; alarm_time?: string }): Promise<R<{ row: MetaLead; contact: MetaContact }>> {
  const x = await who(); if (!x) return { ok: false, msg: '권한 없음' }; const sb = supabaseAdmin();
  const { data: cur, error } = await sb.from('meta_leads').select('owner_id,status,first_contact_at,contacts').eq('id', leadId).maybeSingle(); if (error) return { ok: false, msg: needSql(error.message) }; if (!cur) return { ok: false, msg: '없는 DB' };
  if (!x.lead && cur.owner_id !== x.me.id) return { ok: false, msg: '본인에게 배정된 DB 만 기록할 수 있습니다' };
  const way = META_WAYS.includes(p.way) ? p.way : '전화'; const result = s(p.result, 20); const note = s(p.note, 2000); if (!result && !note) return { ok: false, msg: '결과나 내용을 적어 주세요' };
  const { data: c, error: e1 } = await sb.from('meta_contacts').insert({ lead_id: leadId, user_id: x.me.id, way, result, note }).select('id,lead_id,at,way,result,note').single(); if (e1) return { ok: false, msg: needSql(e1.message) };
  const now = new Date().toISOString(); const up: Record<string, unknown> = { contacts: Number(cur.contacts ?? 0) + 1, last_contact_at: now, memo: [result, note].filter(Boolean).join(' · ').slice(0, 2000), updated_at: now }; if (!cur.first_contact_at) up.first_contact_at = now;
  if (result === '부재' && cur.status === '미연락') up.status = '부재'; else if (result && result !== '부재' && (cur.status === '미연락' || cur.status === '부재')) up.status = result === '거절' ? '종료' : '상담중';
  if (p.next_on !== undefined) { up.next_on = day(p.next_on); up.alarm_time = up.next_on && /^\d{2}:\d{2}$/.test(s(p.alarm_time, 5)) ? s(p.alarm_time, 5) : ''; up.alarm_sent_on = null; }
  const { data: row, error: e2 } = await sb.from('meta_leads').update(up).eq('id', leadId).select(COLS).single(); if (e2) return { ok: false, msg: needSql(e2.message) };
  return { ok: true, msg: `${up.contacts}차 연락 기록`, row: row as MetaLead, contact: { ...(c as any), by: x.me.name } };
}
/** 메타 DB 는 지우지 않는다 (효율 집계가 나중에 달라지지 않게). 잘못 들어온 건은 상태를 「허수」 · 「중복」으로 */
export async function mdDelete(_ids: number[]): Promise<R> { return { ok: false, msg: '메타 DB 는 삭제할 수 없습니다 — 허수 · 중복으로 표시해 주세요' }; }
/** 회사월(21일~20일) 광고비 입력 — 총괄·어드민만 */
export async function mdSpend(month: string, amount: number): Promise<R> {
  const x = await who(); if (!x || !x.boss) return { ok: false, msg: '총괄만 입력할 수 있습니다' };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, msg: '월이 올바르지 않습니다' }; const n = Math.max(0, Math.round(Number(amount) || 0));
  const { error } = await supabaseAdmin().from('meta_ad_spend').upsert({ month, source: '전체', amount: n, updated_by: x.me.id, updated_at: new Date().toISOString() }, { onConflict: 'month,source' }); if (error) return { ok: false, msg: needSql(error.message) };
  revalidatePath('/meta-stats'); return { ok: true, msg: `${month} 광고비 ${n.toLocaleString()}원 저장` };
}
