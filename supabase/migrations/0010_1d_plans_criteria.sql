-- =====================================================================
-- 워크허브 1-D : 계획 캘린더 · 진급 기준 · 인센티브 구간 · 본인 지시사항 조회
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname='plan_type') then
    create type plan_type as enum ('daily','weekly','monthly');
  end if;
end $$;

-- ---------- 계획 ----------
create table if not exists plans (
  id          bigserial primary key,
  user_id     uuid not null references profiles(id),
  type        plan_type not null,
  title       text not null,
  detail      text,
  start_date  date not null,
  end_date    date not null,
  is_done     boolean not null default false,
  done_at     timestamptz,
  miss_reason text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists plans_user_date on plans(user_id, start_date, end_date) where is_active;
create or replace function plans_before() returns trigger language plpgsql as $$
begin
  if new.is_done and (tg_op='INSERT' or not old.is_done) then new.done_at := now(); end if;
  if not new.is_done then new.done_at := null; end if;
  new.updated_at := now(); return new;
end $$;
drop trigger if exists plans_1_before on plans;
create trigger plans_1_before before insert or update on plans for each row execute function plans_before();
drop trigger if exists plans_audit on plans;
create trigger plans_audit after insert or update or delete on plans for each row execute function audit_row();

alter table plans enable row level security;
drop policy if exists plans_select on plans;
create policy plans_select on plans for select using (user_id = auth.uid() or can_see_all() or same_team(user_id));
drop policy if exists plans_write on plans;
create policy plans_write on plans for all using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

create or replace view v_plan_rate with (security_invoker = on) as
select user_id, type, date_trunc('month', start_date)::date as month,
       count(*) as total, count(*) filter (where is_done) as done
from plans where is_active group by 1,2,3;

-- ---------- 진급 기준 ----------
create table if not exists promotion_criteria (
  id                  serial primary key,
  from_position       text not null,
  to_position         text not null,
  monthly_margin_min  bigint not null default 0,
  yearly_margin_min   bigint,
  consecutive_months  int not null default 1,
  max_late            int not null default 2,
  max_absent          int not null default 0,
  max_sick            int not null default 2,
  min_tenure_months   int not null default 0,
  note                text,
  sort_order          int not null default 0,
  is_active           boolean not null default true,
  updated_at          timestamptz not null default now()
);
create unique index if not exists promotion_criteria_from on promotion_criteria(from_position) where is_active;
drop trigger if exists promotion_criteria_updated_at on promotion_criteria;
create trigger promotion_criteria_updated_at before update on promotion_criteria for each row execute function set_updated_at();
drop trigger if exists promotion_criteria_audit on promotion_criteria;
create trigger promotion_criteria_audit after insert or update or delete on promotion_criteria for each row execute function audit_row();
alter table promotion_criteria enable row level security;
drop policy if exists pc_select on promotion_criteria;
create policy pc_select on promotion_criteria for select using (auth.uid() is not null);
drop policy if exists pc_admin on promotion_criteria;
create policy pc_admin on promotion_criteria for all using (is_admin()) with check (is_admin());

-- ---------- 인센티브 구간 ----------
create table if not exists incentive_tiers (
  id          serial primary key,
  scope       text not null check (scope in ('staff','manager')),   -- staff: 본인 월 마진 / manager: 팀 합계 마진
  label       text not null,
  min_margin  bigint not null default 0,
  max_margin  bigint,                       -- null = 상한 없음
  rate        numeric(6,4) not null default 0,   -- 0.05 = 5%
  bonus       bigint not null default 0,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);
drop trigger if exists incentive_tiers_updated_at on incentive_tiers;
create trigger incentive_tiers_updated_at before update on incentive_tiers for each row execute function set_updated_at();
drop trigger if exists incentive_tiers_audit on incentive_tiers;
create trigger incentive_tiers_audit after insert or update or delete on incentive_tiers for each row execute function audit_row();
alter table incentive_tiers enable row level security;
drop policy if exists it_select on incentive_tiers;
create policy it_select on incentive_tiers for select using (auth.uid() is not null);
drop policy if exists it_admin on incentive_tiers;
create policy it_admin on incentive_tiers for all using (is_admin()) with check (is_admin());

-- 설정: 신규 마진 가산율, 기준 설명문
insert into app_settings(key,value) values ('new_margin_bonus_rate','0.05') on conflict (key) do nothing;
insert into app_settings(key,value) values ('promotion_doc','') on conflict (key) do nothing;
insert into app_settings(key,value) values ('incentive_doc','') on conflict (key) do nothing;
-- app_settings 는 admin 전용이었음 → 기준 관련 키만 전원 읽기 허용
drop policy if exists settings_read_public on app_settings;
create policy settings_read_public on app_settings for select using (auth.uid() is not null and key in ('late_after','new_margin_bonus_rate','promotion_doc','incentive_doc'));

-- ---------- 예시 기준 (실제 값 확정 시 어드민 화면에서 수정) ----------
insert into promotion_criteria(from_position,to_position,monthly_margin_min,yearly_margin_min,consecutive_months,max_late,max_absent,max_sick,min_tenure_months,sort_order)
select * from (values
 ('사원','주임', 5000000::bigint, 50000000::bigint, 3, 2, 0, 2, 6, 1),
 ('주임','대리', 8000000::bigint, 90000000::bigint, 3, 2, 0, 2, 12, 2),
 ('대리','과장', 12000000::bigint, 140000000::bigint, 3, 1, 0, 2, 18, 3)) v(a,b,c,d,e,f,g,h,i,j)
where not exists (select 1 from promotion_criteria);
insert into incentive_tiers(scope,label,min_margin,max_margin,rate,bonus,sort_order)
select * from (values
 ('staff','기본',0::bigint,5000000::bigint,0::numeric,0::bigint,1),('staff','1구간',5000000::bigint,8000000::bigint,0.05::numeric,0::bigint,2),('staff','2구간',8000000::bigint,12000000::bigint,0.08::numeric,0::bigint,3),
 ('staff','3구간',12000000::bigint,15000000::bigint,0.10::numeric,0::bigint,4),('staff','목표 달성',15000000::bigint,20000000::bigint,0.12::numeric,300000::bigint,5),('staff','초과 달성',20000000::bigint,null::bigint,0.15::numeric,500000::bigint,6),
 ('manager','기본',0::bigint,40000000::bigint,0::numeric,0::bigint,1),('manager','1구간',40000000::bigint,60000000::bigint,0.02::numeric,0::bigint,2),('manager','팀 목표 달성',60000000::bigint,80000000::bigint,0.03::numeric,500000::bigint,3),('manager','초과 달성',80000000::bigint,null::bigint,0.04::numeric,1000000::bigint,4)) v(a,b,c,d,e,f,g)
where not exists (select 1 from incentive_tiers);

-- ---------- 본인 지시사항 (직원은 weekly_reports 를 못 보므로 함수로 주차 정보 제공) ----------
create or replace function my_directives(p_limit int default 8)
returns table(week_start date, team_id int, status text, common_directive text, directive text, feedback text)
language sql stable security definer set search_path=public as $$
  select r.week_start, r.team_id, r.status, r.common_directive, n.directive, n.feedback
  from weekly_member_notes n join weekly_reports r on r.id = n.report_id
  where n.user_id = auth.uid() and r.status = 'submitted'
  order by r.week_start desc limit p_limit $$;
