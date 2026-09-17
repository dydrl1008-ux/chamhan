import { createClient } from '@supabase/supabase-js';
import { settleLogin, fetchApprovals, type SettleRow } from './client';
import { todayKST, addDays } from '@/lib/date/kst';
export type FieldMap = { settle_no: string; empl_id: string; req_date: string; profit: string; status: string; status_ok: string };
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const toDate = (v: unknown) => { const s = String(v ?? '').trim(); const m = s.match(/(\d{4})[-./]?(\d{2})[-./]?(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const toNum = (v: unknown) => { const n = Number(String(v ?? '0').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
export async function loadMap(): Promise<FieldMap | null> {
  const { data } = await admin().from('app_settings').select('value').eq('key', 'settle_field_map').maybeSingle();
  try { const m = JSON.parse(data?.value || '{}'); return m.settle_no && m.empl_id && m.req_date && m.profit && m.status ? { status_ok: '승인완료', ...m } : null; } catch { return null; }
}
export async function runSync(from: string, to: string, triggeredBy: string): Promise<{ ok: boolean; msg: string; fetched: number; applied: number }> {
  const sb = admin(); const { data: run } = await sb.from('settlement_sync_runs').insert({ range_from: from, range_to: to, triggered_by: triggeredBy }).select('id').single();
  const finish = async (ok: boolean, message: string, fetched = 0, applied = 0) => { if (run) await sb.from('settlement_sync_runs').update({ finished_at: new Date().toISOString(), ok, message, rows_fetched: fetched, rows_applied: applied }).eq('id', run.id); return { ok, msg: message, fetched, applied }; };
  try {
    const map = await loadMap(); if (!map) return finish(false, '필드 매핑이 없습니다. 어드민 › 정산 연동 › 연결 테스트 후 매핑 저장');
    const cookie = await settleLogin(); const rows = await fetchApprovals(cookie, from, to);
    // 유일키 = 정산번호 + 승인번호 + 요청구분 (환불 건이 같은 정산번호를 쓰는 경우 대비)
    const keyOf = (r: SettleRow) => [r[map.settle_no], r['confirmSeq'], r['reqGubun']].filter(v => v !== undefined && v !== null && String(v) !== '').map(String).join('|');
    const items = rows.map(r => ({ settle_no: keyOf(r), empl_id: String(r[map.empl_id] ?? '').trim(), req_date: toDate(r[map.req_date]), profit: toNum(r[map.profit]), status: String(r[map.status] ?? '').trim(), raw: r })).filter(x => x.settle_no && x.req_date);
    if (rows.length && !items.length) return finish(false, `매핑된 필드에서 값을 못 읽음 (키: ${Object.keys(rows[0]).join(',')})`, rows.length);
    { const { error: ed } = await sb.from('settlement_items').delete().gte('req_date', from).lte('req_date', to); if (ed) return finish(false, '기간 정리 실패: ' + ed.message, rows.length); }
    for (let i = 0; i < items.length; i += 500) { const { error } = await sb.from('settlement_items').upsert(items.slice(i, i + 500), { onConflict: 'settle_no' }); if (error) return finish(false, 'settlement_items 저장 실패: ' + error.message, rows.length); }
    const { data: applied, error } = await sb.rpc('apply_settlement_margin', { p_from: from, p_to: to });
    if (error) return finish(false, 'KPI 반영 실패: ' + error.message, rows.length);
    return finish(true, `${from}~${to} 정산 ${items.length}건 → KPI ${applied}건 반영`, items.length, Number(applied ?? 0));
  } catch (e: any) { return finish(false, e.message); }
}
export const defaultRange = () => { const t = todayKST(); return { from: addDays(t, -7), to: t }; };
