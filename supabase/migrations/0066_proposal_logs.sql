-- 0066: 제안서 생성 기록 — 누가 어떤 키워드·업체로 뽑았는지 (조회/PDF/링크)
-- ※ chamhan 프로젝트에서 실행
create table if not exists proposal_logs (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  keyword    text not null,
  target     text,                      -- 업체명 (없으면 null)
  action     text not null,             -- make | pdf | png | link
  code       text,                      -- 링크면 /p/코드
  created_at timestamptz not null default now()
);
create index if not exists proposal_logs_user_idx on proposal_logs(user_id, created_at desc);
alter table proposal_logs enable row level security;
drop policy if exists pl_sel on proposal_logs;
create policy pl_sel on proposal_logs for select using (user_id = auth.uid() or same_team(user_id) or can_see_all() or is_mgmt());
drop policy if exists pl_ins on proposal_logs;
create policy pl_ins on proposal_logs for insert with check (user_id = auth.uid());
