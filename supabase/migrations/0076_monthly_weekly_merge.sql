-- 주간보고 → 월간 보고 주차 카드로 통합. 주차 제출·공통 지시·사람별 총괄 피드백
alter table monthly_plan_weeks add column if not exists submitted_at timestamptz;
alter table monthly_plan_weeks add column if not exists submitted_by uuid references profiles(id);
alter table monthly_plan_weeks add column if not exists directive text;           -- 다음 주 공통 지시 (팀장)
alter table monthly_plan_member_weeks add column if not exists feedback text;     -- 총괄·대표 피드백 (사람별 주차)
alter table monthly_plan_member_weeks add column if not exists feedback_by uuid references profiles(id);
alter table monthly_plan_member_weeks add column if not exists feedback_at timestamptz;
-- 총괄·대표가 피드백만 쓸 수 있게 (팀장 저장은 기존 정책)
drop policy if exists mpmw_feedback_lead on monthly_plan_member_weeks;
create policy mpmw_feedback_lead on monthly_plan_member_weeks for update using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','head'))) with check (true);
drop policy if exists mpw_lead_update on monthly_plan_weeks;
create policy mpw_lead_update on monthly_plan_weeks for update using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','head','manager'))) with check (true);

-- 총괄(head)도 월간 보고 작성·수정 가능
drop policy if exists mp_write on monthly_plans; create policy mp_write on monthly_plans for all using (is_admin() or my_role()='head' or manages_team(team_id)) with check (is_admin() or my_role()='head' or manages_team(team_id));
do $$ declare t text; begin
  foreach t in array array['monthly_plan_weeks','monthly_plan_members','monthly_plan_renewals','monthly_plan_pipes','monthly_plan_upsells','monthly_plan_activities','monthly_plan_member_weeks'] loop
    execute format('drop policy if exists %1$s_write on %1$I; create policy %1$s_write on %1$I for all using (is_admin() or my_role()=''head'' or manages_team(plan_team(plan_id))) with check (is_admin() or my_role()=''head'' or manages_team(plan_team(plan_id)))', t);
  end loop; end $$;
drop policy if exists at_write on activity_types; create policy at_write on activity_types for all using (is_admin() or my_role() in ('head','manager')) with check (is_admin() or my_role() in ('head','manager'));
