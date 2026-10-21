-- ============================================================================
-- 0045 · 연장 체크·이탈 고객에서 「연장 대상이 아닌 상품」 빼기
--   선입금킵·잔여킵환불·가구매 같은 정산용 항목은 연장할 상품이 아니므로 종료 임박·이탈로 안 셈
--   빼는 규칙: app_settings 'renewal_exclude_regex' (정규식, 상품명에 걸리면 제외) — 바꾸려면 이 값만 수정
-- ============================================================================
insert into app_settings(key, value) values ('renewal_exclude_regex', '킵|환불|선입금|가구매|실배송|회수')
on conflict (key) do nothing;

create or replace function ai_renewal_rows(p_date date default (now() at time zone 'Asia/Seoul')::date, p_days int default 3, p_lost int default 7)
returns table(owner_id uuid, owner text, cust_name text, prod_name text, slots int, date_from date, date_to date, kind text)
language sql stable security definer set search_path = public as $$
  with excl as (
    select coalesce(nullif((select value from app_settings where key = 'renewal_exclude_regex'), ''), '^$') re
  ), map as (
    select p.id user_id, p.name, coalesce(m.empl_id, c.settle_user_id, split_part(p.email, '@', 1)) empl_id
    from profiles p
    left join settlement_empl_map m on m.user_id = p.id
    left join settlement_credentials c on c.user_id = p.id
    where p.is_active
  ), items as (
    select mp.user_id, mp.name, trim(s.raw->>'custName') cust, trim(s.raw->>'prodName') prod,
           (s.raw->>'dateWorkFrom')::date dfrom, (s.raw->>'dateWorkTo')::date dto,
           nullif(s.raw->>'inflowCnt', '')::int inflow
    from settlement_items s join map mp on mp.empl_id = s.empl_id, excl
    where coalesce(s.raw->>'refundInd', '') <> 'Y'
      and s.status in ('승인완료', '승인요청')
      and coalesce(trim(s.raw->>'prodName'), '') !~ excl.re
      and (s.raw->>'dateWorkTo') ~ '^\d{4}-\d{2}-\d{2}' and (s.raw->>'dateWorkFrom') ~ '^\d{4}-\d{2}-\d{2}'
      and (s.raw->>'dateWorkTo')::date >= p_date - 60
  ), latest as (
    select distinct on (user_id, cust, prod) user_id, name, cust, prod, dfrom, dto, inflow,
           count(*) over (partition by user_id, cust, prod) n
    from items order by user_id, cust, prod, dto desc, dfrom desc
  )
  select user_id, name, cust, prod, coalesce(inflow, 0), dfrom, dto,
         case when dto < p_date and dto >= p_date - p_lost then 'churned'
              when dto >= p_date and dto <= p_date + p_days then 'ending'
              when dfrom <= p_date and dfrom > p_date - 7 and n > 1 then 'renewed'
              when dfrom <= p_date and dto >= p_date then 'active'
              else 'other' end
  from latest
  where dto >= p_date - p_lost
  order by name, cust, prod;
$$;
revoke all on function ai_renewal_rows(date, int, int) from public, anon;
grant execute on function ai_renewal_rows(date, int, int) to authenticated, ai_worker;

-- 이미 쌓인 이탈 고객 중 제외 상품은 정리
do $$ begin
  if to_regclass('public.renewal_churn') is not null then
    delete from renewal_churn where status in ('open', 'given_up')
      and prod_name ~ coalesce(nullif((select value from app_settings where key = 'renewal_exclude_regex'), ''), '^$');
  end if;
end $$;
