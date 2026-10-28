-- 0064: 고객 순위 리포트 — 업체(순위 체크 그룹)별 계약 기간·메모 저장 + 담당자 연락처
-- ※ chamhan 프로젝트(jeehtcoccvdnuphopgth)에서 실행
create table if not exists reward_watch_reports (
  user_id    uuid not null references profiles(id) on delete cascade,
  group_key  text not null,                       -- rank_watch.group_name (없으면 '(미분류)')
  start_on   date,                                -- 계약 시작일
  end_on     date,                                -- 계약 종료일
  note       text not null default '',            -- 리포트 하단 한 줄 (선택)
  updated_at timestamptz not null default now(),
  primary key (user_id, group_key)
);
alter table reward_watch_reports enable row level security;
drop policy if exists rwr_sel on reward_watch_reports;
create policy rwr_sel on reward_watch_reports for select using (user_id = auth.uid() or same_team(user_id) or can_see_all() or is_mgmt());
drop policy if exists rwr_write on reward_watch_reports;
create policy rwr_write on reward_watch_reports for all using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

-- 리포트에 찍히는 담당자 연락처 (직원 본인이 입력)
alter table reward_watch_links add column if not exists phone text not null default '';
