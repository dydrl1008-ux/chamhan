-- 정산 담당자별 회사월(21~20) 집계 — 1000행 제한 회피, RLS 는 호출자 기준(security invoker)
create or replace function settlement_month_sums()
returns table(empl_id text, name text, biz_month text, sum_profit bigint)
language sql stable as $$
  select s.empl_id,
         max(s.raw->>'empName') as name,
         to_char(case when extract(day from s.req_date) >= 21 then date_trunc('month', s.req_date) + interval '1 month' else date_trunc('month', s.req_date) end, 'YYYY-MM') as biz_month,
         sum(s.profit)::bigint
  from settlement_items s
  where s.status = coalesce((select value::jsonb->>'status_ok' from app_settings where key='settle_field_map'),'승인완료')
  group by 1,3 $$;
create or replace function settlement_empl_ids()
returns table(empl_id text, name text, last_date date)
language sql stable as $$
  select s.empl_id, max(s.raw->>'empName'), max(s.req_date) from settlement_items s where s.empl_id is not null and s.empl_id <> '' group by 1 $$;
