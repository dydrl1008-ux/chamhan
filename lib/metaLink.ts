// 메타 인바운드 DB ↔ 내 DB 연결. 인바운드 DB = 팀장이 나눠주는 창구, 내 DB = 사원이 계속 연락하며 관리하는 곳.
// 배정 → 내 DB 에 한 줄 생성(재배정이면 메모째 이동) / 내 DB 에서 고치면 → 인바운드 DB(효율 집계)로 반영
import { supabaseAdmin } from '@/lib/supabase/admin';
import { metaIntakeOpen } from '@/lib/meta';
export const FIRST_CALL_MIN = 30;   // 배정 후 업무시간 30분 안에 첫 연락이 없으면 「지연」
/** 내 DB 상태 → 인바운드 DB 상태. 아직 아무 기록도 없으면 미연락 */
export function metaStatusOf(my: string, touched: boolean): string {
  if (my === '결제' || my === '이탈') return '결제'; if (my === '부재' || my === '허수' || my === '종료') return my; return touched ? '상담중' : '미연락';
}
const MY_OF: Record<string, string> = { 미연락: '진행', 상담중: '진행', 부재: '부재', 결제: '결제', 허수: '허수', 중복: '종료', 종료: '종료' };
/** 배정 · 재배정 · 배정 해제 — leads: 방금 배정이 바뀐 인바운드 DB */
/** 돌려주는 값: 내 DB 반영이 안 됐을 때의 사유 (정상이면 빈 문자열) */
export async function linkAssign(leadIds: number[], to: string | null, by: string | null): Promise<string> {
  if (!leadIds.length) return ''; const sb = supabaseAdmin(); const now = new Date().toISOString();
  const { data: leads } = await sb.from('meta_leads').select('id,received_on,source,name,phone,phone_key,product,inquiry,url,status').in('id', leadIds); if (!leads?.length) return '';
  const { data: have, error } = await sb.from('my_db').select('id,meta_id').in('meta_id', leadIds); if (error) return /meta_id/.test(error.message) ? '0104 SQL(내 DB 연결 칸)이 아직 반영되지 않았습니다' : error.message;
  const old = new Map((have ?? []).map(h => [Number(h.meta_id), h.id]));
  if (!to) { if (old.size) await sb.from('my_db').update({ deleted_at: now, deleted_by: by, updated_at: now }).in('id', [...old.values()]).is('deleted_at', null); return ''; }   // 배정 해제 → 그 사람 목록에서 내림 (다시 배정하면 메모째 돌아온다)
  if (old.size) await sb.from('my_db').update({ owner_id: to, deleted_at: null, deleted_by: null, source: '메타', updated_at: now }).in('id', [...old.values()]);
  const ins = leads.filter(l => !old.has(l.id) && l.status !== '중복' && l.status !== '허수').map(l => ({ owner_id: to, created_by: by, source: '메타', src_ref: `meta:${l.id}`, meta_id: l.id, contact_date: l.received_on, name: l.name || l.phone || '(이름 없음)', phone: l.phone, phone_key: l.phone_key,
    kind: l.source, item: [l.product, l.inquiry].filter(Boolean).join(' · ').slice(0, 80), url: l.url, status: MY_OF[l.status] ?? '진행' }));
  if (ins.length) { const { error: e2 } = await sb.from('my_db').insert(ins); if (e2) return e2.message; }
  return '';
}
/** 배정은 됐는데 내 DB 에 줄이 없는 건(또는 담당자가 다른 건)을 찾아 맞춘다 — 화면을 열 때마다 조용히 한 번. 돌려주는 값: 고친 건수와 실패 사유 */
export async function linkRepair(): Promise<{ fixed: number; err: string }> {
  const sb = supabaseAdmin(); const { data: leads, error } = await sb.from('meta_leads').select('id,owner_id,status').not('owner_id', 'is', null).limit(5000); if (error || !leads?.length) return { fixed: 0, err: '' };
  const want = leads.filter(l => l.status !== '중복' && l.status !== '허수'); const { data: have, error: e2 } = await sb.from('my_db').select('meta_id,owner_id,deleted_at').not('meta_id', 'is', null).limit(10000); if (e2) return { fixed: 0, err: /meta_id/.test(e2.message) ? '0104 SQL(내 DB 연결 칸)이 아직 반영되지 않았습니다' : e2.message };
  const cur = new Map((have ?? []).map(h => [Number(h.meta_id), h])); const todo = new Map<string, number[]>();
  for (const l of want) { const h = cur.get(l.id); if (!h || h.owner_id !== l.owner_id || h.deleted_at) todo.set(l.owner_id, [...(todo.get(l.owner_id) ?? []), l.id]); }
  let fixed = 0, err = ''; for (const [o, ids] of todo) { const m = await linkAssign(ids, o, null); if (m) err = m; else fixed += ids.length; }
  return { fixed, err };
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
    rows.push({ user_id: uid, kind: 'alert', title: `첫 연락 지연 ${list.length}건 — 배정 후 ${FIRST_CALL_MIN}분이 지났습니다`, body, link: '/meta-db' });
    for (const m of mgrs ?? []) if (m.id !== uid) rows.push({ user_id: m.id, kind: 'alert', title: `${nm} — 첫 연락 지연 ${list.length}건`, body, link: '/meta-db' }); }
  if (rows.length) await sb.from('notifications').insert(rows); return `nag ${late.length}`;
}

