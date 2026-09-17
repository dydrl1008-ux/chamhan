-- =====================================================================
-- 1-B 보강 : 근태 2단계 승인 (팀장 팀승인 → 총괄/어드민 최종승인)
-- status 는 그대로(pending/approved/rejected/cancelled). 팀장 승인은 team_approved_* 컬럼.
-- =====================================================================
alter table leave_requests add column if not exists team_approved_by uuid references profiles(id);
alter table leave_requests add column if not exists team_approved_at timestamptz;

-- 최종 승인(approved)은 admin/head 만. 서비스롤(cron, uid null)은 통과.
create or replace function guard_leave_final_approval() returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if auth.uid() is not null and my_role() not in ('admin','head') then
      raise exception '최종 승인은 총괄·어드민만 가능합니다' using errcode='42501';
    end if;
    new.decided_by := coalesce(new.decided_by, auth.uid());
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  -- 팀장이 팀 승인 표시할 때 본인 기록
  if new.team_approved_at is not null and (tg_op='INSERT' or old.team_approved_at is null) then
    new.team_approved_by := coalesce(new.team_approved_by, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists leave_3_final_guard on leave_requests;
create trigger leave_3_final_guard before insert or update on leave_requests for each row execute function guard_leave_final_approval();

-- 팀장 update 정책: 본인 팀 건을 team_approved / rejected 로만 변경 가능 (approved 는 트리거가 차단)
drop policy if exists lv_update on leave_requests;
create policy lv_update on leave_requests for update
  using (is_admin() or my_role()='head' or same_team(user_id) or (user_id = auth.uid() and status = 'pending'))
  with check (is_admin() or my_role()='head' or same_team(user_id) or (user_id = auth.uid() and status = 'cancelled'));
-- head 도 insert 가능하게 (총괄이 직접 등록·즉시 확정)
drop policy if exists lv_insert on leave_requests;
create policy lv_insert on leave_requests for insert with check (
  is_admin() or my_role()='head'
  or (same_team(user_id))
  or (user_id = auth.uid() and type not in ('absent','late') and status = 'pending'));
