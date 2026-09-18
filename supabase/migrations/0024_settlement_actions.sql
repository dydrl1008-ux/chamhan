-- 워크허브에서 정산 사이트로 보낸 승인/승인취소 기록
create table if not exists settlement_actions (
  id bigserial primary key,
  settlement_seq text not null, action text not null check (action in ('approve','cancel')),
  payload jsonb not null, result text, ok boolean,
  actor_id uuid references profiles(id), at timestamptz not null default now()
);
alter table settlement_actions enable row level security;
drop policy if exists sa_read on settlement_actions;
create policy sa_read on settlement_actions for select using (is_admin() or my_role()='head' or is_mgmt());
alter table settlement_pending add column if not exists resolved_by uuid references profiles(id);
