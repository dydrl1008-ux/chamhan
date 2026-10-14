-- 0036: 진행 중 슬롯(정산 원건) 조회 — 본인 것만 (팀장·총괄도 자기 담당 건만)
-- settlement_items 는 직원이 못 읽으므로(RLS) security definer 함수로 범위 내 원건만 반환.
-- 담당자ID ↔ 계정: settlement_empl_map → settlement_credentials.settle_user_id → 이메일 앞부분 순.
create or replace function slots_in_range(p_from date, p_to date, p_user uuid default null)
returns table(user_id uuid, settle_no text, cust_name text, prod_name text, date_from date, date_to date, work_day int, inflow_cnt int, sale_total bigint, status text, gubun_name text)
language sql stable security definer set search_path=public as $$
  with map as (
    select p.id as user_id, coalesce(m.empl_id, c.settle_user_id, split_part(p.email,'@',1)) as empl_id
    from profiles p
    left join settlement_empl_map m on m.user_id = p.id
    left join settlement_credentials c on c.user_id = p.id
    where p.is_active
  ), scope as (
    select user_id, empl_id from map
    where user_id = auth.uid() and (p_user is null or user_id = p_user)
  )
  select sc.user_id, s.settle_no, s.raw->>'custName', s.raw->>'prodName',
         (s.raw->>'dateWorkFrom')::date, (s.raw->>'dateWorkTo')::date,
         nullif(s.raw->>'workDay','')::int, nullif(s.raw->>'inflowCnt','')::int,
         nullif(regexp_replace(coalesce(s.raw->>'saleTotalAmt','0'),'[^0-9.-]','','g'),'')::numeric::bigint,
         s.status, s.raw->>'gubunName'
  from settlement_items s
  join scope sc on sc.empl_id = s.empl_id
  where coalesce(s.raw->>'refundInd','') <> 'Y'
    and s.status in ('승인완료','승인요청')
    and (s.raw->>'dateWorkTo') ~ '^\d{4}-\d{2}-\d{2}' and (s.raw->>'dateWorkFrom') ~ '^\d{4}-\d{2}-\d{2}'
    and (s.raw->>'dateWorkTo')::date >= p_from and (s.raw->>'dateWorkFrom')::date <= p_to
  order by (s.raw->>'dateWorkTo')::date, s.raw->>'custName' $$;
grant execute on function slots_in_range(date, date, uuid) to authenticated;

insert into app_settings(key,value) values ('slot_end_days','3') on conflict (key) do nothing;
