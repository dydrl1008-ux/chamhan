-- 마진 분리 표시: 확정(승인완료) = margin_auto, 대기(승인요청) = margin_pending (합계·목표·인센티브는 확정 기준, 대기분은 참고 표시)
alter table kpi_daily add column if not exists margin_pending bigint not null default 0;

create or replace function kpi_daily_before() returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' or new.team_id is null then select team_id into new.team_id from profiles where id = new.user_id; end if;
  -- 정산 자동값(확정·대기)은 서비스롤(정산 동기화)·어드민만 변경 가능
  if auth.uid() is not null and not is_admin() then
    if tg_op='INSERT' then new.margin_auto := 0; new.margin_pending := 0;
    elsif new.margin_auto is distinct from old.margin_auto or new.margin_pending is distinct from old.margin_pending then raise exception '정산 자동 마진은 수정할 수 없습니다' using errcode='42501'; end if;
  end if;
  new.margin := coalesce(new.margin_auto,0) + coalesce(new.margin_manual,0);
  new.updated_at := now();
  return new;
end $$;

-- 대기로 볼 상태 (기본 승인요청). app_settings 'settle_status_pending' (JSON 배열) 로 조정
insert into app_settings(key, value) values ('settle_status_pending', '["승인요청"]') on conflict (key) do nothing;
create or replace function settlement_status_pending() returns text[] language sql stable as $$
  select coalesce((select array_agg(x) from jsonb_array_elements_text((select value::jsonb from app_settings where key='settle_status_pending')) x), array['승인요청']) $$;
create or replace function settlement_status_ok() returns text language sql stable as $$
  select coalesce((select value::jsonb->>'status_ok' from app_settings where key='settle_field_map'),'승인완료') $$;

drop function if exists settlement_month_sums();
create or replace function settlement_month_sums()
returns table(empl_id text, name text, biz_month text, sum_profit bigint, sum_pending bigint)
language sql stable as $$
  select s.empl_id, max(s.raw->>'empName'),
         to_char(case when extract(day from s.req_date) >= 21 then date_trunc('month', s.req_date) + interval '1 month' else date_trunc('month', s.req_date) end, 'YYYY-MM'),
         coalesce(sum(s.profit) filter (where s.status = settlement_status_ok()), 0)::bigint,
         coalesce(sum(s.profit) filter (where s.status = any(settlement_status_pending())), 0)::bigint
  from settlement_items s
  where (s.status = settlement_status_ok() or s.status = any(settlement_status_pending()))
    and not exists (select 1 from settlement_empl_map m where m.empl_id = s.empl_id and m.hidden)
  group by 1,3 $$;

create or replace function apply_settlement_margin(p_from date, p_to date) returns int
language plpgsql security definer set search_path=public as $$
declare n int; v_div numeric := coalesce((select value::numeric from app_settings where key='settle_vat_divisor'),1.1);
begin
  perform assert_admin();
  with agg as (
    select coalesce(m.user_id, p.id) as user_id, s.req_date,
           ceil(coalesce(sum(s.profit) filter (where s.status = settlement_status_ok()), 0)/v_div)::bigint as margin_auto,
           ceil(coalesce(sum(s.profit) filter (where s.status = any(settlement_status_pending())), 0)/v_div)::bigint as margin_pending
    from settlement_items s
    left join settlement_empl_map m on m.empl_id = s.empl_id
    left join profiles p on p.is_active and split_part(p.email,'@',1) = s.empl_id
    where s.req_date between p_from and p_to
      and (s.status = settlement_status_ok() or s.status = any(settlement_status_pending()))
      and coalesce(m.hidden, false) = false
    group by 1,2)
  insert into kpi_daily(user_id, work_date, margin_auto, margin_pending)
  select user_id, req_date, margin_auto, margin_pending from agg where user_id is not null
  on conflict (user_id, work_date) do update set margin_auto = excluded.margin_auto, margin_pending = excluded.margin_pending;
  get diagnostics n = row_count;
  -- 기간 내 정산 건이 사라진 날은 0 으로
  update kpi_daily k set margin_auto = 0, margin_pending = 0
  where k.work_date between p_from and p_to and (k.margin_auto <> 0 or k.margin_pending <> 0)
    and not exists (select 1 from settlement_items s left join settlement_empl_map m on m.empl_id=s.empl_id left join profiles p on split_part(p.email,'@',1)=s.empl_id
                    where s.req_date = k.work_date and coalesce(m.user_id,p.id) = k.user_id and coalesce(m.hidden,false) = false
                      and (s.status = settlement_status_ok() or s.status = any(settlement_status_pending())));
  return n;
end $$;
revoke all on function apply_settlement_margin(date,date) from public, anon, authenticated;

-- 월 집계 뷰에 대기 마진 추가 (맨 뒤 컬럼 추가)
create or replace view v_margin_monthly with (security_invoker = on) as
select user_id, team_id, biz_month(work_date) as month,
       sum(margin) as margin, sum(new_margin) as new_margin, sum(new_cnt) as new_cnt,
       sum(calls) as calls, sum(kakao_db) as kakao_db, count(*) filter (where overtime) as overtime_days, count(*) as days,
       sum(margin_pending) as margin_pending
from kpi_daily group by 1,2,3;
