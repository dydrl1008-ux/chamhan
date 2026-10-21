// 직원 현황 한 줄 통합 데이터 — overview 화면, CSV 내보내기, 직원 상세가 같이 씀 (RLS 범위 내)
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST, addDays } from '@/lib/date/kst';
import { bizMonthOf, bizMonthRange } from '@/lib/date/period';
import { teamReportStatus } from '@/lib/reports';
import { evaluatePeople, type PersonEval } from '@/lib/eval';

export const leaveName: Record<string, string> = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', monthly: '월차', sick: '병가', absent: '결근', late: '지각' };
export type PersonStatus = PersonEval & {
  teamName: string;
  att: { kind: 'leave' | 'in' | 'none'; text: string; late: boolean; out?: string };
  kpi: { submitted: boolean; margin: number; calls: number; newCnt: number; days: number };
  target: number; targetPct: number | null;
  plan: { done: number; total: number } | null;
  report: { cur?: string; last?: string } | null;   // 팀장만 (주간보고)
  pipe: { total: number; nego: number };
  pendingLeaves: number;
};

export async function peopleStatus(opts: { teamId?: number; onlyUser?: string; month?: string } = {}) {
  const sb = supabaseServer(); const today = todayKST(); const curBm = bizMonthOf(today); const bm = opts.month && /^\d{4}-\d{2}$/.test(opts.month) ? opts.month : curBm; const ms = bm + '-01';
  const isCurrent = bm === curBm; const [, bmEnd] = bizMonthRange(bm); const asOf = isCurrent ? today : (bmEnd < today ? bmEnd : today);   // 지난달이면 그 달 마감일 기준으로 평가
  const [{ people, teams }, { data: att }, { data: kpiToday }, { data: leavesPending }, { data: leavesToday }, { data: targets }, { data: wr }, { data: pipe }, { data: plans }, { data: kpiMonth }] = await Promise.all([
    evaluatePeople(asOf, opts.onlyUser),
    sb.from('attendance').select('user_id,check_in,check_out,is_late').eq('work_date', today),
    sb.from('kpi_daily').select('user_id,margin').eq('work_date', today),
    sb.from('leave_requests').select('user_id,type').eq('status', 'pending'),
    sb.from('leave_requests').select('user_id,type').eq('status', 'approved').lte('start_date', today).gte('end_date', today),
    sb.from('monthly_targets').select('user_id,margin').eq('month', ms),
    sb.from('weekly_reports').select('team_id,week_start,week_end,status').gte('week_start', addDays(asOf, -45)).lte('week_start', asOf),
    sb.from('pipeline').select('owner_id,stage').eq('is_active', true),
    sb.from('v_plan_rate').select('user_id,type,total,done').eq('month', ms),
    sb.from('v_margin_monthly').select('user_id,days,calls,new_cnt').eq('month', ms),
  ]);
  const rows: PersonStatus[] = people.filter(p => !opts.teamId || p.team_id === opts.teamId).map(p => {
    const a = att?.find(x => x.user_id === p.id); const lv = leavesToday?.find(x => x.user_id === p.id); const k = kpiToday?.find(x => x.user_id === p.id);
    const km = kpiMonth?.find(x => x.user_id === p.id); const pl = plans?.filter(x => x.user_id === p.id) ?? [];
    const target = Number(targets?.find(t => t.user_id === p.id)?.margin ?? 0); const pc = pipe?.filter(x => x.owner_id === p.id) ?? [];
    const w = p.role === 'manager' ? (() => { const st = teamReportStatus(wr ?? [], p.team_id, asOf); return { cur: st.cur?.status ?? undefined, last: st.last?.status ?? undefined }; })() : null;
    return {
      ...p, teamName: teams.find(t => t.id === p.team_id)?.name ?? '-',
      att: lv ? { kind: 'leave', text: leaveName[lv.type] ?? lv.type, late: false } : a ? { kind: 'in', text: String(a.check_in ?? '').slice(0, 5), late: !!a.is_late, out: a.check_out ? String(a.check_out).slice(0, 5) : undefined } : { kind: 'none', text: '미체크', late: false },
      kpi: { submitted: !!k, margin: Number(k?.margin ?? 0), calls: Number(km?.calls ?? 0), newCnt: Number(km?.new_cnt ?? 0), days: Number(km?.days ?? 0) },
      target, targetPct: target ? Math.round(p.monthMargin / target * 100) : null,
      plan: pl.length ? { done: pl.reduce((s, x) => s + Number(x.done), 0), total: pl.reduce((s, x) => s + Number(x.total), 0) } : null,
      report: w, pipe: { total: pc.length, nego: pc.filter(x => x.stage === '협상').length },
      pendingLeaves: (leavesPending?.filter(x => x.user_id === p.id) ?? []).length,
    };
  });
  const staff = rows.filter(p => p.role === 'staff');
  const sums = {
    att: rows.filter(p => p.att.kind !== 'none').length, kpi: staff.filter(p => p.kpi.submitted).length, staff: staff.length, all: rows.length,
    margin: staff.reduce((a, p) => a + p.monthMargin, 0), pending: staff.reduce((a, p) => a + p.monthPending, 0), target: staff.reduce((a, p) => a + p.target, 0), inc: rows.reduce((a, p) => a + p.inc.total, 0), promo: rows.filter(p => p.promo?.ok).length,
  };
  return { rows, teams, sums, today, bm, isCurrent, asOf };
}

/** 현황 표 → CSV (엑셀용 BOM 포함) */
export function statusCsv(rows: PersonStatus[], bm: string) {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['이름', '팀', '직급', '오늘 근태', '지각', '근태 대기', '오늘 KPI', '오늘 마진', `${Number(bm.slice(5))}월 마진`, '승인 대기 마진', '목표', '달성률%', '콜(월)', '신규(월)', 'KPI 입력일', '계획 완료', '계획 전체', '주간보고', '가망건', '협상중', '진급', '예상 인센티브'];
  const lines = rows.map(p => [p.name, p.teamName, p.position ?? '', p.att.kind === 'leave' ? p.att.text : p.att.kind === 'in' ? `출근 ${p.att.text}${p.att.out ? '~' + p.att.out : ''}` : '미체크', p.att.late ? 'Y' : '', p.pendingLeaves || '', p.role === 'manager' ? '' : p.kpi.submitted ? '제출' : '미제출', p.kpi.submitted ? p.kpi.margin : '', p.monthMargin, p.monthPending || '', p.target || '', p.targetPct ?? '', p.kpi.calls, p.kpi.newCnt, p.kpi.days, p.plan?.done ?? '', p.plan?.total ?? '', p.report ? (p.report.cur === 'submitted' ? '제출' : p.report.cur === 'draft' ? '작성중' : '없음') : '', p.pipe.total || '', p.pipe.nego || '', p.promo ? (p.promo.ok ? `도달→${p.promo.c.to_position}` : `미도달(${p.promo.fails.join('·')})`) : '', p.inc.total].map(esc).join(','));
  return '﻿' + [head.join(','), ...lines].join('\r\n');
}
