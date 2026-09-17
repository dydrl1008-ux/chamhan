select '1.RLS 꺼진 테이블' as check, count(*)::text as result, '0' as expect
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
union all
select '2.security_invoker 없는 뷰', count(*)::text, '0'
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'
  and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=on%' and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=true%'
union all select '3.pnl 카테고리', count(*)::text, '9' from pnl_categories
union all select '4.어드민 전용 테이블 정책(1개씩)', count(*)::text, '8' from pg_policies where schemaname='public' and tablename in ('mgmt_duties','pnl_categories','pnl_months','pnl_items','assets_businesses','assets_phones','assets_accounts','asset_access_logs') and policyname like '%admin%'
order by 1;
