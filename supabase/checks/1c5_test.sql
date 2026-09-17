\set mgr1  '00000000-0000-0000-0000-000000000003'
\set st1   '00000000-0000-0000-0000-000000000004'
\echo '--- upsert ON CONFLICT (month,user_id) 두 번 → 두 번째는 갱신 (행 1개)'
set role authenticated; set request.jwt.claim.sub=:'mgr1';
insert into monthly_targets(month,user_id,margin) values ('2030-05-01',:'st1',100) on conflict (month,user_id) do update set margin=excluded.margin;
insert into monthly_targets(month,user_id,margin) values ('2030-05-01',:'st1',200) on conflict (month,user_id) do update set margin=excluded.margin;
select count(*) as rows_should_be_1, max(margin) as margin_200 from monthly_targets where month='2030-05-01' and user_id=:'st1';
reset role; reset request.jwt.claim.sub;
\echo '--- 팀 목표 행 2개(다른 팀) 충돌 없음'
insert into monthly_targets(month,team_id,margin) values ('2030-05-01',1,1),('2030-05-01',2,1) on conflict (month,team_id) do update set margin=excluded.margin;
select count(*) as team_rows_2 from monthly_targets where month='2030-05-01' and team_id is not null;
