-- 직원별 정산 사이트 계정 연결 (비밀번호는 앱에서 AES 암호화) + 워크허브에서 보낸 정산요청 기록
create table if not exists settlement_credentials (
  user_id uuid primary key references profiles(id),
  settle_user_id text not null, pw_enc text not null,
  verified_at timestamptz, last_error text, updated_at timestamptz not null default now());
alter table settlement_credentials enable row level security;
drop policy if exists scred_own on settlement_credentials;
create policy scred_own on settlement_credentials for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists scred_admin_read on settlement_credentials;
create policy scred_admin_read on settlement_credentials for select using (is_admin() or my_role()='head');

create table if not exists settlement_requests (
  id bigserial primary key, user_id uuid references profiles(id), settlement_seq text, action text not null check (action in ('create','cancel')),
  payload jsonb not null, result text, ok boolean, at timestamptz not null default now());
alter table settlement_requests enable row level security;
drop policy if exists sreq_select on settlement_requests;
create policy sreq_select on settlement_requests for select using (user_id = auth.uid() or is_admin() or my_role()='head' or is_mgmt() or same_team(user_id));
