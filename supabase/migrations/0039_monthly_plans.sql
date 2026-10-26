-- 0039: 월간 계획서 — 팀장이 월초에 쓰고 매주 리뷰로 고치는 살아있는 계획 (팀 / 인원 / 요약)
-- 숫자 셋(매출·재계약·영업활동)만 자동, 나머지는 글. 개인 목표 = 재계약+파이프라인+신규+업셀 → monthly_targets 로 반영.

create table if not exists monthly_plans (
  id            bigserial primary key,
  team_id       int not null references teams(id),
  month         date not null,                         -- 업무월 키 (YYYY-MM-01, bizMonthOf 와 동일)
  status        text not null default 'draft' check (status in ('draft','submitted')),
  strategy      text,                                  -- 이번 달 영업 전략 (팀장)
  created_by    uuid references profiles(id),
  submitted_at  timestamptz,
  last_review_at timestamptz,                          -- 마지막 주차 리뷰 저장 시각
  updated_at    timestamptz not null default now(),
  unique (team_id, month)
);
create table if not exists monthly_plan_weeks (
  plan_id     bigint not null references monthly_plans(id) on delete cascade,
  week_no     int not null,
  start_date  date not null, end_date date not null,
  plan_margin bigint not null default 0,               -- 주 목표 (인원 합 + 팀장 조정)
  issue       text,                                    -- 미흡·원인 (리뷰)
  fix         text,                                    -- 보완
  focus       text,                                    -- 이 주에 집중할 것
  support     text,                                    -- 지원 요청
  risk        text,
  reviewed_at timestamptz,
  primary key (plan_id, week_no)
);
create table if not exists monthly_plan_members (
  plan_id     bigint not null references monthly_plans(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  renew_amt   bigint not null default 0,               -- ① ○△✕ 가중 합 (저장 시 계산)
  pipe_amt    bigint not null default 0,               -- ② 체크 합
  new_amt     bigint not null default 0,               -- ③ 주차 신규 예상 합
  upsell_amt  bigint not null default 0,               -- ④
  verdict     text,                                    -- 이 사람은 · 일 배분
  strategy    text,                                    -- 개인 영업 전략
  target_note text,                                    -- 타깃·방법
  primary key (plan_id, user_id)
);
create table if not exists monthly_plan_renewals (     -- ① 재계약 체크 (슬롯 원건별)
  plan_id   bigint not null references monthly_plans(id) on delete cascade,
  user_id   uuid not null references profiles(id),
  settle_no text not null,
  cust_name text, prod_name text, amount bigint not null default 0, date_to date,
  mark      text not null default 'o' check (mark in ('o','t','x')),   -- ○ △ ✕
  primary key (plan_id, settle_no)
);
create table if not exists monthly_plan_pipes (        -- ② 파이프라인 체크
  plan_id     bigint not null references monthly_plans(id) on delete cascade,
  pipeline_id bigint not null references pipeline(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  checked     boolean not null default false,
  amount      bigint not null default 0,
  week_no     int,                                     -- 결제 예상 주차
  primary key (plan_id, pipeline_id)
);
create table if not exists monthly_plan_upsells (      -- ④ 업셀링
  id        bigserial primary key,
  plan_id   bigint not null references monthly_plans(id) on delete cascade,
  user_id   uuid not null references profiles(id),
  cust_name text not null, proposal text, amount bigint not null default 0, week_no int
);
create table if not exists activity_types (            -- ③ 활동 종류 — 팀장이 자유 추가
  id serial primary key, name text not null unique, sort_order int not null default 100, is_active boolean not null default true, created_by uuid references profiles(id)
);
insert into activity_types(name, sort_order) values ('콜 (DB)',1),('메일 발송',2),('제안서 발송',3),('기존고객 업셀 제안',4),('카톡 팔로업',5),('소개 요청',6),('방문 미팅',7) on conflict (name) do nothing;
create table if not exists monthly_plan_activities (   -- ③ 사람·활동별 주차 계획/실제 (실제는 콜·신규만 자동, 나머지 팀장 입력)
  plan_id   bigint not null references monthly_plans(id) on delete cascade,
  user_id   uuid not null references profiles(id),
  activity  text not null,
  plan      jsonb not null default '{}'::jsonb,        -- {"1":220,"2":240,...}
  actual    jsonb not null default '{}'::jsonb,
  primary key (plan_id, user_id, activity)
);
create table if not exists monthly_plan_member_weeks ( -- 사람별 주차: 신규 예상 + 실행 기록(시도→결과→변경)
  plan_id   bigint not null references monthly_plans(id) on delete cascade,
  user_id   uuid not null references profiles(id),
  week_no   int not null,
  new_cnt   numeric(6,1) not null default 0,           -- 신규 예상 건
  new_amt   bigint not null default 0,                 -- 신규 예상 마진
  keep_amt  bigint not null default 0,                 -- 기존(재계약·업셀) 예상 — 재계약 종료일·업셀 시점으로 자동 배분, 수정 가능
  tried     text,                                      -- 시도 (계획으로 한 것)
  judged    text,                                      -- 결과 판단 (효과 있던/없던 것·원인)
  changed   text,                                      -- 변경 (다음 주 어떻게 바꾸는지)
  primary key (plan_id, user_id, week_no)
);
insert into app_settings(key,value) values ('plan_renew_weight_t','0.5') on conflict (key) do nothing;   -- △ 가중치 (○=1, ✕=0)
insert into app_settings(key,value) values ('plan_alert_week_ratio','0.5') on conflict (key) do nothing; -- 주 실제 < 계획×비율 → 빨강
insert into app_settings(key,value) values ('plan_alert_conv_mult','1.5') on conflict (key) do nothing;  -- 전환율 가정 배수 → 빨강
insert into app_settings(key,value) values ('plan_alert_review_days','3') on conflict (key) do nothing;  -- 리뷰 지연 일수 → 빨강

-- RLS: 팀장(본인 팀)·어드민 쓰기, 총괄·관리팀·팀장 읽기. 직원은 못 봄.
do $$ declare t text; begin
  foreach t in array array['monthly_plans','monthly_plan_weeks','monthly_plan_members','monthly_plan_renewals','monthly_plan_pipes','monthly_plan_upsells','monthly_plan_activities','monthly_plan_member_weeks'] loop
    execute format('alter table %I enable row level security', t);
  end loop; end $$;
drop policy if exists mp_select on monthly_plans; create policy mp_select on monthly_plans for select using (can_see_all() or is_mgmt() or manages_team(team_id));
drop policy if exists mp_write  on monthly_plans; create policy mp_write  on monthly_plans for all using (is_admin() or manages_team(team_id)) with check (is_admin() or manages_team(team_id));
create or replace function plan_team(p bigint) returns int language sql stable security definer set search_path=public as $$ select team_id from monthly_plans where id = p $$;
do $$ declare t text; begin
  foreach t in array array['monthly_plan_weeks','monthly_plan_members','monthly_plan_renewals','monthly_plan_pipes','monthly_plan_upsells','monthly_plan_activities','monthly_plan_member_weeks'] loop
    execute format('drop policy if exists %1$s_select on %1$I; create policy %1$s_select on %1$I for select using (can_see_all() or is_mgmt() or manages_team(plan_team(plan_id)))', t);
    execute format('drop policy if exists %1$s_write on %1$I; create policy %1$s_write on %1$I for all using (is_admin() or manages_team(plan_team(plan_id))) with check (is_admin() or manages_team(plan_team(plan_id)))', t);
  end loop; end $$;
alter table activity_types enable row level security;
drop policy if exists at_select on activity_types; create policy at_select on activity_types for select using (auth.uid() is not null);
drop policy if exists at_write on activity_types;  create policy at_write on activity_types for all using (is_admin() or my_role()='manager') with check (is_admin() or my_role()='manager');

-- 팀 범위 슬롯 조회 (계획서 ① 재계약용): 팀장은 팀원, 총괄·어드민·관리팀은 전원
create or replace function slots_for_team(p_from date, p_to date, p_team int)
returns table(user_id uuid, settle_no text, cust_name text, prod_name text, date_from date, date_to date, inflow_cnt int, sale_total bigint, status text)
language sql stable security definer set search_path=public as $$
  with map as (
    select p.id as user_id, coalesce(m.empl_id, c.settle_user_id, split_part(p.email,'@',1)) as empl_id
    from profiles p left join settlement_empl_map m on m.user_id = p.id left join settlement_credentials c on c.user_id = p.id
    where p.is_active and p.team_id = p_team and (can_see_all() or is_mgmt() or manages_team(p_team))
  )
  select sc.user_id, s.settle_no, s.raw->>'custName', s.raw->>'prodName', (s.raw->>'dateWorkFrom')::date, (s.raw->>'dateWorkTo')::date,
         nullif(s.raw->>'inflowCnt','')::int, nullif(regexp_replace(coalesce(s.raw->>'saleTotalAmt','0'),'[^0-9.-]','','g'),'')::numeric::bigint, s.status
  from settlement_items s join map sc on sc.empl_id = s.empl_id
  where coalesce(s.raw->>'refundInd','') <> 'Y' and s.status in ('승인완료','승인요청')
    and (s.raw->>'dateWorkTo') ~ '^\d{4}-\d{2}-\d{2}' and (s.raw->>'dateWorkFrom') ~ '^\d{4}-\d{2}-\d{2}'
    and (s.raw->>'dateWorkTo')::date between p_from and p_to
  order by (s.raw->>'dateWorkTo')::date $$;
grant execute on function slots_for_team(date, date, int) to authenticated;
