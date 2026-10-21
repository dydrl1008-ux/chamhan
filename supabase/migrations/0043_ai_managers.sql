-- ============================================================================
-- 0043 · 팀장도 워크허브에서 AI팀 써보기
--   팀장(manager): 비서실장에게 지시 · 내 지시 결과 보기 · 결과 고쳐 달라고 하기
--   본인이 넣은 지시(와 그 하위 작업)만 보임. 대행사·콜 리스트 설정·검사기는 그대로 어드민·총괄만
-- ============================================================================

alter table ai_tasks add column if not exists requested_by_id uuid references profiles(id) on delete set null;
create index if not exists ai_tasks_requester_idx on ai_tasks(requested_by_id) where requested_by_id is not null;

-- 상위 지시를 누가 넣었는지 (정책 안에서 ai_tasks 를 다시 읽으면 무한 반복이라 함수로)
create or replace function ai_task_requester(p_id bigint) returns uuid
language sql stable security definer set search_path = public as $$
  select requested_by_id from ai_tasks where id = p_id;
$$;
revoke all on function ai_task_requester(bigint) from public, anon;
grant execute on function ai_task_requester(bigint) to authenticated;

-- 읽기: 어드민·총괄은 전체, 그 밖에는 내가 넣은 지시 + 그 하위 작업
drop policy if exists ai_tasks_read on ai_tasks;
create policy ai_tasks_read on ai_tasks for select to authenticated using (
  can_see_all()
  or requested_by_id = auth.uid()
  or (parent_id is not null and ai_task_requester(parent_id) = auth.uid())
);

-- 넣기: 어드민·총괄은 기존대로, 팀장은 지시(order)만 본인 이름으로
drop policy if exists ai_tasks_insert on ai_tasks;
create policy ai_tasks_insert on ai_tasks for insert to authenticated with check (
  source = 'workhub' and status = 'queued' and (
    (can_see_all() and kind in ('order', 'check', 'briefing', 'work'))
    or (my_role() = 'manager' and kind = 'order' and agent = 'chief' and requested_by_id = auth.uid())
  )
);

-- 에이전트 이름은 팀장도 볼 수 있게 (작업 현황 화면 표시용)
drop policy if exists ai_agents_read on ai_agents;
create policy ai_agents_read on ai_agents for select to authenticated using (can_see_all() or my_role() = 'manager');
