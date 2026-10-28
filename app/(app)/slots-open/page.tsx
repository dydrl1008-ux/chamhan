// 슬롯 오픈 — ykreward 셀러 계정 생성 + 슬롯 발급 (직원·팀장·총괄·대표). 이력: 본인 / 팀장은 팀 / 총괄·대표·관리팀 전체
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, addDays } from '@/lib/date/kst';
import { listSlotTypes, openedSlots, ykrReady, parseBlock, type SlotType, type OpenedSlot } from '@/lib/ykreward';
import { PageHeader, Empty } from '@/components/ui';
import SlotsOpenClient from './SlotsOpenClient';
export const dynamic = 'force-dynamic';

export default async function SlotsOpenPage() {
  const me = (await getProfile())!;
  if (!['staff', 'manager', 'head', 'admin'].includes(me.role) && !me.is_mgmt) redirect('/');
  const sb = supabaseServer();
  if (!ykrReady()) return <div style={{ display: 'grid', gap: 14 }}><PageHeader title="슬롯 오픈" /><div className="card"><Empty>ykreward 연동 설정이 없습니다. Vercel 환경변수 YKREWARD_URL · YKREWARD_SERVICE_KEY 를 넣어 주세요.</Empty></div></div>;
  let types: SlotType[] = [], slots: OpenedSlot[] = [], err = '';
  const { data: hist } = await sb.from('reward_slot_opens').select('*').order('created_at', { ascending: false }).limit(300);   // RLS 가 범위 결정
  const names = me.role === 'admin' || me.role === 'head' || me.is_mgmt ? undefined : [...new Set((hist ?? []).map(h => h.user_id))];
  try {
    const { data: bl } = await sb.from('app_settings').select('value').eq('key', 'ykreward_block_types').maybeSingle();
    types = await listSlotTypes(parseBlock(bl?.value));
    if (names === undefined) slots = await openedSlots();
    else { const { data: ps } = await sb.from('profiles').select('name').in('id', names.length ? names : [me.id]); slots = await openedSlots([...new Set([me.name, ...(ps ?? []).map(p => p.name)])]); }
  } catch (e: any) { err = e?.message ?? String(e); }
  const { data: who } = await sb.from('profiles').select('id,name').in('id', [...new Set((hist ?? []).map(h => h.user_id))]);
  return <SlotsOpenClient me={{ id: me.id, name: me.name, role: me.role }} types={types} slots={slots} hist={(hist ?? []).map(h => ({ ...h, who: who?.find(w => w.id === h.user_id)?.name ?? '' }))} err={err} minStart={addDays(todayKST(), 1)} />;
}
