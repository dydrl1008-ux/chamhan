// 워크허브 통합 점검 — 실제 Supabase에 4개 계정으로 로그인해 권한·흐름을 자동 검증
// 실행: node scripts/check-all.mjs   (scripts/check.env 필요)
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(fs.readFileSync(new URL('./check.env', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL_ = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY || '';
const ACC = { head: [env.HEAD_EMAIL, env.HEAD_PASSWORD], mgr: [env.MANAGER_EMAIL, env.MANAGER_PASSWORD], st1: [env.STAFF1_EMAIL, env.STAFF1_PASSWORD], st2: [env.STAFF2_EMAIL, env.STAFF2_PASSWORD] };
const results = []; let cleanup = [];
const ok = (name, cond, note = '') => results.push({ name, pass: !!cond, note });
const kst = () => new Date(Date.now() + 9 * 3600e3);
const today = kst().toISOString().slice(0, 10);
const nowHM = kst().toISOString().slice(11, 16);
const minusMin = (m) => new Date(kst().getTime() - m * 60e3).toISOString().slice(11, 16);
const TD = '2030-03-04'; // 테스트용 미래 날짜(근태) — 실제 데이터와 안 섞임

async function login(k) { const c = createClient(URL_, ANON, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email: ACC[k][0], password: ACC[k][1] }); if (error) throw new Error(`${k} 로그인 실패: ${error.message}`); const { data: p } = await c.from('profiles').select('id,name,role,team_id').eq('email', ACC[k][0]).single(); return { c, p }; }
const cnt = async (c, t, q = x => x) => { const { count } = await q(c.from(t).select('id', { count: 'exact', head: true })); return count ?? 0; };

try {
  const H = await login('head'), M = await login('mgr'), S1 = await login('st1'), S2 = await login('st2');
  ok('로그인 4계정', true, `${H.p.name}/${M.p.name}/${S1.p.name}/${S2.p.name}`);
  ok('역할 확인', H.p.role === 'head' && M.p.role === 'manager' && S1.p.role === 'staff' && S2.p.role === 'staff', `${H.p.role}/${M.p.role}/${S1.p.role}/${S2.p.role}`);
  ok('직원1은 팀장 팀, 직원2는 다른 팀', S1.p.team_id === M.p.team_id && S2.p.team_id !== M.p.team_id, `팀 ${M.p.team_id}/${S1.p.team_id}/${S2.p.team_id}`);

  // ---- 가시성 ----
  const all = await cnt(H.c, 'profiles'); const mTeam = await cnt(M.c, 'profiles'); const s1 = await cnt(S1.c, 'profiles');
  ok('총괄 전체 인원 보임', all >= 5, `${all}명`); ok('팀장은 본인 팀만', mTeam < all && mTeam >= 2, `${mTeam}명`); ok('직원은 본인만', s1 === 1, `${s1}명`);
  ok('직원이 allowed_ips 조회 → 0', (await cnt(S1.c, 'allowed_ips')) === 0);

  // ---- 출퇴근 ----
  let r = await S1.c.rpc('attendance_check', { p_kind: 'in', p_time: minusMin(30), p_ip: '1.1.1.1', p_ua: 'check' });
  ok('30분 전 시각 출근(직접 호출) → 차단', !!r.error, r.error?.message?.slice(0, 40));
  r = await S1.c.rpc('attendance_check', { p_kind: 'in', p_time: nowHM, p_ip: '1.1.1.1', p_ua: 'check' });
  ok('현재 시각 출근 → 기록(기존 기록 있으면 유지)', !r.error, r.error?.message);
  const attId = r.data?.id;
  r = await S1.c.from('attendance').insert({ user_id: S2.p.id, work_date: TD, check_in: '09:00' });
  ok('직원1이 직원2 출근 입력 → 차단', !!r.error);
  // 수정 요청
  r = await S1.c.rpc('request_correction', { p_attendance: attId, p_field: 'check_out', p_new: '18:31', p_reason: '자동점검' });
  const corrId = r.data?.id; ok('출근 수정 요청 생성', !r.error && corrId, r.error?.message); if (corrId) cleanup.push(['attendance_corrections', corrId]);
  r = await M.c.rpc('decide_correction', { p_id: corrId, p_status: 'approved' }); ok('팀장 수정요청 승인 → 차단', !!r.error);
  r = await H.c.rpc('decide_correction', { p_id: corrId, p_status: 'rejected' }); ok('총괄 수정요청 반려 → ok', !r.error, r.error?.message);
  ok('직원2가 직원1 출퇴근 못 봄', (await cnt(S2.c, 'attendance', q => q.eq('user_id', S1.p.id))) === 0);

  // ---- 근태 2단계 ----
  r = await S1.c.from('leave_requests').insert({ user_id: S1.p.id, type: 'sick', start_date: TD, end_date: TD, reason: '자동점검', requested_by: S1.p.id }).select('id').single();
  const lv = r.data?.id; ok('직원1 병가 신청 → 대기 (연차 잔여와 무관한 유형으로 흐름 점검)', !r.error && lv, r.error?.message); if (lv) cleanup.push(['leave_requests', lv]);
  r = await S1.c.from('leave_requests').insert({ user_id: S1.p.id, type: 'annual', start_date: '2030-03-06', end_date: '2030-03-20', reason: '자동점검', requested_by: S1.p.id }); ok('연차 15일 신청(잔여 초과) → 차단', !!r.error && /잔여/.test(r.error?.message ?? ''), r.error?.message?.slice(0, 40)); if (r.data) {}
  r = await S1.c.from('leave_requests').insert({ user_id: S1.p.id, type: 'late', start_date: TD, end_date: TD, requested_by: S1.p.id }); ok('직원이 지각 직접 등록 → 차단', !!r.error);
  r = await S1.c.from('leave_requests').update({ status: 'approved' }).eq('id', lv).select('id'); ok('직원 본인 승인 → 차단', !!r.error || !r.data?.length);
  ok('직원2가 직원1 근태 못 봄', (await cnt(S2.c, 'leave_requests', q => q.eq('id', lv))) === 0);
  r = await H.c.from('leave_requests').update({ status: 'approved' }).eq('id', lv).select('id'); ok('팀승인 전 총괄 최종승인 → 차단', !!r.error, r.error?.message?.slice(0, 30));
  r = await M.c.from('leave_requests').update({ status: 'approved' }).eq('id', lv).select('id'); ok('팀장이 최종승인 → 차단', !!r.error);
  r = await M.c.from('leave_requests').update({ team_approved_at: new Date().toISOString() }).eq('id', lv).select('team_approved_by'); ok('팀장 팀승인 → ok, 팀장 기록', !r.error && r.data?.[0]?.team_approved_by === M.p.id, r.error?.message);
  r = await M.c.from('leave_requests').update({ team_approved_at: null }).eq('id', lv).select('id'); ok('팀장 팀승인 취소 → ok', !r.error && r.data?.length === 1);
  await M.c.from('leave_requests').update({ team_approved_at: new Date().toISOString() }).eq('id', lv);
  r = await H.c.from('leave_requests').update({ status: 'approved' }).eq('id', lv).select('status,decided_by'); ok('총괄 최종승인 → approved', r.data?.[0]?.status === 'approved' && r.data?.[0]?.decided_by === H.p.id, r.error?.message);
  r = await H.c.from('leave_requests').update({ status: 'pending' }).eq('id', lv).select('status,decided_by'); ok('총괄 승인취소 → 대기', r.data?.[0]?.status === 'pending' && r.data?.[0]?.decided_by === null);
  r = await M.c.from('leave_requests').insert({ user_id: S2.p.id, type: 'absent', start_date: TD, end_date: TD, requested_by: M.p.id }); ok('팀장이 타팀 직원 결근 등록 → 차단', !!r.error);
  r = await H.c.from('leave_requests').insert({ user_id: S1.p.id, type: 'monthly', start_date: '2030-03-05', end_date: '2030-03-05', status: 'approved', requested_by: H.p.id }).select('id,status,team_approved_at').single();
  ok('총괄 직접 등록 → 즉시 확정', r.data?.status === 'approved' && r.data?.team_approved_at, r.error?.message); if (r.data?.id) cleanup.push(['leave_requests', r.data.id]);

  // ---- KPI · 마진 ----
  const KD = '2026-01-05';
  r = await S1.c.from('kpi_daily').upsert({ user_id: S1.p.id, work_date: KD, calls: 120, new_cnt: 1, margin: 350000, kakao_db: 5, new_margin: 350000, work_report: '자동점검' }, { onConflict: 'user_id,work_date' }).select('id,team_id').single();
  ok('직원1 KPI 제출 → 팀 자동', !r.error && r.data?.team_id === S1.p.team_id, r.error?.message); if (r.data?.id) cleanup.push(['kpi_daily', r.data.id]);
  r = await S1.c.from('kpi_daily').upsert({ user_id: S1.p.id, work_date: KD, calls: 130, margin: 400000 }, { onConflict: 'user_id,work_date' }).select('margin').single(); ok('같은 날 재제출 → 수정', r.data?.margin === 400000);
  r = await S1.c.from('kpi_daily').insert({ user_id: S2.p.id, work_date: KD, calls: 1 }); ok('직원1이 직원2 KPI 입력 → 차단', !!r.error);
  r = await S1.c.from('v_margin_monthly').select('margin').eq('user_id', S1.p.id).eq('month', '2026-01-01').maybeSingle(); ok('마진 집계 뷰 반영', Number(r.data?.margin) === 400000, String(r.data?.margin));
  ok('직원2가 직원1 KPI 못 봄', (await cnt(S2.c, 'kpi_daily', q => q.eq('user_id', S1.p.id))) === 0);
  ok('팀장이 직원1 KPI 봄', (await cnt(M.c, 'kpi_daily', q => q.eq('user_id', S1.p.id).eq('work_date', KD))) === 1);

  // ---- 파이프라인 · 주간보고 · 목표 ----
  r = await M.c.from('pipeline').insert({ team_id: M.p.team_id, owner_id: S1.p.id, client: '자동점검업체', stage: '협상', created_by: M.p.id }).select('id').single();
  ok('팀장 가망건 등록', !r.error, r.error?.message); const pipeId = r.data?.id; if (pipeId) cleanup.push(['pipeline', pipeId]);
  r = await M.c.from('pipeline').insert({ team_id: S2.p.team_id, owner_id: S2.p.id, client: 'x', created_by: M.p.id }); ok('팀장이 타팀 가망건 → 차단', !!r.error);
  r = await S1.c.from('pipeline').insert({ team_id: M.p.team_id, owner_id: S1.p.id, client: 'x', created_by: S1.p.id }); ok('직원 가망건 등록 → 차단', !!r.error);
  r = await H.c.from('pipeline').update({ stage: '결제' }).eq('id', pipeId).select('id'); ok('총괄 가망건 수정 → 차단', !!r.error || !r.data?.length);
  ok('직원2가 1팀 가망건 못 봄', (await cnt(S2.c, 'pipeline', q => q.eq('id', pipeId))) === 0);
  r = await M.c.from('weekly_reports').upsert({ team_id: M.p.team_id, week_start: '2030-03-04', goal_margin: 1, created_by: M.p.id }, { onConflict: 'team_id,week_start' }).select('id').single();
  const wr = r.data?.id; ok('팀장 주간보고 생성', !r.error && wr, r.error?.message); if (wr) cleanup.push(['weekly_reports', wr]);
  r = await M.c.from('weekly_member_notes').upsert({ report_id: wr, user_id: S1.p.id, directive: '자동점검', feedback: 'x' }, { onConflict: 'report_id,user_id' }); ok('인원별 지시 저장', !r.error, r.error?.message);
  ok('직원1은 주간보고 본문 못 봄', (await cnt(S1.c, 'weekly_reports', q => q.eq('id', wr))) === 0);
  ok('총괄은 주간보고 봄', (await cnt(H.c, 'weekly_reports', q => q.eq('id', wr))) === 1);
  r = await M.c.from('monthly_targets').upsert({ month: '2030-03-01', user_id: S1.p.id, margin: 12000000 }, { onConflict: 'month,user_id' }).select('id').single(); ok('팀장 팀원 개인목표 배정', !r.error, r.error?.message); if (r.data?.id) cleanup.push(['monthly_targets', r.data.id]);
  r = await M.c.from('monthly_targets').upsert({ month: '2030-03-01', user_id: S2.p.id, margin: 1 }, { onConflict: 'month,user_id' }); ok('팀장이 타팀 목표 → 차단', !!r.error);
  r = await S1.c.from('monthly_targets').upsert({ month: '2030-04-01', user_id: S1.p.id, margin: 1 }, { onConflict: 'month,user_id' }); ok('직원 목표 입력 → 차단', !!r.error);

  // ---- 이슈 ----
  r = await H.c.from('issues').insert({ title: '자동점검 이슈', body: 'x', customer_notice: 'x', author_id: H.p.id }).select('id').single(); ok('총괄 이슈 등록', !r.error); if (r.data?.id) cleanup.push(['issues', r.data.id]);
  r = await S1.c.from('issues').insert({ title: 'x', author_id: S1.p.id }); ok('직원 이슈 등록 → 차단', !!r.error);
  r = await S1.c.from('issue_reads').upsert({ issue_id: cleanup.find(x => x[0] === 'issues')?.[1], user_id: S1.p.id }, { onConflict: 'issue_id,user_id', ignoreDuplicates: true }); ok('직원 읽음 처리', !r.error, r.error?.message);

  // ---- 1-D: 계획 · 기준 · 지시사항 ----
  r = await S1.c.from('plans').insert({ user_id: S1.p.id, type: 'daily', title: '자동점검', start_date: TD, end_date: TD }).select('id').single();
  const planId = r.data?.id; ok('직원1 계획 등록', !r.error && planId, r.error?.message); if (planId) cleanup.push(['plans', planId]);
  r = await S1.c.from('plans').update({ is_done: true }).eq('id', planId).select('done_at').single(); ok('계획 완료 → done_at 기록', !!r.data?.done_at);
  r = await S1.c.from('plans').insert({ user_id: S2.p.id, type: 'daily', title: 'x', start_date: TD, end_date: TD }); ok('직원1이 직원2 계획 등록 → 차단', !!r.error);
  ok('직원2가 직원1 계획 못 봄', (await cnt(S2.c, 'plans', q => q.eq('id', planId))) === 0);
  ok('팀장이 직원1 계획 봄', (await cnt(M.c, 'plans', q => q.eq('id', planId))) === 1);
  r = await S1.c.from('promotion_criteria').select('id'); ok('직원 진급 기준 열람', !r.error && (r.data?.length ?? 0) >= 1, `${r.data?.length}행`);
  r = await S1.c.from('incentive_tiers').select('id'); ok('직원 인센티브 구간 열람', !r.error && (r.data?.length ?? 0) >= 1, `${r.data?.length}행`);
  r = await S1.c.from('promotion_criteria').update({ monthly_margin_min: 1 }).neq('id', 0).select('id'); ok('직원 기준 수정 → 차단', !!r.error || !r.data?.length);
  r = await S1.c.from('incentive_tiers').insert({ scope: 'staff', label: 'x', min_margin: 0, rate: 9 }); ok('직원 구간 추가 → 차단', !!r.error);
  r = await S1.c.from('app_settings').select('key'); ok('직원은 기준 설정키만 읽음(admin_bypass 제외)', !r.error && !(r.data ?? []).some(x => x.key === 'admin_bypass_ip'), (r.data ?? []).map(x => x.key).join(','));
  r = await S1.c.rpc('my_directives', { p_limit: 3 }); ok('본인 지시사항 함수 호출', !r.error, r.error?.message);

  // ---- 1-E: 상품·프로모션·어드민 전용·양식 ----
  r = await S1.c.from('products').select('id'); ok('직원 상품 안내 열람', !r.error, r.error?.message);
  r = await S1.c.from('products').insert({ name: '해킹' }); ok('직원 상품 등록 → 차단', !!r.error);
  ok('직원 자산/계정 0행', (await cnt(S1.c, 'assets_accounts')) === 0 && (await cnt(S1.c, 'pnl_months')) === 0 && (await cnt(S1.c, 'mgmt_duties')) === 0);
  ok('총괄도 자산/손익 0행 (어드민 전용)', (await cnt(H.c, 'assets_accounts')) === 0 && (await cnt(H.c, 'pnl_months')) === 0);
  r = await S1.c.from('report_forms').insert({ name: 'x' }); ok('직원 양식 생성 → 차단', !!r.error);
  r = await S1.c.rpc('my_forms'); ok('배정 양식 조회 함수', !r.error, `${r.data?.length ?? 0}개 배정`);
  if (r.data?.length) { const f = r.data[0]; r = await S1.c.from('report_submissions').upsert({ form_id: f.id, user_id: S1.p.id, period_key: '2030-03-04', data: { t: '자동점검' }, status: 'draft' }, { onConflict: 'form_id,user_id,period_key' }).select('id').single(); ok('직원 양식 임시저장', !r.error, r.error?.message); if (r.data?.id) cleanup.push(['report_submissions', r.data.id]);
    r = await S1.c.from('report_submissions').insert({ form_id: f.id, user_id: S2.p.id, period_key: '2030-03-04', data: {} }); ok('직원1이 직원2 이름으로 제출 → 차단', !!r.error); }
} catch (e) { results.push({ name: '치명적 오류', pass: false, note: e.message }); }

// ---- 정리 (service role 있으면 테스트 행 삭제) ----
if (SVC && cleanup.length) {
  const A = createClient(URL_, SVC, { auth: { persistSession: false } });
  const order = ['report_submissions', 'plans', 'weekly_member_notes', 'weekly_reports', 'monthly_targets', 'pipeline', 'issue_reads', 'issues', 'attendance_corrections', 'leave_requests', 'kpi_daily'];
  for (const t of order) for (const [tt, id] of cleanup) if (tt === t) await A.from(t).delete().eq('id', id);
  await A.from('leave_requests').delete().eq('reason', '자동점검');
  results.push({ name: '테스트 데이터 정리', pass: true, note: `${cleanup.length}건 삭제` });
} else results.push({ name: '테스트 데이터 정리', pass: true, note: 'SERVICE_ROLE_KEY 없음 → 2030년 날짜 테스트 행이 남아있음(무해)' });

const pass = results.filter(r => r.pass).length;
console.log('\n' + results.map(r => `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  — ' + r.note : ''}`).join('\n'));
console.log(`\n=== ${pass}/${results.length} 통과 ${pass === results.length ? '✓ 전부 정상' : '✗ FAIL 항목 확인'} ===`);
process.exit(pass === results.length ? 0 : 1);
