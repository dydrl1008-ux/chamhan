-- 0048: ykreward 슬롯 오픈 연동 — 워크허브에서 셀러 계정 생성·슬롯 발급. 이력은 여기(워크허브)에, 슬롯 자체는 ykreward 에.
create table if not exists reward_slot_opens (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id),
  team_id      int references teams(id),
  target_login text not null,                     -- ykreward 셀러 아이디
  target_name  text not null default '',
  cnt          int not null,
  daily_goal   int not null,
  start_date   date not null,
  days         int not null,
  slot_type    text,
  reward_name  text not null default '',
  slot_codes   bigint[] not null default '{}',    -- ykreward slots.code
  created_at   timestamptz not null default now()
);
create index if not exists reward_slot_opens_user_idx on reward_slot_opens(user_id, created_at desc);
alter table reward_slot_opens enable row level security;
drop policy if exists rso_select on reward_slot_opens;
create policy rso_select on reward_slot_opens for select using (user_id = auth.uid() or same_team(user_id) or can_see_all() or is_mgmt());
-- insert 는 서비스롤(서버 액션)만
insert into app_settings(key, value) values ('ykreward_parent_login', 'lchkgy') on conflict (key) do nothing;  -- 워크허브가 만드는 셀러의 소속 계정
