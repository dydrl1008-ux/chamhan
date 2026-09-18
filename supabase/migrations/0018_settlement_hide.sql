-- 정산 담당자 ID 숨김 (퇴사자 등): 표·매핑 목록·KPI 반영에서 제외, 동기화 후에도 유지
alter table settlement_empl_map add column if not exists hidden boolean not null default false;
create or replace function settlement_month_sums()
returns table(empl_id text, name text, biz_month text, sum_profit bigint)
language sql stable as $$
  select s.empl_id, max(s.raw->>'empName'),
         to_char(case when extract(day from s.req_date) >= 21 then date_trunc('month', s.req_date) + interval '1 month' else date_trunc('month', s.req_date) end, 'YYYY-MM'),
         sum(s.profit)::bigint
  from settlement_items s
  where s.status = coalesce((select value::jsonb->>'status_ok' from app_settings where key='settle_field_map'),'승인완료')
    and not exists (select 1 from settlement_empl_map m where m.empl_id = s.empl_id and m.hidden)
  group by 1,3 $$;
drop function if exists settlement_empl_ids();
create or replace function settlement_empl_ids()
returns table(empl_id text, name text, last_date date, hidden boolean)
language sql stable as $$
  select s.empl_id, max(s.raw->>'empName'), max(s.req_date), coalesce(bool_or(m.hidden), false)
  from settlement_items s left join settlement_empl_map m on m.empl_id = s.empl_id
  where s.empl_id is not null and s.empl_id <> '' group by 1 $$;
-- KPI 반영에서도 숨김 제외
create or replace function apply_settlement_margin(p_from date, p_to date) returns int
language plpgsql security definer set search_path=public as $$
declare n int; v_div numeric := coalesce((select value::numeric from app_settings where key='settle_vat_divisor'),1.1);
begin
  perform assert_admin();
  with agg as (
    select coalesce(m.user_id, p.id) as user_id, s.req_date, ceil(sum(s.profit)/v_div)::bigint as margin_auto
    from settlement_items s
    left join settlement_empl_map m on m.empl_id = s.empl_id
    left join profiles p on p.is_active and split_part(p.email,'@',1) = s.empl_id
    where s.req_date between p_from and p_to
      and s.status = coalesce((select value::jsonb->>'status_ok' from app_settings where key='settle_field_map'),'승인완료')
      and coalesce(m.hidden, false) = false
    group by 1,2)
  insert into kpi_daily(user_id, work_date, margin_auto)
  select user_id, req_date, margin_auto from agg where user_id is not null
  on conflict (user_id, work_date) do update set margin_auto = excluded.margin_auto;
  get diagnostics n = row_count;
  update kpi_daily k set margin_auto = 0
  where k.work_date between p_from and p_to and k.margin_auto <> 0
    and not exists (select 1 from settlement_items s left join settlement_empl_map m on m.empl_id=s.empl_id left join profiles p on split_part(p.email,'@',1)=s.empl_id
                    where s.req_date = k.work_date and coalesce(m.user_id,p.id) = k.user_id and coalesce(m.hidden,false) = false);
  return n;
end $$;
