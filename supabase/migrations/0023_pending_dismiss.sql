-- 승인 대기 건 무시(알림 해제): 목록·배지에서 제외, 동기화 후에도 유지
alter table settlement_pending add column if not exists dismissed_at timestamptz;
alter table settlement_pending add column if not exists dismissed_by uuid references profiles(id);
create index if not exists settlement_pending_active on settlement_pending(first_seen desc) where resolved_at is null and dismissed_at is null;
-- 무시/복원은 관리팀·총괄·어드민 (해당 두 컬럼만 바꾸는 용도)
drop policy if exists sp_dismiss on settlement_pending;
create policy sp_dismiss on settlement_pending for update using (is_admin() or my_role()='head' or is_mgmt()) with check (is_admin() or my_role()='head' or is_mgmt());
