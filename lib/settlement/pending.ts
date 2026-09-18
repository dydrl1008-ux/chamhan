import { createClient } from '@supabase/supabase-js';
import { settleLogin, fetchApprovals } from './client';
import { todayKST, addDays } from '@/lib/date/kst';
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PENDING = ['승인요청', '정산요청', '대기'];   // 정산 사이트 statusName 중 '미승인' 으로 볼 값
/** 최근 N일 정산 조회 → 승인요청 신규 감지 / 처리된 건 해소. 반환: 신규 건 목록 */
export async function pollPending(days = 3) {
  const sb = admin(); const to = todayKST(), from = addDays(to, -days);
  const cookie = await settleLogin(); const rows = await fetchApprovals(cookie, addDays(from, -10), addDays(to, 1));
  const now = new Date().toISOString();
  const keyOf = (r: any) => [r.settlementSeq, r.confirmSeq, r.reqGubun].filter(v => v != null && String(v) !== '').map(String).join('|');
  const open = rows.filter(r => PENDING.includes(String(r.statusName ?? '').trim()));
  const openKeys = new Set(open.map(keyOf));
  const items = open.map(r => ({ item_key: keyOf(r), settle_no: String(r.settlementSeq ?? ''), empl_id: String(r.userId ?? ''), empl_name: String(r.empName ?? ''), cust_name: String(r.custName ?? ''), prod_name: String(r.prodName ?? ''), req_gubun: String(r.reqGubunName ?? r.gubunName ?? ''), amount: Number(String(r.incomAmt ?? '0').replace(/[^\d.-]/g, '')) || 0, req_date: String(r.dispReqDate ?? r.reqDate ?? '').slice(0, 10) || null, status: String(r.statusName ?? ''), last_seen: now, resolved_at: null, resolved_status: null }));
  const { data: existing } = await sb.from('settlement_pending').select('item_key,resolved_at,notified_at');
  const known = new Set((existing ?? []).map(e => e.item_key));
  const fresh = items.filter(i => !known.has(i.item_key));
  if (items.length) { const { error } = await sb.from('settlement_pending').upsert(items, { onConflict: 'item_key' }); if (error) throw new Error('pending 저장 실패: ' + error.message); }
  // 더 이상 승인요청이 아닌 건 → 해소 (조회 범위 안에서 상태 확인)
  const statusByKey = new Map(rows.map(r => [keyOf(r), String(r.statusName ?? '')]));
  const toResolve = (existing ?? []).filter(e => !e.resolved_at && !openKeys.has(e.item_key));
  for (const e of toResolve) { await sb.from('settlement_pending').update({ resolved_at: now, resolved_status: statusByKey.get(e.item_key) ?? '목록에서 사라짐' }).eq('item_key', e.item_key); }
  return { fresh, open: items.length, resolved: toResolve.length };
}
