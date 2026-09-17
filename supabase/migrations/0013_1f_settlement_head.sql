-- 정산 연동: 총괄(head)도 원본 열람·실행 이력 열람·담당자 매핑 가능
drop policy if exists si_head on settlement_items;     create policy si_head on settlement_items for select using (my_role()='head');
drop policy if exists ssr_head on settlement_sync_runs; create policy ssr_head on settlement_sync_runs for select using (my_role()='head');
drop policy if exists sem_head on settlement_empl_map;  create policy sem_head on settlement_empl_map for all using (my_role()='head') with check (my_role()='head');
