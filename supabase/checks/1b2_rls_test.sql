\set admin '00000000-0000-0000-0000-000000000001'
\set head  '00000000-0000-0000-0000-000000000002'
\set mgr1  '00000000-0000-0000-0000-000000000003'
\set st1   '00000000-0000-0000-0000-000000000004'
update profiles set annual_leave_granted=5 where id=:'st1';
\echo '--- 직원1 신청'
set role authenticated; set request.jwt.claim.sub=:'st1';
insert into leave_requests(user_id,type,start_date,end_date,reason,requested_by) values (:'st1','annual','2026-10-01','2026-10-01','x',:'st1') returning id, status;
\echo '--- 팀장이 곧바로 approved 시도 → 에러여야'
set request.jwt.claim.sub=:'mgr1';
update leave_requests set status='approved' where user_id=:'st1' and start_date='2026-10-01';
\echo '--- 팀장 팀승인 → pending 유지 + team_approved_by = 팀장'
update leave_requests set team_approved_at=now() where user_id=:'st1' and start_date='2026-10-01' returning status, team_approved_by=:'mgr1' as by_mgr;
\echo '--- 팀장이 직접 등록(approved 로 넣으려 하면) → 에러여야'
insert into leave_requests(user_id,type,start_date,end_date,status,requested_by) values (:'st1','sick','2026-10-02','2026-10-02','approved',:'mgr1');
\echo '--- 팀장 직접 등록 pending+팀승인 → 성공'
insert into leave_requests(user_id,type,start_date,end_date,status,requested_by,team_approved_at) values (:'st1','sick','2026-10-02','2026-10-02','pending',:'mgr1',now()) returning status;
\echo '--- 총괄 최종 승인 → approved, decided_by=총괄'
set request.jwt.claim.sub=:'head';
update leave_requests set status='approved' where user_id=:'st1' and start_date='2026-10-01' returning status, decided_by=:'head' as by_head;
\echo '--- 총괄 직접 등록 즉시 확정 → approved'
insert into leave_requests(user_id,type,start_date,end_date,status,requested_by) values (:'st1','monthly','2026-10-03','2026-10-03','approved',:'head') returning status;
\echo '--- 직원1 화면: 상태 확인 (approved 1, pending 1(팀승인), approved 1)'
set request.jwt.claim.sub=:'st1';
select start_date, type, status, team_approved_at is not null as team_ok from leave_requests where start_date>='2026-10-01' order by 1;
reset role; reset request.jwt.claim.sub;
