-- =====================================================================
-- 워크허브 1-A : 인증 · 사용자 · 팀 · 허용 IP · 설정 · 감사로그
-- 원칙: 삭제 없음(is_active), 모든 테이블 RLS, 가드는 한 패턴,
--       뷰는 반드시 security_invoker=on
-- =====================================================================
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_type where typname='user_role') then
    create type user_role as enum ('admin','head','manager','staff');
  end if;
end $$;

-- ---------- 테이블 ----------
create table if not exists teams (
  id          serial primary key,
  name        text not null unique,
  leader_id   uuid,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  role        user_role not null default 'staff',
  team_id     int references teams(id),
  is_mgmt     boolean not null default false,
  position    text,
  hired_at    date,
  annual_leave_granted  numeric(4,1) not null default 0,
  monthly_leave_granted numeric(4,1) not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table teams drop constraint if exists teams_leader_fk;
alter table teams add constraint teams_leader_fk foreign key (leader_id) references profiles(id);

create table if not exists allowed_ips (
  id          serial primary key,
  label       text not null,
  cidr        cidr not null,
  is_active   boolean not null default true,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table if not exists app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists audit_logs (
  id          bigserial primary key,
  user_id     uuid,
  table_name  text not null,
  row_id      text,
  action      text not null,          -- insert / update / delete
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
create index if not exists audit_logs_table_at on audit_logs(table_name, at desc);

-- ---------- 헬퍼 (RLS에서 사용, 재귀 방지용 security definer) ----------
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and is_active $$;

create or replace function my_team() returns int
language sql stable security definer set search_path = public as
$$ select team_id from profiles where id = auth.uid() and is_active $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(my_role() = 'admin', false) $$;

create or replace function can_see_all() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(my_role() in ('admin','head'), false) $$;

create or replace function same_team(uid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(my_role() = 'manager'
       and (select team_id from profiles where id = uid) = my_team(), false) $$;

-- 가드 패턴 (cron/서비스롤은 auth.uid() null → 통과, 로그인 사용자는 admin만)
create or replace function assert_admin() returns void
language plpgsql stable as $$
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
end $$;

-- ---------- updated_at / 감사 트리거 ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function audit_row() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into audit_logs(user_id, table_name, row_id, action, before, after)
  values (auth.uid(), tg_table_name,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',''),
          lower(tg_op),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();
drop trigger if exists profiles_audit on profiles;
create trigger profiles_audit after insert or update or delete on profiles for each row execute function audit_row();
drop trigger if exists allowed_ips_audit on allowed_ips;
create trigger allowed_ips_audit after insert or update or delete on allowed_ips for each row execute function audit_row();
drop trigger if exists teams_audit on teams;
create trigger teams_audit after insert or update or delete on teams for each row execute function audit_row();

-- ---------- RLS ----------
alter table teams        enable row level security;
alter table profiles     enable row level security;
alter table allowed_ips  enable row level security;
alter table app_settings enable row level security;
alter table audit_logs   enable row level security;

-- teams: 전원 읽기, admin만 쓰기
drop policy if exists teams_select on teams;
create policy teams_select on teams for select using (auth.uid() is not null);
drop policy if exists teams_write on teams;
create policy teams_write on teams for all using (is_admin()) with check (is_admin());

-- profiles: 본인 / 전사(admin,head) / 같은 팀(manager)  · 쓰기 admin만
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or can_see_all() or same_team(id));
drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_write on profiles for all using (is_admin()) with check (is_admin());

-- allowed_ips / app_settings / audit_logs: admin 전용
drop policy if exists ips_admin on allowed_ips;
create policy ips_admin on allowed_ips for all using (is_admin()) with check (is_admin());
drop policy if exists settings_admin on app_settings;
create policy settings_admin on app_settings for all using (is_admin()) with check (is_admin());
drop policy if exists audit_admin_read on audit_logs;
create policy audit_admin_read on audit_logs for select using (is_admin());

-- ---------- 미들웨어용: 허용 IP 목록 (service role만 호출) ----------
create or replace function ip_allowed(p_ip text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from allowed_ips where is_active and p_ip::inet <<= cidr) $$;
revoke all on function ip_allowed(text) from public, anon, authenticated;

-- ---------- 어드민 초대: 프로필 생성 (auth 계정은 서버에서 service role로 생성 후 호출) ----------
create or replace function admin_upsert_profile(
  p_id uuid, p_name text, p_email text, p_role user_role, p_team int,
  p_is_mgmt boolean, p_position text, p_hired date, p_annual numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  insert into profiles(id,name,email,role,team_id,is_mgmt,position,hired_at,annual_leave_granted)
  values (p_id,p_name,p_email,p_role,p_team,coalesce(p_is_mgmt,false),p_position,p_hired,coalesce(p_annual,0))
  on conflict (id) do update set
    name=excluded.name, email=excluded.email, role=excluded.role, team_id=excluded.team_id,
    is_mgmt=excluded.is_mgmt, position=excluded.position, hired_at=excluded.hired_at,
    annual_leave_granted=excluded.annual_leave_granted;
end $$;
