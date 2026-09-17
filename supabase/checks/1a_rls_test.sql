-- 역할별 RLS 시나리오 (Supabase SQL Editor에서 실행 가능). 테스트 uuid 5개는 Authentication에서 만든 실제 사용자 id로 바꿔서 사용.
insert into profiles(id,name,email,role,team_id) values
 ('00000000-0000-0000-0000-000000000001','어드민','admin@t.kr','admin',null),
 ('00000000-0000-0000-0000-000000000002','총책임자','head@t.kr','head',null),
 ('00000000-0000-0000-0000-000000000003','1팀장','mgr1@t.kr','manager',1),
 ('00000000-0000-0000-0000-000000000004','1팀직원','staff1@t.kr','staff',1),
 ('00000000-0000-0000-0000-000000000005','2팀직원','staff2@t.kr','staff',2);
\echo '--- 가시성: 기대 admin=5 head=5 manager=2 staff1=1 staff2=1'
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; select 'admin' who, count(*) from profiles;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'; select 'head', count(*) from profiles;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003'; select 'manager', count(*) from profiles;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000004'; select 'staff1', count(*) from profiles;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000005'; select 'staff2', count(*) from profiles;
\echo '--- staff가 allowed_ips/app_settings/audit_logs 조회 → 0행이어야'
select 'ips' t,count(*) from allowed_ips union all select 'settings',count(*) from app_settings union all select 'audit',count(*) from audit_logs;
\echo '--- staff가 본인 role을 admin으로 바꾸기 시도 → 0 rows 업데이트여야'
update profiles set role='admin' where id='00000000-0000-0000-0000-000000000005'; select role from profiles where id='00000000-0000-0000-0000-000000000005';
\echo '--- staff가 admin_upsert_profile 호출 → 에러여야'
select admin_upsert_profile('00000000-0000-0000-0000-000000000005','x','x@x','admin',null,false,null,null,0);
\echo '--- staff가 ip_allowed 호출 → 권한 에러여야'
select ip_allowed('1.1.1.1');
reset role; reset request.jwt.claim.sub;
\echo '--- cron/서비스롤(auth.uid() null)에서 assert_admin → 통과여야'
select assert_admin();
\echo '--- admin이 IP 추가 후 audit_logs 기록 확인'
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into allowed_ips(label,cidr) values ('테스트','10.0.0.0/24');
select table_name, action, after->>'label' from audit_logs order by id desc limit 1;
reset role;
select ip_allowed('10.0.0.7') as should_true, ip_allowed('211.205.68.33') office, ip_allowed('211.205.68.34') neighbor_false;
