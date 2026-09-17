\set mgr1  '00000000-0000-0000-0000-000000000003'
\set st1   '00000000-0000-0000-0000-000000000004'
\set st2   '00000000-0000-0000-0000-000000000005'
\echo '--- 팀장: 팀원 개인 목표 upsert → ok / 타팀 직원 → 에러 / 팀 목표 → 에러'
set role authenticated; set request.jwt.claim.sub=:'mgr1';
insert into monthly_targets(month,user_id,margin) values ('2026-10-01',:'st1',12000000) on conflict (month,user_id) where user_id is not null do update set margin=excluded.margin returning margin;
insert into monthly_targets(month,user_id,margin) values ('2026-10-01',:'st2',1);
insert into monthly_targets(month,team_id,margin) values ('2026-10-01',1,1);
\echo '--- 직원1: 본인 목표 조회 1행'
set request.jwt.claim.sub=:'st1'; select margin from monthly_targets where month='2026-10-01';
reset role; reset request.jwt.claim.sub;
