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
