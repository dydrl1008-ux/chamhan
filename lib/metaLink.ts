// 메타 인바운드 DB ↔ 내 DB 연결. 인바운드 DB = 팀장이 나눠주는 창구, 내 DB = 사원이 계속 연락하며 관리하는 곳.
// 배정 → 내 DB 에 한 줄 생성(재배정이면 메모째 이동) / 내 DB 에서 고치면 → 인바운드 DB(효율 집계)로 반영
import { supabaseAdmin } from '@/lib/supabase/admin';
export const FIRST_CALL_MIN = 30;   // 배정 후 업무시간 30분 안에 첫 연락이 없으면 「지연」
/** 내 DB 상태 → 인바운드 DB 상태. 아직 아무 기록도 없으면 미연락 */
export function metaStatusOf(my: string, touched: boolean): string {
  if (my === '결제' || my === '이탈') return '결제'; if (my === '부재' || my === '허수' || my === '종료') return my; return touched ? '상담중' : '미연락';
}
const MY_OF: Record<string, string> = { 미연락: '진행', 상담중: '진행', 부재: '부재', 결제: '결제', 허수: '허수', 중복: '종료', 종료: '종료' };
/** 배정 · 재배정 · 배정 해제 — leads: 방금 배정이 바뀐 인바운드 DB */
export async function linkAssign(leadIds: number[], to: string | null, by: string): Promise<void> {
  if (!leadIds.length) return; const sb = supabaseAdmin(); const now = new Date().toISOString();
  const { data: leads } = await sb.from('meta_leads').select('id,received_on,source,name,phone,phone_key,product,inquiry,url,status').in('id', leadIds); if (!leads?.length) return;
  const { data: have, error } = await sb.from('my_db').select('id,meta_id').in('meta_id', leadIds); if (error) return;   // 0104 SQL 전 — 내 DB 연결 없이 배정만
  const old = new Map((have ?? []).map(h => [Number(h.meta_id), h.id]));
  if (!to) { if (old.size) await sb.from('my_db').update({ deleted_at: now, deleted_by: by, updated_at: now }).in('id', [...old.values()]).is('deleted_at', null); return; }   // 배정 해제 → 그 사람 목록에서 내림 (다시 배정하면 메모째 돌아온다)
  if (old.size) await sb.from('my_db').update({ owner_id: to, deleted_at: null, deleted_by: null, source: '메타', updated_at: now }).in('id', [...old.values()]);
  const ins = leads.filter(l => !old.has(l.id) && l.status !== '중복' && l.status !== '허수').map(l => ({ owner_id: to, created_by: by, source: '메타', src_ref: `meta:${l.id}`, meta_id: l.id, contact_date: l.received_on, name: l.name || l.phone || '(이름 없음)', phone: l.phone, phone_key: l.phone_key,
    kind: l.source, item: [l.product, l.inquiry].filter(Boolean).join(' · ').slice(0, 80), url: l.url, status: MY_OF[l.status] ?? '진행' }));
  if (ins.length) await sb.from('my_db').insert(ins);
}
/** 내 DB 에서 메타 건을 고쳤을 때 — 인바운드 DB 에 상태 · 결제 금액 · 상품비 · 다음 연락 · 연락 차수를 반영 */
export async function syncFromMyDb(row: { meta_id?: number | null; status: string; paid_amt?: number | null; cost_amt?: number | null; next_on: string | null; note1: string; note2: string; note3: string; grade: string; channel: string }): Promise<void> {
  if (!row.meta_id) return; const sb = supabaseAdmin(); const now = new Date().toISOString();
  const { data: cur } = await sb.from('meta_leads').select('status,first_contact_at,paid_at').eq('id', row.meta_id).maybeSingle(); if (!cur) return;
  const notes = [row.note1, row.note2, row.note3].filter(n => n.trim()); const touched = !!cur.first_contact_at || notes.length > 0 || row.status !== '진행' || !!row.grade || !!row.channel;
  const status = metaStatusOf(row.status, touched); const up: Record<string, unknown> = { status, paid_amt: row.paid_amt ?? null, cost_amt: row.cost_amt ?? null, next_on: row.next_on, memo: (notes[notes.length - 1] ?? '').slice(0, 2000), contacts: notes.length, updated_at: now };
  if (touched) { up.last_contact_at = now; if (!cur.first_contact_at) up.first_contact_at = now; }
  if (status !== cur.status) up.paid_at = status === '결제' ? (cur.paid_at ?? now) : null;
  await sb.from('meta_leads').update(up).eq('id', row.meta_id);
}
/** 인바운드 DB 에서 팀장이 고쳤을 때 — 연결된 내 DB 줄에도 같은 값을 넣는다 */
export async function syncToMyDb(leadId: number, p: { status?: string; paid_amt?: number | null; cost_amt?: number | null; next_on?: string | null }): Promise<void> {
  const up: Record<string, unknown> = {}; if (p.status && MY_OF[p.status]) { up.status = MY_OF[p.status]; up.paid_at = p.status === '결제' ? new Date().toISOString() : null; }
  if ('paid_amt' in p) up.paid_amt = p.paid_amt ?? null; if ('cost_amt' in p) up.cost_amt = p.cost_amt ?? null; if ('next_on' in p) up.next_on = p.next_on ?? null; if (!Object.keys(up).length) return;
  await supabaseAdmin().from('my_db').update({ ...up, updated_at: new Date().toISOString() }).eq('meta_id', leadId);
}
/** 업무시간(평일 09:00~18:00, KST)으로 몇 분 지났나 */
export function bizMinutesSince(iso: string, nowMs = Date.now()): number {
  let t = new Date(iso).getTime(); if (!Number.isFinite(t) || t >= nowMs) return 0; let min = 0; const K = 9 * 3600e3;
  for (let i = 0; i < 400 && t < nowMs; i++) { const k = new Date(t + K); const dow = k.getUTCDay(); const dayStart = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - K; const open = dayStart + 9 * 3600e3, close = dayStart + 18 * 3600e3;
    if (dow !== 0 && dow !== 6) { const a = Math.max(t, open), b = Math.min(nowMs, close); if (b > a) min += (b - a) / 60000; } t = dayStart + 24 * 3600e3; }
  return Math.floor(min);
}
/** 5분마다 — 배정 후 업무시간 30분이 지나도록 첫 연락이 없는 건을 담당자와 팀장에게 한 번 알린다 */
export async function metaNagTick(): Promise<string> {
  const k = new Date(Date.now() + 9 * 3600e3); const hm = k.toISOString().slice(11, 16); if (k.getUTCDay() === 0 || k.getUTCDay() === 6 || hm < '09:00' || hm >= '18:00') return 'off';
  const sb = supabaseAdmin(); const { data, error } = await sb.from('meta_leads').select('id,owner_id,name,product,assigned_at').eq('status', '미연락').not('owner_id', 'is', null).is('first_contact_at', null).is('nag_at', null).limit(300); if (error) return 'skip';
  const late = (data ?? []).filter(l => l.assigned_at && bizMinutesSince(l.assigned_at) >= FIRST_CALL_MIN); if (!late.length) return 'ok 0';
  await sb.from('meta_leads').update({ nag_at: new Date().toISOString() }).in('id', late.map(l => l.id));
  const by = new Map<string, typeof late>(); for (const l of late) by.set(l.owner_id, [...(by.get(l.owner_id) ?? []), l]);
  const { data: ppl } = await sb.from('profiles').select('id,name,team_id,role').in('id', [...by.keys()]); const tid = ppl?.[0]?.team_id; const { data: mgrs } = tid == null ? { data: [] as any[] } : await sb.from('profiles').select('id').eq('team_id', tid).eq('role', 'manager').eq('is_active', true);
  const rows: any[] = []; for (const [uid, list] of by) { const nm = ppl?.find(p => p.id === uid)?.name ?? ''; const body = list.slice(0, 8).map(l => `${l.name} (${l.product || '-'})`).join(', ');
    rows.push({ user_id: uid, kind: 'alert', title: `첫 연락 지연 ${list.length}건 — 배정 후 ${FIRST_CALL_MIN}분이 지났습니다`, body, link: '/my-db' });
    for (const m of mgrs ?? []) if (m.id !== uid) rows.push({ user_id: m.id, kind: 'alert', title: `${nm} — 첫 연락 지연 ${list.length}건`, body, link: '/meta-db' }); }
  if (rows.length) await sb.from('notifications').insert(rows); return `nag ${late.length}`;
}
