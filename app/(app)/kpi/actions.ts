'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
export async function submitKpi(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const work_date = String(fd.get('work_date') || todayKST());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(work_date)) return { ok: false, msg: '날짜 형식 오류' };
  if (work_date > todayKST()) return { ok: false, msg: '미래 날짜는 입력할 수 없습니다.' };
  const n = (k: string) => { const v = Number(String(fd.get(k) || '0').replace(/,/g, '')); return Number.isFinite(v) ? Math.trunc(v) : 0; };
  const row = { user_id: me.id, work_date, calls: n('calls'), new_cnt: n('new_cnt'), margin: n('margin'), kakao_db: n('kakao_db'), overtime: fd.get('overtime') === '1', new_margin: n('new_margin'), work_report: String(fd.get('work_report') || ''), feedback: String(fd.get('feedback') || '') };
  if (row.calls < 0 || row.new_cnt < 0 || row.kakao_db < 0) return { ok: false, msg: '콜·신규·DB는 0 이상이어야 합니다.' };
  const { error } = await supabaseServer().from('kpi_daily').upsert(row, { onConflict: 'user_id,work_date' });
  if (error) return { ok: false, msg: `저장 실패: ${error.message}` };
  revalidatePath('/kpi'); revalidatePath('/margin'); revalidatePath('/weekly'); revalidatePath('/');
  return { ok: true, msg: `${work_date} KPI 제출 · 마진·주간보고 반영됨` };
}
