-- 팀장이 본인 팀원의 월 개인 목표(마진)를 등록·수정. 팀 목표는 어드민만.
drop policy if exists tgt_manager on monthly_targets;
create policy tgt_manager on monthly_targets for all
  using (user_id is not null and same_team(user_id))
  with check (user_id is not null and same_team(user_id) and team_id is null);
