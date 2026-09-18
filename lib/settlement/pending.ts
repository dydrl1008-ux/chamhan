import { createClient } from '@supabase/supabase-js';
import { settleLogin, fetchApprovals, type SettleRow } from './client';
import { todayKST, addDays } from '@/lib/date/kst';
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PENDING = ['승인요청', '정산요청', '대기'];   // 정산 사이트 statusName 중 '미승인' 으로 볼 값

// 세션 재사용 (같은 서버 인스턴스에서 20분). 실패하면 재로그인 1회
let cached: { cookie: string; at: number } | null = null;
async function withSession<T>(fn: (cookie: string) => Promise<T>): Promise<T> {
  if (!cached || Date.now() - cached.at > 20 * 60_000) cached = { cookie: await settleLogin(), at: Date.now() };
  try { return await fn(cached.cookie); }
  catch (e: any) { if (/세션|권한|401|403|302|JSON 아님/.test(e.message)) { cached = { cookie: await settleLogin(), at: Date.now() }; return fn(cached.cookie); } throw e; }
}
const keyOf = (r: SettleRow) => [r.settlementSeq, r.confirmSeq, r.reqGubun].filter(v => v != null && String(v) !== '').map(String).join('|');

/** 승인요청 감시: 상태 코드(settle_pending_code, 기본 01)로 회사연도 시작~오늘 조회 → 신규 감지 / 처리된 건 해소 */
export async function pollPending(_days = 3) {
  const sb = admin(); const to = todayKST();
  const { data: cs } = await sb.from('app_settings').select('key,value').in('key', ['settle_pending_code']);
  const code = (cs?.find(x => x.key === 'settle_pending_code')?.value ?? '01').trim();
  const y = Number(to.slice(0, 4)); const fy = to >= `${y}-12-21` ? `${y}-12-21` : `${y - 1}-12-21`;
  const rows = await withSession(c => fetchApprovals(c, addDays(fy, -60), addDays(to, 1), code));
  const dist: Record<string, number> = {}; for (const r of rows) { const k = String((r as any).statusName ?? '(없음)'); dist[k] = (dist[k] ?? 0) + 1; }
  const now = new Date().toISOString();
  const open = rows.filter(r => PENDING.includes(String(r.statusName ?? '').trim()));
  const openKeys = new Set(open.map(keyOf));
  const items = open.map(r => ({ item_key: keyOf(r), settle_no: String(r.settlementSeq ?? ''), empl_id: String(r.userId ?? ''), empl_name: String(r.empName ?? ''), cust_name: String(r.custName ?? ''), prod_name: String(r.prodName ?? ''), req_gubun: String(r.reqGubunName ?? r.gubunName ?? ''), amount: Number(String(r.incomAmt ?? '0').replace(/[^\d.-]/g, '')) || 0, req_date: String(r.dispReqDate ?? r.reqDate ?? '').slice(0, 10) || null, status: String(r.statusName ?? ''), last_seen: now, resolved_at: null, resolved_status: null }));
  const { data: existing, error: e0 } = await sb.from('settlement_pending').select('item_key,resolved_at,notified_at,dismissed_at');
  if (e0) throw new Error('pending 조회 실패: ' + e0.message);
  const openBefore = new Set((existing ?? []).filter(e => !e.resolved_at).map(e => e.item_key));
  const dismissed = new Set((existing ?? []).filter(e => e.dismissed_at).map(e => e.item_key));
  // 신규 = 처음 보는 건 + 해소됐다가 다시 승인요청으로 올라온 건 (무시한 건 제외)
  const fresh = items.filter(i => !openBefore.has(i.item_key) && !dismissed.has(i.item_key));
  if (items.length) { const { error } = await sb.from('settlement_pending').upsert(items, { onConflict: 'item_key' }); if (error) throw new Error('pending 저장 실패: ' + error.message); }
  // 해소: 조회 결과에 없는 대기 건.
  //  - 상태 필터 조회가 0건이면 '전부 처리됨' 일 수도, 사이트 오류일 수도 있으므로 최근 7일 일반 조회로 사이트 정상 여부를 확인한 뒤에만 해소
  //  - 조회 결과에 승인요청 상태가 하나도 없는데 다른 상태만 있으면(코드 잘못) 해소하지 않음
  let resolved = 0; let healthy = rows.length > 0 && open.length > 0;
  if (rows.length > 0 && open.length === 0) healthy = false;                     // 코드 오류 의심
  if (rows.length === 0) { try { const probe = await withSession(c => fetchApprovals(c, addDays(to, -7), addDays(to, 1), '')); healthy = probe.length > 0; } catch { healthy = false; } }
  if (healthy) {
    const toResolve = (existing ?? []).filter(e => !e.resolved_at && !openKeys.has(e.item_key));
    if (toResolve.length) { const { error } = await sb.from('settlement_pending').update({ resolved_at: now, resolved_status: '처리됨 (승인요청 목록에서 제외)' }).in('item_key', toResolve.map(e => e.item_key)); if (error) throw new Error('해소 처리 실패: ' + error.message); resolved = toResolve.length; }
  }
  const visible = items.filter(i => !dismissed.has(i.item_key)).length;
  return { fresh, open: visible, resolved, code, dist, total: rows.length, healthy };
}
