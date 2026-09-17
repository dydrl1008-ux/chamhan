\set admin '00000000-0000-0000-0000-000000000001'
\set head  '00000000-0000-0000-0000-000000000002'
\set mgr1  '00000000-0000-0000-0000-000000000003'
\set st1   '00000000-0000-0000-0000-000000000004'
\set st2   '00000000-0000-0000-0000-000000000005'
\echo '--- [A] 직원1 계획 등록(일/주/월) → ok, 완료 토글 → done_at 채움'
set role authenticated; set request.jwt.claim.sub=:'st1';
insert into plans(user_id,type,title,start_date,end_date) values (:'st1','daily','콜 30','2026-09-16','2026-09-16'),(:'st1','weekly','미팅 5건','2026-09-14','2026-09-20'),(:'st1','monthly','9월 900만','2026-09-01','2026-09-30') returning type;
update plans set is_done=true where user_id=:'st1' and type='daily' returning done_at is not null as done;
\echo '--- [A2] 직원1이 직원2 계획 등록 → 차단'
insert into plans(user_id,type,title,start_date,end_date) values (:'st2','daily','x','2026-09-16','2026-09-16');
\echo '--- [A3] 달성률 뷰: daily 1/1'
select type, total, done from v_plan_rate where user_id=:'st1' order by type;
\echo '--- [B] 직원2: 직원1 계획 0행 / 팀장: 3행 / 총괄: 3행'
set request.jwt.claim.sub=:'st2'; select count(*) from plans where user_id=:'st1';
set request.jwt.claim.sub=:'mgr1'; select count(*) from plans where user_id=:'st1';
set request.jwt.claim.sub=:'head'; select count(*) from plans where user_id=:'st1';
\echo '--- [C] 직원: 기준·구간 읽기 ok, 수정 → 차단'
set request.jwt.claim.sub=:'st1'; select count(*) as criteria from promotion_criteria; select count(*) as tiers from incentive_tiers;
update promotion_criteria set monthly_margin_min=1 where from_position='사원' returning id;
insert into incentive_tiers(scope,label,min_margin,rate) values ('staff','해킹',0,9);
\echo '--- [C2] 직원: 설정 중 기준 키만 읽힘 (4행), admin_bypass_ip 안 읽힘'
select key from app_settings order by key;
\echo '--- [D] 어드민 기준 수정 → ok'
set request.jwt.claim.sub=:'admin';
update promotion_criteria set monthly_margin_min=6000000 where from_position='사원' returning monthly_margin_min;
\echo '--- [E] 본인 지시사항 함수: 제출된 주간보고의 본인 노트만'
reset role; reset request.jwt.claim.sub;
insert into weekly_reports(team_id,week_start,status,created_by,common_directive) values (1,'2026-09-07','submitted',:'mgr1','공통') on conflict (team_id,week_start) do update set status='submitted', common_directive='공통';
insert into weekly_member_notes(report_id,user_id,directive,feedback) select id,:'st1','직원1 지시','굿' from weekly_reports where team_id=1 and week_start='2026-09-07' on conflict (report_id,user_id) do update set directive='직원1 지시';
insert into weekly_member_notes(report_id,user_id,directive) select id,:'st2','직원2 지시' from weekly_reports where team_id=1 and week_start='2026-09-07' on conflict do nothing;
set role authenticated; set request.jwt.claim.sub=:'st1';
select week_start, common_directive, directive from my_directives();
set request.jwt.claim.sub=:'st2'; select directive from my_directives();
reset role; reset request.jwt.claim.sub;
