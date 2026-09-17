\set admin '00000000-0000-0000-0000-000000000001'
\set head  '00000000-0000-0000-0000-000000000002'
\set mgr1  '00000000-0000-0000-0000-000000000003'
\set st1   '00000000-0000-0000-0000-000000000004'
\set st2   '00000000-0000-0000-0000-000000000005'
\echo '--- [A] 어드민: 상품·프로모션·업무·손익·자산 등록 ok'
set role authenticated; set request.jwt.claim.sub=:'admin';
insert into products(name,category,unit_price) values ('카페 대량배포','카페배포','건당 견적') returning id;
insert into promotions(title,body,starts_at,ends_at) values ('9월 프로모션','20% 할인','2026-09-01','2026-09-30') returning id;
insert into mgmt_duties(owner_id,title,cycle) values (:'st2','배포 리포트','매일') returning id;
insert into pnl_months(month,operating_profit) values ('2026-08-01',105222875) returning month;
insert into pnl_items(month,category_id,amount) select '2026-08-01', id, 1000000 from pnl_categories where name in ('급여','임차료');
select operating_profit, total_cost, net_profit from v_pnl_summary;
insert into assets_businesses(name) values ('유노애드') returning id;
insert into assets_accounts(service,login_id,password_enc,business_id) values ('Vercel','goat','ENC:xxx',1) returning id;
\echo '--- [B] 직원: 상품·프로모션 읽기 ok(1,1) / 업무·손익·자산·로그 0행 / 쓰기 차단'
set request.jwt.claim.sub=:'st1';
select (select count(*) from products) as products, (select count(*) from promotions) as promos, (select count(*) from mgmt_duties) as duties, (select count(*) from pnl_months) as pnl, (select count(*) from assets_accounts) as accounts, (select count(*) from v_pnl_summary) as pnl_view;
insert into products(name) values ('해킹');
\echo '--- [B2] 총괄도 손익·자산 0행 (어드민 전용)'
set request.jwt.claim.sub=:'head'; select (select count(*) from pnl_months) as pnl, (select count(*) from assets_accounts) as accounts, (select count(*) from mgmt_duties) as duties;
\echo '--- [C] 양식: 어드민 생성 + 1팀 배정 + 관리팀 배정'
set request.jwt.claim.sub=:'admin';
insert into report_forms(name,period,created_by) values ('1팀 일일보고서','daily',:'admin'),('관리팀 월간보고','monthly',:'admin') returning id, name;
insert into report_form_fields(form_id,key,label,type,sort_order) values (1,'calls','콜 수','number',1),(1,'auto_margin_today','금일 마진','auto_margin_today',2),(1,'memo','특이사항','textarea',3);
insert into report_form_assignments(form_id,team_id) values (1,1);
insert into report_form_assignments(form_id,only_mgmt) values (2,true);
update profiles set is_mgmt=true where id=:'st2';
\echo '--- [C2] 직원1(1팀): my_forms = 1팀 일일보고서 / 직원2(2팀,관리팀): 관리팀 월간보고'
set request.jwt.claim.sub=:'st1'; select name from my_forms();
set request.jwt.claim.sub=:'st2'; select name from my_forms();
\echo '--- [D] 직원1 제출 → ok, 직원2 이름으로 제출 → 차단, 직원2가 직원1 제출물 0행, 팀장 1행, 총괄 1행'
set request.jwt.claim.sub=:'st1';
insert into report_submissions(form_id,user_id,period_key,data,status) values (1,:'st1','2026-09-17','{"calls":30}','submitted') returning id;
insert into report_submissions(form_id,user_id,period_key,data) values (1,:'st2','2026-09-17','{}');
set request.jwt.claim.sub=:'st2'; select count(*) from report_submissions;
set request.jwt.claim.sub=:'mgr1'; select count(*) from report_submissions;
set request.jwt.claim.sub=:'head'; select count(*) from report_submissions;
\echo '--- [E] 직원이 양식 생성 → 차단'
set request.jwt.claim.sub=:'st1'; insert into report_forms(name,created_by) values ('x',:'st1');
reset role; reset request.jwt.claim.sub;
