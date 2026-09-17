-- =============== 1-B 종료 점검 ===============
-- [1] RLS 안 켜진 테이블 → 0행
select c.relname as "RLS_OFF_TABLE" from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
-- [2] security_invoker 없는 뷰 → 0행
select c.relname as "VIEW_WITHOUT_SECURITY_INVOKER" from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v'
  and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=on%'
  and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=true%';
-- [3] 정책 수 (attendance 3, leave_requests 3, issues 2, issue_reads 2)
select tablename, count(*) from pg_policies where schemaname='public' and tablename in ('attendance','leave_requests','issues','issue_reads') group by 1 order by 1;
-- [4] 지각 cron 등록 여부 (pg_cron 켰다면 1행)
select jobname, schedule from cron.job where jobname='generate_late_requests';
-- [5] 지각 판정 기준
select key, value from app_settings where key='late_after';
