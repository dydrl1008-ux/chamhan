-- 0050: 순위 체크 연동 — 직원 ↔ 본인 ykreward 아이디 매핑, 주요 업체 ★, 변동 알림 기준 스냅샷
create table if not exists reward_watch_links (
  user_id    uuid primary key references profiles(id) on delete cascade,
  login_id   text not null,                      -- ykreward accounts.login_id (순위 체크 담당자 계정)
  updated_at timestamptz not null default now()
);
alter table reward_watch_links enable row level security;
drop policy if exists rwl_sel on reward_watch_links;
create policy rwl_sel on reward_watch_links for select using (user_id = auth.uid() or same_team(user_id) or can_see_all() or is_mgmt());
drop policy if exists rwl_write on reward_watch_links;
create policy rwl_write on reward_watch_links for all using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

create table if not exists reward_watch_stars (                -- ★ 주요 업체 (rank_watch.group_name 기준, 없으면 '(미분류)')
  user_id   uuid not null references profiles(id) on delete cascade,
  group_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, group_key)
);
alter table reward_watch_stars enable row level security;
drop policy if exists rws_own on reward_watch_stars;
create policy rws_own on reward_watch_stars for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists reward_watch_snap (                 -- 마지막 알림 때 순위 (서비스롤만)
  watch_id    uuid primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  rank        int, cur_at timestamptz,
  notified_at timestamptz not null default now()
);
alter table reward_watch_snap enable row level security;
insert into app_settings(key, value) values ('rank_alert_delta', '5') on conflict (key) do nothing;
