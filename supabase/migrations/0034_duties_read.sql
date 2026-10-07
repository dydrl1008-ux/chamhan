-- 관리팀 담당업무: 모든 활성 사용자가 열람 가능 (관리팀 홈 '내 담당업무' 표시용). 수정은 어드민만
drop policy if exists duty_read on mgmt_duties;
create policy duty_read on mgmt_duties for select using (auth.uid() is not null);