/** 5분마다 — 접수 시트 스크립트가 멈췄는지 본다. 받는 시간인데 20분 넘게 아무 호출이 없으면 총괄·대표에게 알림 (3시간에 한 번). 한 번도 연결된 적 없으면 조용히 */
export async function metaIntakeWatch(): Promise<string> {
  if (!metaIntakeOpen()) return 'closed';
  const sb = supabaseAdmin(); const { data, error } = await sb.from('app_settings').select('key,value').in('key', ['meta_intake_seen_at', 'meta_intake_watch_at']); if (error) return 'skip';
  const at = (k: string) => { const v = String((data ?? []).find((x: any) => x.key === k)?.value ?? '').replace(/"/g, ''); const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : 0; };
  const seen = at('meta_intake_seen_at'); if (!seen) return 'never'; const min = Math.floor((Date.now() - seen) / 60000); if (min < 20) return 'ok';
  if (Date.now() - at('meta_intake_watch_at') < 3 * 3600e3) return 'alerted';
  const now = new Date().toISOString(); await sb.from('app_settings').upsert({ key: 'meta_intake_watch_at', value: now, updated_at: now }, { onConflict: 'key' });
  const { data: us } = await sb.from('profiles').select('id').in('role', ['admin', 'head']).eq('is_active', true);
  if (us?.length) await sb.from('notifications').insert(us.map((u: any) => ({ user_id: u.id, kind: 'alert', title: '⚠️ 메타 자동 접수가 멈춘 것 같습니다', body: `접수 시트에서 ${min}분째 아무것도 오지 않습니다 — 시트의 Apps Script 트리거와 실행 로그를 확인해 주세요`, link: '/meta-db' })));
  return `alert ${min}m`;
}

/** 5분마다 — 「다음 연락」에 시각을 정해 둔 메타 건: 그 시각이 되면 담당자에게 한 번 알린다 */
export async function metaAlarmTick(): Promise<string> {
  const k = new Date(Date.now() + 9 * 3600e3); const today = k.toISOString().slice(0, 10); const hm = k.toISOString().slice(11, 16); const sb = supabaseAdmin();
  const { data, error } = await sb.from('meta_leads').select('id,owner_id,name,phone,alarm_time,memo').eq('next_on', today).neq('alarm_time', '').lte('alarm_time', hm).is('alarm_sent_on', null).not('owner_id', 'is', null).not('status', 'in', '("결제","종료","허수","중복")').limit(300); if (error) return 'skip'; if (!data?.length) return 'ok 0';
  await sb.from('meta_leads').update({ alarm_sent_on: today }).in('id', data.map(d => d.id));
  await sb.from('notifications').insert(data.map(d => ({ user_id: d.owner_id, kind: 'alert', title: `⏰ ${d.alarm_time} 연락 — ${d.name}`, body: [d.phone, d.memo].filter(Boolean).join(' · ').slice(0, 300), link: '/meta-db' }))); return `alarm ${data.length}`;
}
