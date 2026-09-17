-- 정산 연동: 관리팀(is_mgmt)도 열람·동기화 이력·담당자 매핑 가능
create or replace function is_mgmt() returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select is_mgmt from profiles where id = auth.uid() and is_active), false) $$;
drop policy if exists si_mgmt on settlement_items;      create policy si_mgmt on settlement_items for select using (is_mgmt());
drop policy if exists ssr_mgmt on settlement_sync_runs; create policy ssr_mgmt on settlement_sync_runs for select using (is_mgmt());
drop policy if exists sem_mgmt on settlement_empl_map;  create policy sem_mgmt on settlement_empl_map for all using (is_mgmt()) with check (is_mgmt());
-- 관리팀은 프로필 전체 이름을 매핑에 써야 하므로 profiles 읽기 허용(이름·이메일·팀만 쓰지만 RLS 는 행 단위)
drop policy if exists profiles_mgmt_select on profiles; create policy profiles_mgmt_select on profiles for select using (is_mgmt());
