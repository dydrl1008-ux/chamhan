select '1.RLS 꺼진 테이블' as check, count(*)::text as result, '0' as expect
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
union all
select '2.security_invoker 없는 뷰', count(*)::text, '0'
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'
  and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=on%' and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=true%'
union all
select '3.정책 '||tablename, count(*)::text, '2' from pg_policies where schemaname='public' and tablename in ('plans','promotion_criteria','incentive_tiers') group by tablename
union all select '4.진급 기준 행', count(*)::text, '3' from promotion_criteria
union all select '5.인센티브 구간 행', count(*)::text, '10' from incentive_tiers
union all select '6.설정 new_margin_bonus_rate', value, '0.05' from app_settings where key='new_margin_bonus_rate'
order by 1;
