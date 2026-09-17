select '1.RLS 꺼진 테이블' as check, count(*)::text as result, '0' as expect
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
union all
select '2.security_invoker 없는 뷰', count(*)::text, '0'
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'
  and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=on%' and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=true%'
union all
select '3.정책 '||tablename, count(*)::text, case tablename when 'kpi_daily' then '3' else '2' end
from pg_policies where schemaname='public' and tablename in ('kpi_daily','monthly_targets','pipeline','weekly_reports','weekly_member_notes') group by tablename
union all
select '4.뷰 존재', count(*)::text, '2' from pg_views where schemaname='public' and viewname in ('v_margin_monthly','v_margin_weekly')
order by 1;
