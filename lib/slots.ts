// 진행 중 슬롯(정산 원건) — RPC slots_in_range (RLS 범위: 본인/팀/전원)
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, addDays } from '@/lib/date/kst';
export type Slot = { user_id: string; settle_no: string; cust_name: string; prod_name: string; date_from: string; date_to: string; work_day: number | null; inflow_cnt: number | null; sale_total: number; status: string; gubun_name: string | null };
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
/** 종료 임박 기준 일수 (app_settings slot_end_days, 기본 3) — 직원은 설정을 못 읽으므로 서비스 키로 */
export async function slotEndDays() { try { const { data } = await admin().from('app_settings').select('value').eq('key', 'slot_end_days').maybeSingle(); const n = Number(data?.value); return Number.isFinite(n) && n > 0 ? n : 3; } catch { return 3; } }
export async function slotsInRange(from: string, to: string, userId?: string): Promise<Slot[]> {
  const sb = supabaseServer(); const { data, error } = await sb.rpc('slots_in_range', { p_from: from, p_to: to, p_user: userId ?? null });
  if (error) return []; return (data ?? []) as Slot[];
}
export type SlotEx = Slot & { renewed: Slot | null };
/** 종료 임박(오늘~D-days) + 최근 7일 내 종료. 같은 고객·상품으로 종료일 이후 시작하는 원건이 있으면 "연장됨" */
export async function endingSoon(userId: string) {
  const today = todayKST(); const days = await slotEndDays();
  const rows = await slotsInRange(addDays(today, -7), addDays(today, 90), userId);   // 90일 앞까지 받아 연장 여부 판단
  const key = (r: Slot) => `${(r.cust_name ?? '').trim()}|${(r.prod_name ?? '').trim()}`;
  const renewalOf = (r: Slot) => rows.filter(o => o.settle_no !== r.settle_no && key(o) === key(r) && o.date_from > r.date_to).sort((a, b) => a.date_from.localeCompare(b.date_from))[0] ?? null;
  const ex = (r: Slot): SlotEx => ({ ...r, renewed: renewalOf(r) });
  const soon = rows.filter(r => r.date_to >= today && r.date_to <= addDays(today, days)).map(ex).sort((a, b) => (a.renewed ? 1 : 0) - (b.renewed ? 1 : 0) || a.date_to.localeCompare(b.date_to));
  const ended = rows.filter(r => r.date_to < today).map(ex).filter(r => !r.renewed);   // 연장 안 된 것만 (놓친 건)
  return { today, days, soon, ended };
}
export const dLabel = (today: string, d: string) => { const n = Math.round((new Date(d + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 864e5); return n === 0 ? '오늘 종료' : n > 0 ? `D-${n}` : `${-n}일 전 종료`; };
