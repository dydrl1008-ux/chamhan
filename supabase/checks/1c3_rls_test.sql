\set admin '00000000-0000-0000-0000-000000000001'
\set head  '00000000-0000-0000-0000-000000000002'
\set mgr1  '00000000-0000-0000-0000-000000000003'
\set st1   '00000000-0000-0000-0000-000000000004'
reset role; update profiles set annual_leave_granted=10 where id=:'st1';
\echo '--- 직원 신청'
set role authenticated; set request.jwt.claim.sub=:'st1';
insert into leave_requests(user_id,type,start_date,end_date,reason,requested_by) values (:'st1','annual','2026-11-02','2026-11-02','x',:'st1') returning id;
\echo '--- 총괄이 팀승인 없이 최종 승인 → 에러여야'
set request.jwt.claim.sub=:'head';
update leave_requests set status='approved' where user_id=:'st1' and start_date='2026-11-02';
\echo '--- 팀장 팀승인 → 팀장 팀승인 취소(null) → 다시 팀승인'
set request.jwt.claim.sub=:'mgr1';
update leave_requests set team_approved_at=now() where user_id=:'st1' and start_date='2026-11-02' returning team_approved_by is not null as by_set;
update leave_requests set team_approved_at=null where user_id=:'st1' and start_date='2026-11-02' returning team_approved_by is null as cleared;
update leave_requests set team_approved_at=now() where user_id=:'st1' and start_date='2026-11-02' returning status;
\echo '--- 총괄 최종 승인 → approved / 승인 취소 → pending(decided 초기화, 팀승인 유지)'
set request.jwt.claim.sub=:'head';
update leave_requests set status='approved' where user_id=:'st1' and start_date='2026-11-02' returning status, decided_by=:'head' as by_head;
update leave_requests set status='pending' where user_id=:'st1' and start_date='2026-11-02' returning status, decided_by is null as cleared, team_approved_at is not null as team_kept;
\echo '--- 반려 → 반려 취소 → pending'
update leave_requests set status='rejected' where user_id=:'st1' and start_date='2026-11-02' returning status;
update leave_requests set status='pending' where user_id=:'st1' and start_date='2026-11-02' returning status;
\echo '--- 총괄 직접 등록(approved) → 팀승인 자동 채움'
insert into leave_requests(user_id,type,start_date,end_date,status,requested_by) values (:'st1','monthly','2026-11-03','2026-11-03','approved',:'head') returning status, team_approved_at is not null as auto_team;
reset role; reset request.jwt.claim.sub;
