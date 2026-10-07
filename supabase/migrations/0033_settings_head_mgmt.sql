-- 총괄·관리팀도 정산 연동 설정(필드 매핑·VAT·대기 코드 등)을 읽을 수 있게 → 정산 연동 화면 표/동기화 버튼 정상 동작
drop policy if exists settings_read_settle on app_settings;
create policy settings_read_settle on app_settings for select
  using (auth.uid() is not null and (my_role()='head' or is_mgmt()) and key like 'settle_%');
