// 메타팀 — 팀 이름이 '메타팀'인 사람. 인바운드 DB 처리 전담이라 영업사원용 화면(콜 리스트·제안서·메일 등)은 보이지 않는다
import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
export const META_TEAM = '메타팀';
export const metaTeamId = cache(async (): Promise<number | null> => { const { data } = await supabaseAdmin().from('teams').select('id').eq('name', META_TEAM).maybeSingle(); return data?.id ?? null; });
export async function isMeta(p: { team_id: number | null; role: string }): Promise<boolean> { if (p.role === 'admin' || p.role === 'head' || p.team_id == null) return false; return p.team_id === await metaTeamId(); }
/** 메타팀 화면을 볼 수 있나 — 메타팀원 + 총괄·어드민. lead = 배분·효율까지 (메타팀 팀장 + 총괄·어드민) */
export async function metaAccess(p: { team_id: number | null; role: string }): Promise<{ ok: boolean; lead: boolean; boss: boolean }> {
  const boss = p.role === 'admin' || p.role === 'head'; const m = await isMeta(p); return { ok: boss || m, lead: boss || (m && p.role === 'manager'), boss };
}
/** 메타팀에게 막는 주소 (영업사원용 자료 · 마진 · 진급 기준) */
export const META_BLOCK = ['/calls', '/kw-calls', '/leads', '/proposals', '/mail', '/brief', '/renewals', '/sales-stats', '/missions', '/call-status', '/margin', '/kpi', '/criteria', '/overview', '/monthly', '/weekly', '/reports', '/threads', '/pv3', '/ai'];
export const META_STATUSES = ['미연락', '부재', '상담중', '결제', '허수', '중복', '종료'];
