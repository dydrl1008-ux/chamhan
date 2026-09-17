-- 1-B 역할별 시나리오. uuid 5개는 1a_rls_test 와 동일 계정 사용.
\set admin '00000000-0000-0000-0000-000000000001'
\set head  '00000000-0000-0000-0000-000000000002'
\set mgr1  '00000000-0000-0000-0000-000000000003'
\set st1   '00000000-0000-0000-0000-000000000004'
\set st2   '00000000-0000-0000-0000-000000000005'
update profiles set annual_leave_granted=3 where id in (:'st1',:'st2');

\echo '--- [A] 직원1 출근 10:07 → is_late true'
set role authenticated; set request.jwt.claim.sub=:'st1';
select check_in, is_late from attendance_check('in','10:07','211.205.68.33','test');
\echo '--- [A1] 이상한 IP 문자열로 퇴근 시도(출근 전) → 출근기록 없음 에러 / 이상한 IP 자체는 에러 아님'
select safe_inet('unknown') is null as bad_ip_null, safe_inet('211.205.68.33') as good_ip;
\echo '--- [A2] 같은 날 출근 다시 호출 → 기존 시각 유지(10:07)'
select check_in from attendance_check('in','09:00','211.205.68.33','test');
\echo '--- [A3] 퇴근'
select check_out from attendance_check('out','18:30','211.205.68.33','test');
\echo '--- [B] 직원1이 직원2 출근을 대신 insert → 0행/에러여야'
insert into attendance(user_id,work_date,check_in) values (:'st2', current_date, '09:00');
\echo '--- [C] 직원1 연차 2일 신청 → pending, days 2'
insert into leave_requests(user_id,type,start_date,end_date,reason,requested_by) values (:'st1','annual',current_date+7,current_date+8,'개인',:'st1') returning status, days;
\echo '--- [C2] 직원1 연차 2일 추가 신청 (부여 3, 대기 2 선점) → 잔여 부족 에러여야'
insert into leave_requests(user_id,type,start_date,end_date,reason,requested_by) values (:'st1','annual',current_date+20,current_date+21,'개인',:'st1');
\echo '--- [C3] 직원이 지각/결근 직접 등록 → 에러여야'
insert into leave_requests(user_id,type,start_date,end_date,requested_by) values (:'st1','late',current_date,current_date,:'st1');
\echo '--- [C4] 직원이 본인 건을 approved 로 바꾸기 → 0행이어야'
update leave_requests set status='approved' where user_id=:'st1' returning status;
\echo '--- [D] 직원2가 직원1 근태 조회 → 0행'
set request.jwt.claim.sub=:'st2'; select count(*) from leave_requests; select count(*) from attendance;
\echo '--- [E] 1팀장: 직원1 근태 보임(1), 승인 가능'
set request.jwt.claim.sub=:'mgr1'; select count(*) from leave_requests;
update leave_requests set status='approved', decided_by=:'mgr1', decided_at=now() where user_id=:'st1' and type='annual' returning status;
\echo '--- [E2] 1팀장이 2팀 직원 무단결근 등록 → 에러여야 (팀 다름)'
insert into leave_requests(user_id,type,start_date,end_date,requested_by) values (:'st2','absent',current_date,current_date,:'mgr1');
\echo '--- [F] 총괄: 전체 조회, 이슈 등록 가능'
set request.jwt.claim.sub=:'head'; select count(*) as leaves_all from leave_requests; select count(*) as att_all from attendance;
insert into issues(title,body,customer_notice,author_id) values ('테스트 이슈','내부','고객 안내',:'head') returning id;
\echo '--- [F2] 직원이 이슈 등록 → 에러여야, 읽기는 가능'
set request.jwt.claim.sub=:'st1'; insert into issues(title,author_id) values ('직원이 씀',:'st1');
select count(*) from issues; insert into issue_reads(issue_id,user_id) select id, :'st1' from issues limit 1;
\echo '--- [F3] 읽음 중복 insert (on conflict do nothing) → 에러 없이 0행'
insert into issue_reads(issue_id,user_id) select id, :'st1' from issues limit 1 on conflict do nothing;
select count(*) as my_reads from issue_reads;
\echo '--- [G] 직원이 generate_late_requests 호출 → admin only 에러여야'
select generate_late_requests(current_date);
reset role; reset request.jwt.claim.sub;
\echo '--- [G2] cron 컨텍스트에서 실행 → 1건 생성(직원1 지각)'
select generate_late_requests(current_date);
select user_id, type, status, reason, source from leave_requests where source='auto_late';
\echo '--- [G3] 다시 실행 → 0건 (중복 방지)'
select generate_late_requests(current_date);
\echo '--- [H] 뷰: 직원1 월 집계 (annual_used 2)'
set role authenticated; set request.jwt.claim.sub=:'st1';
select month, annual_used, late_cnt from v_leave_monthly;
reset role;
