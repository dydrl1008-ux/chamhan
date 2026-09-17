\set admin '00000000-0000-0000-0000-000000000001'
\set head  '00000000-0000-0000-0000-000000000002'
\set mgr1  '00000000-0000-0000-0000-000000000003'
\set st1   '00000000-0000-0000-0000-000000000004'
\set st2   '00000000-0000-0000-0000-000000000005'
\echo '--- [A] 직원1 KPI 제출 → team_id 자동(1)'
set role authenticated; set request.jwt.claim.sub=:'st1';
insert into kpi_daily(user_id,work_date,calls,new_cnt,margin,kakao_db,overtime,new_margin,work_report) values (:'st1','2026-09-15',120,1,350000,5,false,350000,'테스트') returning team_id, margin;
insert into kpi_daily(user_id,work_date,calls,margin) values (:'st1','2026-09-16',100,-50000) returning margin;
\echo '--- [A2] 같은 날 다시 insert → unique 에러 (앱은 upsert 사용)'
insert into kpi_daily(user_id,work_date,calls) values (:'st1','2026-09-15',1);
\echo '--- [A3] 직원1 본인 건 수정 가능'
update kpi_daily set calls=130 where user_id=:'st1' and work_date='2026-09-15' returning calls;
\echo '--- [B] 직원1이 직원2 KPI 입력 → 에러'
insert into kpi_daily(user_id,work_date,calls) values (:'st2','2026-09-15',1);
\echo '--- [C] 직원2: 직원1 KPI 안 보임(0), 월 집계 뷰도 0행'
set request.jwt.claim.sub=:'st2'; select count(*) from kpi_daily; select count(*) from v_margin_monthly;
\echo '--- [D] 1팀장: KPI 2행 보임, 월 집계 마진 300000'
set request.jwt.claim.sub=:'mgr1'; select count(*) from kpi_daily; select margin, new_margin, days from v_margin_monthly where user_id=:'st1';
\echo '--- [D2] 1팀장 파이프라인 등록 → ok / 2팀(team 2) 등록 → 에러'
insert into pipeline(team_id,owner_id,client,stage,expected_margin,created_by) values (1,:'st1','테스트업체','협상','10슬롯',:'mgr1') returning id, stage;
insert into pipeline(team_id,owner_id,client,created_by) values (2,:'st2','남의팀',:'mgr1');
\echo '--- [D3] 1팀장 주간보고 생성(월요일) → ok / 화요일 → check 에러'
insert into weekly_reports(team_id,week_start,goal_margin,created_by) values (1,'2026-09-14',20000000,:'mgr1') returning id, status;
insert into weekly_reports(team_id,week_start,created_by) values (1,'2026-09-15',:'mgr1');
\echo '--- [D4] 인원별 지시 저장 → ok'
insert into weekly_member_notes(report_id,user_id,directive,feedback) select id, :'st1', '지시', '피드백' from weekly_reports where team_id=1 returning user_id is not null as ok;
\echo '--- [E] 직원1: 주간보고 본문 안 보임(0), 본인 지시사항은 보임(1)'
set request.jwt.claim.sub=:'st1'; select count(*) from weekly_reports; select directive from weekly_member_notes;
\echo '--- [E2] 직원1이 파이프라인 등록 → 에러 / 조회는 팀 것 보임(1)'
insert into pipeline(team_id,owner_id,client,created_by) values (1,:'st1','x',:'st1');
select count(*) from pipeline;
\echo '--- [F] 직원2: 1팀 파이프라인·주간보고 0행'
set request.jwt.claim.sub=:'st2'; select count(*) from pipeline; select count(*) from weekly_reports; select count(*) from weekly_member_notes;
\echo '--- [G] 총괄: 전부 보임, 파이프라인 쓰기는 불가'
set request.jwt.claim.sub=:'head'; select count(*) as wr from weekly_reports; select count(*) as pipe from pipeline;
update pipeline set stage='결제' where id=1 returning stage;
\echo '--- [H] 어드민 월 목표 등록 → ok / 직원이 목표 등록 → 에러 / 직원은 본인 목표만 조회'
set request.jwt.claim.sub=:'admin';
insert into monthly_targets(month,user_id,margin) values ('2026-09-01',:'st1',15000000),('2026-09-01',:'st2',15000000) returning margin;
insert into monthly_targets(month,team_id,margin) values ('2026-09-01',1,60000000) returning margin;
set request.jwt.claim.sub=:'st1'; insert into monthly_targets(month,user_id,margin) values ('2026-10-01',:'st1',1);
select count(*) as my_targets from monthly_targets;
reset role; reset request.jwt.claim.sub;
