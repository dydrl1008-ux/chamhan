\set st1 '00000000-0000-0000-0000-000000000004'
\set st2 '00000000-0000-0000-0000-000000000005'
reset role;
update app_settings set value='{"settle_no":"no","empl_id":"emplId","req_date":"reqDate","profit":"profit","status":"status","status_ok":"승인완료"}' where key='settle_field_map';
insert into settlement_items(settle_no,empl_id,req_date,profit,status,raw) values
 ('S1','staff1','2026-09-10',110000,'승인완료','{}'),('S2','staff1','2026-09-10',-22000,'승인완료','{}'),('S3','staff1','2026-09-10',999999,'대기','{}'),
 ('S4','staff2','2026-09-10',220000,'승인완료','{}'),('S5','unknown_id','2026-09-10',330000,'승인완료','{}') on conflict do nothing;
insert into settlement_empl_map(empl_id,user_id) values ('unknown_id',:'st2') on conflict (empl_id) do update set user_id=excluded.user_id;
\echo '--- 직원1 수동 마진 먼저 입력 50000'
set role authenticated; set request.jwt.claim.sub=:'st1';
insert into kpi_daily(user_id,work_date,margin_manual) values (:'st1','2026-09-10',50000) on conflict (user_id,work_date) do update set margin_manual=excluded.margin_manual;
\echo '--- 직원이 margin_auto 직접 수정 → 차단'
update kpi_daily set margin_auto=9999999 where user_id=:'st1' and work_date='2026-09-10';
\echo '--- 직원이 apply 함수 호출 → 차단'
select apply_settlement_margin('2026-09-01','2026-09-30');
reset role; reset request.jwt.claim.sub;
\echo '--- 서비스롤 apply → 직원1: (110000-22000)/1.1=80000 자동 + 50000 수동 = 130000 / 직원2: (220000+330000)/1.1=500000'
select apply_settlement_margin('2026-09-01','2026-09-30');
select user_id, margin_auto, margin_manual, margin from kpi_daily where work_date='2026-09-10' order by user_id;
\echo '--- 정산 삭제 후 재적용 → 직원1 자동 0, 수동 유지'
delete from settlement_items where empl_id='staff1';
select apply_settlement_margin('2026-09-01','2026-09-30');
select margin_auto, margin_manual, margin from kpi_daily where user_id=:'st1' and work_date='2026-09-10';
