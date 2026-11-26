'use server';
// 메타 보고 제출 — 일일: 메타팀 사원 · 팀장 본인 것 / 주간: 메타팀 팀장(총괄도 가능). 같은 날 · 같은 주는 다시 내면 덮어쓴다
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { metaAccess } from '@/lib/meta';
import { todayKST, weekStartOf } from '@/lib/date/kst';
import { DAILY_FIELDS, WEEKLY_FIELDS, dailyAuto, weeklyAuto } from '@/lib/metaReport';
import { metaPeople } from '../meta-db/actions';
type R = { ok: boolean; msg: string };
const needSql = (m: string) => /meta_reports|cost_amt/.test(m) ? '0102 SQL(상품비 칸 · 메타 보고)을 먼저 실행해 주세요' : m;
const clean = (fields: readonly { key: string }[], d: Record<string, string>) => Object.fromEntries(fields.map(f => [f.key, String(d?.[f.key] ?? '').trim().slice(0, 3000)]));
export async function mrDaily(data: Record<string, string>): Promise<R> {
  const me = await getProfile(); if (!me || !me.is_active) return { ok: false, msg: '권한 없음' }; const a = await metaAccess(me); if (!a.ok || a.boss) return { ok: false, msg: '메타팀만 제출합니다' };
  const day = todayKST(); const d = clean(DAILY_FIELDS, data); if (!d.lost && !d.win && !d.quality && !d.ask) return { ok: false, msg: '한 칸 이상은 적어 주세요' };
  try { const auto = await dailyAuto(me.id, day); const { error } = await supabaseAdmin().from('meta_reports').upsert({ user_id: me.id, kind: 'daily', period_key: day, auto, data: d, submitted_at: new Date().toISOString() }, { onConflict: 'user_id,kind,period_key' }); if (error) return { ok: false, msg: needSql(error.message) }; }
  catch (e: any) { return { ok: false, msg: needSql(String(e?.message ?? e)) }; }
  revalidatePath('/meta-report'); return { ok: true, msg: '일일 보고를 제출했습니다' };
}
export async function mrWeekly(week: string, data: Record<string, string>): Promise<R> {
  const me = await getProfile(); if (!me || !me.is_active) return { ok: false, msg: '권한 없음' }; const a = await metaAccess(me); if (!a.lead) return { ok: false, msg: '주간 보고는 팀장이 제출합니다' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || weekStartOf(week) !== week || week > todayKST()) return { ok: false, msg: '주가 올바르지 않습니다' };
  try { const auto = await weeklyAuto(week, await metaPeople()); const { error } = await supabaseAdmin().from('meta_reports').upsert({ user_id: me.id, kind: 'weekly', period_key: week, auto, data: clean(WEEKLY_FIELDS, data), submitted_at: new Date().toISOString() }, { onConflict: 'user_id,kind,period_key' }); if (error) return { ok: false, msg: needSql(error.message) }; }
  catch (e: any) { return { ok: false, msg: needSql(String(e?.message ?? e)) }; }
  revalidatePath('/meta-report'); return { ok: true, msg: '주간 보고를 제출했습니다' };
}
