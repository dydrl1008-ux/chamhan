\set head '00000000-0000-0000-0000-000000000002'
\set st1  '00000000-0000-0000-0000-000000000004'
\set admin '00000000-0000-0000-0000-000000000001'
\echo '--- 총괄: 직원 직급 수정 ok / 어드민 행 수정 → 0행 / 직원을 admin 승격 → 차단'
set role authenticated; set request.jwt.claim.sub=:'head';
update profiles set position='주임' where id=:'st1' returning position;
update profiles set position='해킹' where id=:'admin' returning id;
update profiles set role='admin' where id=:'st1' returning role;
\echo '--- 총괄: admin_upsert_profile 로 admin 생성 → 차단'
select admin_upsert_profile(gen_random_uuid(),'x','x@x','admin',null,false,null,null,0);
reset role; reset request.jwt.claim.sub;
