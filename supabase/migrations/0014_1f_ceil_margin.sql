-- 정산 자동 마진: ÷1.1 결과 소수점은 올림(ceil)
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
    where s.req_date between p_from and p_to and s.status = coalesce((select value::jsonb->>'status_ok' from app_settings where key='settle_field_map'),'승인완료')
    group by 1,2)
  insert into kpi_daily(user_id, work_date, margin_auto)
  select user_id, req_date, margin_auto from agg where user_id is not null
  on conflict (user_id, work_date) do update set margin_auto = excluded.margin_auto;
  get diagnostics n = row_count;
  update kpi_daily k set margin_auto = 0
  where k.work_date between p_from and p_to and k.margin_auto <> 0
    and not exists (select 1 from settlement_items s left join settlement_empl_map m on m.empl_id=s.empl_id left join profiles p on split_part(p.email,'@',1)=s.empl_id
                    where s.req_date = k.work_date and coalesce(m.user_id,p.id) = k.user_id);
  return n;
end $$;
