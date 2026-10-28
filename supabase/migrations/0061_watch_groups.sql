-- 0061: 순위 체크 업체(그룹) 먼저 추가 — 상품 없는 업체도 목록에 보이게 (워크허브 쪽 보관, 상품은 ykreward group_name 으로 연결)
create table if not exists reward_watch_groups (
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  memo       text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);
alter table reward_watch_groups enable row level security;
drop policy if exists rwg_sel on reward_watch_groups;
create policy rwg_sel on reward_watch_groups for select using (user_id = auth.uid() or same_team(user_id) or can_see_all() or is_mgmt());
drop policy if exists rwg_write on reward_watch_groups;
create policy rwg_write on reward_watch_groups for all using (user_id = auth.uid()) with check (user_id = auth.uid());
