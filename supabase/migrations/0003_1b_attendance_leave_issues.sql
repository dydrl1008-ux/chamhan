-- =====================================================================
-- 워크허브 1-B : 출퇴근 · 근태 · 금일 이슈
-- 원칙: 삭제 없음, 모든 테이블 RLS, 뷰 security_invoker=on, 가드 한 패턴
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname='leave_type') then
    create type leave_type as enum ('annual','half_am','half_pm','monthly','sick','absent','late');
  end if;
  if not exists (select 1 from pg_type where typname='leave_status') then
    create type leave_status as enum ('pending','approved','rejected','cancelled');
  end if;
end $$;

-- ---------- 출퇴근 ----------
create table if not exists attendance (
  id          bigserial primary key,
  user_id     uuid not null references profiles(id),
  work_date   date not null,
  check_in    time,
  check_out   time,
  check_in_ip  inet,  check_out_ip  inet,
  check_in_ua  text,  check_out_ua  text,
  is_late     boolean not null default false,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, work_date)
);
create index if not exists attendance_date on attendance(work_date);

-- 지각 판정: app_settings.late_after (기본 10:00)
create or replace function set_is_late() returns trigger language plpgsql as $$
declare v_late time;
begin
  select coalesce((select value from app_settings where key='late_after'),'10:00')::time into v_late;
  new.is_late := new.check_in is not null and new.check_in > v_late;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists attendance_is_late on attendance;
create trigger attendance_is_late before insert or update on attendance for each row execute function set_is_late();
drop trigger if exists attendance_audit on attendance;
create trigger attendance_audit after insert or update or delete on attendance for each row execute function audit_row();

-- ---------- 근태 ----------
create table if not exists leave_requests (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id),
  type         leave_type not null,
  start_date   date not null,
  end_date     date not null,
  days         numeric(4,1) not null default 0,
  reason       text,
  status       leave_status not null default 'pending',
  requested_by uuid references profiles(id),
  decided_by   uuid references profiles(id),
  decided_at   timestamptz,
  source       text not null default 'manual',      -- manual | auto_late
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists leave_user_date on leave_requests(user_id, start_date);
create unique index if not exists leave_auto_late_once on leave_requests(user_id, start_date) where source='auto_late';

-- days 자동 계산 (반차 0.5, 지각·결근 0, 나머지 달력일수)
create or replace function set_leave_days() returns trigger language plpgsql as $$
begin
  new.days := case
    when new.type in ('late','absent') then 0
    when new.type in ('half_am','half_pm') then 0.5
    else (new.end_date - new.start_date + 1) end;
  new.updated_at := now();
  return new;
end $$;
-- 트리거는 이름순 실행: 1_days(일수 계산) → 2_balance(잔여 검사) 순서 보장
drop trigger if exists leave_days on leave_requests;
drop trigger if exists leave_1_days on leave_requests;
create trigger leave_1_days before insert or update on leave_requests for each row execute function set_leave_days();
drop trigger if exists leave_audit on leave_requests;
create trigger leave_audit after insert or update or delete on leave_requests for each row execute function audit_row();

-- 잔여 연차 검사 (연차·반차 신청·승인 시 부여량 초과 차단, 대기 중인 신청도 선점으로 계산)
create or replace function annual_used(p_user uuid, p_year int) returns numeric
language sql stable security definer set search_path=public as $$
  select coalesce(sum(days),0) from leave_requests
  where user_id=p_user and status in ('approved','pending') and type in ('annual','half_am','half_pm')
    and extract(year from start_date)=p_year $$;   -- pending 도 선점(예약)으로 계산

create or replace function check_annual_balance() returns trigger language plpgsql as $$
declare v_granted numeric; v_used numeric;
begin
  if new.type in ('annual','half_am','half_pm') and new.status in ('pending','approved') then
    select annual_leave_granted into v_granted from profiles where id=new.user_id;
    v_used := annual_used(new.user_id, extract(year from new.start_date)::int)
              - case when tg_op='UPDATE' and old.status in ('approved','pending') then old.days else 0 end;
    if v_used + new.days > v_granted then
      raise exception '잔여 연차 부족 (부여 %, 사용 %, 신청 %)', v_granted, v_used, new.days using errcode='23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists leave_balance on leave_requests;
drop trigger if exists leave_2_balance on leave_requests;
create trigger leave_2_balance before insert or update on leave_requests for each row execute function check_annual_balance();

