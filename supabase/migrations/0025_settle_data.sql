-- 정산 사이트 보조 데이터: 고객 마스터(자동완성·고객별 집계용) — GitHub Actions 동기화 시 함께 갱신
create table if not exists settlement_customers (
  biz_no text primary key, cust_name text, emp_id text, owner_name text, cust_tel text, mileage bigint default 0,
  incentive_rate numeric(6,3), biz_type text, use_ind text, reg_date date, synced_at timestamptz not null default now());
alter table settlement_customers enable row level security;
drop policy if exists sc_read on settlement_customers;
create policy sc_read on settlement_customers for select using (is_admin() or my_role() in ('head','manager') or is_mgmt());
-- 고객별 회사월 마진 집계 (승인완료, 숨김 제외)
create or replace function settlement_customer_month_sums(p_month text)
returns table(cust_name text, empl_id text, empl_name text, cnt bigint, sum_profit bigint)
language sql stable as $$
  select s.raw->>'custName', s.empl_id, max(s.raw->>'empName'), count(*), sum(s.profit)::bigint
  from settlement_items s
  where s.status = coalesce((select value::jsonb->>'status_ok' from app_settings where key='settle_field_map'),'승인완료')
    and to_char(case when extract(day from s.req_date) >= 21 then date_trunc('month', s.req_date) + interval '1 month' else date_trunc('month', s.req_date) end, 'YYYY-MM') = p_month
    and not exists (select 1 from settlement_empl_map m where m.empl_id = s.empl_id and m.hidden)
  group by 1,2 order by 5 desc $$;
