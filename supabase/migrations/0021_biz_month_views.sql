-- 회사 월(21일~20일, 마감 달 라벨) 기준으로 월 집계 뷰 전환. 연차 잔여(v_leave_yearly)는 달력 연도 유지
create or replace function biz_month(d date) returns date language sql immutable as
$$ select case when extract(day from d) >= 21 then (date_trunc('month', d) + interval '1 month')::date else date_trunc('month', d)::date end $$;

create or replace view v_margin_monthly with (security_invoker = on) as
select user_id, team_id, biz_month(work_date) as month,
       sum(margin) as margin, sum(new_margin) as new_margin, sum(new_cnt) as new_cnt,
       sum(calls) as calls, sum(kakao_db) as kakao_db, count(*) filter (where overtime) as overtime_days, count(*) as days
from kpi_daily group by 1,2,3;

create or replace view v_leave_monthly with (security_invoker = on) as
select user_id, biz_month(start_date) as month,
       count(*) filter (where type='late')   as late_cnt,
       count(*) filter (where type='absent') as absent_cnt,
       count(*) filter (where type='sick')   as sick_cnt,
       count(*) filter (where type='annual') as annual_cnt,
       count(*) filter (where type in ('half_am','half_pm')) as half_cnt,
       count(*) filter (where type='monthly') as monthly_cnt,
       coalesce(sum(days) filter (where type in ('annual','half_am','half_pm')),0) as annual_used,
       coalesce(sum(days) filter (where type='monthly'),0) as monthly_used
from leave_requests where status='approved' group by 1,2;

create or replace view v_plan_rate with (security_invoker = on) as
select user_id, type, biz_month(start_date) as month,
       count(*) as total, count(*) filter (where is_done) as done
from plans where is_active group by 1,2,3;