-- ---------- 금일 이슈 ----------
create table if not exists issues (
  id              bigserial primary key,
  issue_date      date not null default (now() at time zone 'Asia/Seoul')::date,
  title           text not null,
  body            text,
  customer_notice text,
  author_id       uuid references profiles(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists issues_date on issues(issue_date desc);
create table if not exists issue_reads (
  issue_id  bigint references issues(id) on delete cascade,
  user_id   uuid references profiles(id),
  read_at   timestamptz not null default now(),
  primary key (issue_id, user_id)
);
drop trigger if exists issues_updated_at on issues;
create trigger issues_updated_at before update on issues for each row execute function set_updated_at();
drop trigger if exists issues_audit on issues;
create trigger issues_audit after insert or update or delete on issues for each row execute function audit_row();

-- ---------- 뷰 (security_invoker 필수) ----------
create or replace view v_leave_monthly with (security_invoker = on) as
select user_id, date_trunc('month', start_date)::date as month,
       count(*) filter (where type='late')   as late_cnt,
       count(*) filter (where type='absent') as absent_cnt,
       count(*) filter (where type='sick')   as sick_cnt,
       count(*) filter (where type='annual') as annual_cnt,
       count(*) filter (where type in ('half_am','half_pm')) as half_cnt,
       count(*) filter (where type='monthly') as monthly_cnt,
       coalesce(sum(days) filter (where type in ('annual','half_am','half_pm')),0) as annual_used,
       coalesce(sum(days) filter (where type='monthly'),0) as monthly_used
from leave_requests where status='approved' group by 1,2;

create or replace view v_leave_yearly with (security_invoker = on) as
select user_id, extract(year from start_date)::int as year,
       count(*) filter (where type='late')   as late_cnt,
       count(*) filter (where type='absent') as absent_cnt,
       count(*) filter (where type='sick')   as sick_cnt,
       count(*) filter (where type='annual') as annual_cnt,
       count(*) filter (where type in ('half_am','half_pm')) as half_cnt,
       count(*) filter (where type='monthly') as monthly_cnt,
       coalesce(sum(days) filter (where type in ('annual','half_am','half_pm')),0) as annual_used,
       coalesce(sum(days) filter (where type='monthly'),0) as monthly_used
from leave_requests where status='approved' group by 1,2;

-- ---------- RLS ----------
alter table attendance     enable row level security;
alter table leave_requests enable row level security;
alter table issues         enable row level security;
alter table issue_reads    enable row level security;

drop policy if exists att_select on attendance;
create policy att_select on attendance for select using (user_id = auth.uid() or can_see_all() or same_team(user_id));
drop policy if exists att_insert on attendance;
create policy att_insert on attendance for insert with check (user_id = auth.uid() or is_admin());
drop policy if exists att_update on attendance;
create policy att_update on attendance for update using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

drop policy if exists lv_select on leave_requests;
create policy lv_select on leave_requests for select using (user_id = auth.uid() or can_see_all() or same_team(user_id));
-- 직원: 본인 신청(지각·결근 제외, pending만) / 팀장: 팀원 등록 / admin: 전부
drop policy if exists lv_insert on leave_requests;
create policy lv_insert on leave_requests for insert with check (
  is_admin()
  or (same_team(user_id))
  or (user_id = auth.uid() and type not in ('absent','late') and status = 'pending'));
-- 승인/반려: admin, 팀장(팀원) / 직원은 본인 pending 건 취소만
drop policy if exists lv_update on leave_requests;
create policy lv_update on leave_requests for update
  using (is_admin() or same_team(user_id) or (user_id = auth.uid() and status = 'pending'))
  with check (is_admin() or same_team(user_id) or (user_id = auth.uid() and status = 'cancelled'));

drop policy if exists is_select on issues;
create policy is_select on issues for select using (auth.uid() is not null);
drop policy if exists is_write on issues;
create policy is_write on issues for all using (my_role() in ('admin','head')) with check (my_role() in ('admin','head'));

drop policy if exists ir_select on issue_reads;
create policy ir_select on issue_reads for select using (user_id = auth.uid() or can_see_all());
drop policy if exists ir_insert on issue_reads;
create policy ir_insert on issue_reads for insert with check (user_id = auth.uid());

-- inet 변환 실패(프록시가 이상한 값 넘길 때)해도 기록은 남기게
create or replace function safe_inet(p text) returns inet language plpgsql immutable as $$
begin return nullif(p,'')::inet; exception when others then return null; end $$;

-- ---------- 출퇴근 기록 함수 (IP·UA는 서버에서 전달) ----------
create or replace function attendance_check(p_kind text, p_time time, p_ip text, p_ua text)
returns attendance language plpgsql security definer set search_path=public as $$
declare v_today date := (now() at time zone 'Asia/Seoul')::date; r attendance;
begin
  if auth.uid() is null then raise exception 'login required' using errcode='42501'; end if;
  if p_kind = 'in' then
    insert into attendance(user_id, work_date, check_in, check_in_ip, check_in_ua)
    values (auth.uid(), v_today, p_time, safe_inet(p_ip), p_ua)
    on conflict (user_id, work_date) do update
      set check_in = coalesce(attendance.check_in, excluded.check_in)     -- 이미 있으면 유지
    returning * into r;
  elsif p_kind = 'out' then
    update attendance set check_out = p_time, check_out_ip = safe_inet(p_ip), check_out_ua = p_ua
    where user_id = auth.uid() and work_date = v_today and check_in is not null
    returning * into r;
    if r.id is null then raise exception '출근 기록이 없습니다' using errcode='P0001'; end if;
  else raise exception 'bad kind'; end if;
  return r;
end $$;

-- ---------- 지각 자동 생성 (cron: 매일 00:10 KST = 15:10 UTC 전일분) ----------
create or replace function generate_late_requests(p_date date default null) returns int
language plpgsql security definer set search_path=public as $$
declare v_date date := coalesce(p_date, ((now() at time zone 'Asia/Seoul')::date - 1)); n int;
begin
  perform assert_admin();   -- cron(uid null) 통과, 로그인 사용자는 admin만
  insert into leave_requests(user_id, type, start_date, end_date, reason, status, requested_by, source)
  select a.user_id, 'late', a.work_date, a.work_date, '출근 '||to_char(a.check_in,'HH24:MI')||' (자동 감지)', 'pending', null, 'auto_late'
  from attendance a
  where a.work_date = v_date and a.is_late
    and not exists (select 1 from leave_requests l where l.user_id=a.user_id and l.start_date=a.work_date and l.source='auto_late');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function generate_late_requests(date) from public, anon;

-- pg_cron 이 켜져 있으면 스케줄 등록 (Supabase: Database › Extensions › pg_cron 활성화 필요)
do $$ begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='generate_late_requests';
    perform cron.schedule('generate_late_requests', '10 15 * * *', 'select generate_late_requests()');
  end if;
end $$;
