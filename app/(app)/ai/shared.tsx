// AI팀 화면 공용 (상태 이름·시간 표기·상단 숫자 카드)
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import { Stat } from '@/components/ui';

export const KIND: Record<string, string> = { order: '지시', work: '작업', review: '검증', report: '보고', check: '점검', briefing: '브리핑' };
export const ST: Record<string, [string, 'ok' | 'wait' | 'bad' | 'off']> = {
  queued: ['대기', 'wait'], running: ['진행', 'wait'], waiting: ['분배됨', 'wait'], review: ['검증 중', 'wait'],
  done: ['완료', 'ok'], rejected: ['반려', 'bad'], failed: ['실패', 'bad'], cancelled: ['취소', 'off'],
};
export const CK: Record<string, 'ok' | 'wait' | 'bad'> = { ok: 'ok', warn: 'wait', bad: 'bad' };
export const SRC: Record<string, string> = { telegram: '텔레그램', workhub: '워크허브', schedule: '자동 일정', agent: '에이전트' };
export const kst = (s: string | null) => s ? new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
/** pg_cron UTC 식 → KST 표기 (분 시 * * * 형태만) */
export function cronKST(c: string) {
  const [m, h, ...rest] = c.split(' '); if (!/^\d+$/.test(m) || !/^\d+$/.test(h) || rest.join(' ') !== '* * *') return `${c} (UTC)`;
  return `매일 ${String((Number(h) + 9) % 24).padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/** 세 화면 공통 상단: 실행기 · 점검 · 진행 중 · 오늘 실행 */
export async function AiStats() {
  const sb = supabaseServer();
  const startIso = new Date(`${todayKST()}T00:00:00+09:00`).toISOString();
  const [{ data: hb }, { data: checks }, { count: runsToday }, { count: openCnt }] = await Promise.all([
    sb.from('ai_worker_heartbeat').select('seen_at').order('seen_at', { ascending: false }).limit(1),
    sb.from('ai_check_latest').select('status,run_at').order('run_at', { ascending: false }),
    sb.from('ai_runs').select('id', { count: 'exact', head: true }).gte('started_at', startIso),
    sb.from('ai_tasks').select('id', { count: 'exact', head: true }).in('status', ['queued', 'running', 'waiting', 'review']),
  ]);
  const last = hb?.[0]; const alive = !!last && Date.now() - new Date(last.seen_at).getTime() < 5 * 60e3;
  const reds = (checks ?? []).filter(c => c.status !== 'ok');
  return (
    <div className="grid4">
      <Stat label="실행기" value={alive ? '켜짐' : '꺼짐'} tone={alive ? 'ok' : 'bad'} desc={last ? `마지막 신호 ${kst(last.seen_at)}` : '신호 기록 없음'} />
      <Stat label="점검" href="/ai/checks" value={reds.length ? `이상 ${reds.length}` : (checks?.length ? '정상' : '-')} tone={reds.some(r => r.status === 'bad') ? 'bad' : reds.length ? 'wait' : 'ok'} desc={checks?.[0] ? `최근 ${kst(checks[0].run_at)}` : '아직 실행 전'} />
      <Stat label="진행 중 작업" href="/ai/orders" value={openCnt ?? 0} desc="대기·진행·분배·검증" />
      <Stat label="오늘 AI 실행" value={`${runsToday ?? 0}회`} desc="Claude 실행 횟수" />
    </div>
  );
}

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  return <>{msg && <div className="note info">{msg}</div>}{err && <div className="err">{err}</div>}</>;
}
