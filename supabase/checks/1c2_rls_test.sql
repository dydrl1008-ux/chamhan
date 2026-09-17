\set head  '00000000-0000-0000-0000-000000000002'
\set mgr1  '00000000-0000-0000-0000-000000000003'
\set st1   '00000000-0000-0000-0000-000000000004'
\echo '--- [A] 직원1: 현재 KST -30분 시각으로 출근 → 에러여야'
set role authenticated; set request.jwt.claim.sub=:'st1';
select attendance_check('in', ((now() at time zone 'Asia/Seoul')::time - interval '30 minutes')::time, '1.1.1.1','t');
\echo '--- [A2] 현재 시각으로 출근 → ok'
select check_in is not null as ok from attendance_check('in', (now() at time zone 'Asia/Seoul')::time, '1.1.1.1','t');
\echo '--- [A3] +30분 미래 퇴근 → 에러여야'
select attendance_check('out', ((now() at time zone 'Asia/Seoul')::time + interval '30 minutes')::time, '1.1.1.1','t');
\echo '--- [B] 직원1 수정 요청(출근 09:00) → pending, old_time = 현재 기록'
select status, old_time is not null as has_old from request_correction((select id from attendance where user_id=:'st1' order by work_date desc limit 1),'check_in','09:00','실수로 늦게 누름');
\echo '--- [B2] 같은 건 중복 요청 → unique 에러'
select id from request_correction((select id from attendance where user_id=:'st1' order by work_date desc limit 1),'check_in','09:05','중복');
\echo '--- [B3] 직원이 직접 승인 시도 → 에러'
select decide_correction((select max(id) from attendance_corrections),'approved');
\echo '--- [C] 팀장이 승인 시도 → 에러 (총괄만)'
set request.jwt.claim.sub=:'mgr1';
select decide_correction((select max(id) from attendance_corrections),'approved');
\echo '--- [D] 총괄 승인 → attendance.check_in = 09:00, is_late 재판정 false'
set request.jwt.claim.sub=:'head';
select status from decide_correction((select max(id) from attendance_corrections),'approved');
select check_in, is_late from attendance where user_id=:'st1' order by work_date desc limit 1;
\echo '--- [D2] 재승인 시도 → 이미 처리 에러'
select decide_correction((select max(id) from attendance_corrections),'approved');
\echo '--- [E] 지각 건: 팀장 팀승인 시도 → 에러 / 총괄 직접 승인 → approved'
reset role; reset request.jwt.claim.sub;
insert into leave_requests(user_id,type,start_date,end_date,reason,source) values (:'st1','late','2026-09-10','2026-09-10','출근 09:50','auto_late');
set role authenticated; set request.jwt.claim.sub=:'mgr1';
update leave_requests set team_approved_at=now() where user_id=:'st1' and type='late';
set request.jwt.claim.sub=:'head';
update leave_requests set status='approved' where user_id=:'st1' and type='late' returning status;
reset role; reset request.jwt.claim.sub;
