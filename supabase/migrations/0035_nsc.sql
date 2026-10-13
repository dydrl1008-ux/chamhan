-- 시크릿 지수(navershopping-click) 조회 캐시 + 조회 기록 (대표 계정 하나로 전 직원 사용 → 비용 통제)
create table if not exists nsc_searches (
  keyword text primary key, data jsonb not null, fetched_at timestamptz not null default now(), fetched_by uuid references profiles(id));
create table if not exists nsc_queries (
  id bigserial primary key, user_id uuid references profiles(id), keyword text not null, cached boolean not null default false, at timestamptz not null default now());
create index if not exists nsc_queries_user_at on nsc_queries(user_id, at);
alter table nsc_searches enable row level security; alter table nsc_queries enable row level security;
drop policy if exists nsc_s_read on nsc_searches; create policy nsc_s_read on nsc_searches for select using (auth.uid() is not null);
drop policy if exists nsc_q_read on nsc_queries;  create policy nsc_q_read on nsc_queries for select using (user_id = auth.uid() or is_admin() or my_role()='head' or is_mgmt());
insert into app_settings(key, value) values ('nsc_daily_per_user', '10'), ('nsc_cache_hours', '24') on conflict (key) do nothing;
