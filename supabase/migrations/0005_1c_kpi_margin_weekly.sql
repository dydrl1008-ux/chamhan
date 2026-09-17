-- =====================================================================
-- 워크허브 1-C : 일간 KPI · 영업 마진 집계 · 가망건 파이프라인 · 팀장 주간보고 · 월 목표
-- =====================================================================

-- ---------- 일간 KPI (팀원 제출) ----------
create table if not exists kpi_daily (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id),
  team_id      int references teams(id),              -- 제출 시점 팀 스냅샷
  work_date    date not null,
  calls        int not null default 0 check (calls >= 0),
  new_cnt      int not null default 0 check (new_cnt >= 0),
  margin       bigint not null default 0,             -- 금일 마진 (VAT 제외, 음수 허용)
  kakao_db     int not null default 0 check (kakao_db >= 0),
  overtime     boolean not null default false,
  new_margin   bigint not null default 0,
  work_report  text,
  feedback     text,
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, work_date)
);
create index if not exists kpi_daily_date on kpi_daily(work_date);
create index if not exists kpi_daily_team_date on kpi_daily(team_id, work_date);

create or replace function kpi_daily_before() returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' or new.team_id is null then
    select team_id into new.team_id from profiles where id = new.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists kpi_daily_1_before on kpi_daily;
create trigger kpi_daily_1_before before insert or update on kpi_daily for each row execute function kpi_daily_before();
drop trigger if exists kpi_daily_audit on kpi_daily;
create trigger kpi_daily_audit after insert or update or delete on kpi_daily for each row execute function audit_row();

-- ---------- 월 목표 (마진) ----------
create table if not exists monthly_targets (
  id        serial primary key,
  month     date not null,                            -- 매월 1일
  user_id   uuid references profiles(id),
  team_id   int references teams(id),
  margin    bigint not null default 0,
  check ((user_id is not null) <> (team_id is not null))
);
create unique index if not exists monthly_targets_user on monthly_targets(month, user_id) where user_id is not null;
create unique index if not exists monthly_targets_team on monthly_targets(month, team_id) where team_id is not null;

-- ---------- 가망건 파이프라인 ----------
create table if not exists pipeline (
  id              bigserial primary key,
  team_id         int not null references teams(id),
  owner_id        uuid not null references profiles(id),
  client          text not null,
  stage           text not null default '콜' check (stage in ('콜','연결','카톡','협상','결제')),
  expected_margin text,
  next_action     text,
  risk            text,
  support         text,
  memo            text,
  is_active       boolean not null default true,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists pipeline_team on pipeline(team_id) where is_active;
drop trigger if exists pipeline_updated_at on pipeline;
create trigger pipeline_updated_at before update on pipeline for each row execute function set_updated_at();
drop trigger if exists pipeline_audit on pipeline;
create trigger pipeline_audit after insert or update or delete on pipeline for each row execute function audit_row();

-- ---------- 팀장 주간보고 ----------
create table if not exists weekly_reports (
  id               bigserial primary key,
  team_id          int not null references teams(id),
  week_start       date not null,                     -- 월요일
  goal_margin      bigint not null default 0,
  issues           text,
  checkpoints      jsonb not null default '[]',       -- ["지시1","지시2"]
  common_directive text,
  status           text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at     timestamptz,
  created_by       uuid references profiles(id),
  updated_at       timestamptz not null default now(),
  unique (team_id, week_start),
  check (extract(isodow from week_start) = 1)
);
create table if not exists weekly_member_notes (
  report_id  bigint not null references weekly_reports(id) on delete cascade,
  user_id    uuid not null references profiles(id),
  directive  text,
  feedback   text,
  updated_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
drop trigger if exists weekly_reports_updated_at on weekly_reports;
create trigger weekly_reports_updated_at before update on weekly_reports for each row execute function set_updated_at();
drop trigger if exists weekly_member_notes_updated_at on weekly_member_notes;
create trigger weekly_member_notes_updated_at before update on weekly_member_notes for each row execute function set_updated_at();
drop trigger if exists weekly_reports_audit on weekly_reports;
create trigger weekly_reports_audit after insert or update or delete on weekly_reports for each row execute function audit_row();

-- ---------- 헬퍼: 팀장 여부 ----------
create or replace function manages_team(t int) returns boolean
language sql stable security definer set search_path=public as
$$ select coalesce(my_role()='manager' and my_team()=t, false) $$;

-- ---------- 집계 뷰 (security_invoker) ----------
create or replace view v_margin_monthly with (security_invoker = on) as
select user_id, team_id, date_trunc('month', work_date)::date as month,
       sum(margin) as margin, sum(new_margin) as new_margin, sum(new_cnt) as new_cnt,
       sum(calls) as calls, sum(kakao_db) as kakao_db, count(*) filter (where overtime) as overtime_days, count(*) as days
from kpi_daily group by 1,2,3;

create or replace view v_margin_weekly with (security_invoker = on) as
select user_id, team_id, date_trunc('week', work_date)::date as week_start,
       sum(margin) as margin, sum(new_margin) as new_margin, sum(new_cnt) as new_cnt,
       sum(calls) as calls, sum(kakao_db) as kakao_db, count(*) filter (where overtime) as overtime_days
from kpi_daily group by 1,2,3;

-- ---------- RLS ----------
alter table kpi_daily           enable row level security;
alter table monthly_targets     enable row level security;
alter table pipeline            enable row level security;
alter table weekly_reports      enable row level security;
alter table weekly_member_notes enable row level security;

drop policy if exists kpi_select on kpi_daily;
create policy kpi_select on kpi_daily for select using (user_id = auth.uid() or can_see_all() or same_team(user_id));
drop policy if exists kpi_insert on kpi_daily;
create policy kpi_insert on kpi_daily for insert with check (user_id = auth.uid() or is_admin());
drop policy if exists kpi_update on kpi_daily;
create policy kpi_update on kpi_daily for update using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

drop policy if exists tgt_select on monthly_targets;
create policy tgt_select on monthly_targets for select using (
  can_see_all() or user_id = auth.uid() or team_id = my_team() or (user_id is not null and same_team(user_id)));
drop policy if exists tgt_admin on monthly_targets;
create policy tgt_admin on monthly_targets for all using (is_admin()) with check (is_admin());

drop policy if exists pipe_select on pipeline;
create policy pipe_select on pipeline for select using (can_see_all() or team_id = my_team());
drop policy if exists pipe_write on pipeline;
create policy pipe_write on pipeline for all using (is_admin() or manages_team(team_id)) with check (is_admin() or manages_team(team_id));

drop policy if exists wr_select on weekly_reports;
create policy wr_select on weekly_reports for select using (can_see_all() or manages_team(team_id));
drop policy if exists wr_write on weekly_reports;
create policy wr_write on weekly_reports for all using (is_admin() or manages_team(team_id)) with check (is_admin() or manages_team(team_id));

drop policy if exists wmn_select on weekly_member_notes;
create policy wmn_select on weekly_member_notes for select using (
  can_see_all() or user_id = auth.uid()
  or exists (select 1 from weekly_reports r where r.id = report_id and manages_team(r.team_id)));
drop policy if exists wmn_write on weekly_member_notes;
create policy wmn_write on weekly_member_notes for all
  using (is_admin() or exists (select 1 from weekly_reports r where r.id = report_id and manages_team(r.team_id)))
  with check (is_admin() or exists (select 1 from weekly_reports r where r.id = report_id and manages_team(r.team_id)));
