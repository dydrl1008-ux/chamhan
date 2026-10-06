-- 승인 대기: 작업기간·작업일수·유입수 표시
alter table settlement_pending add column if not exists work_from date;
alter table settlement_pending add column if not exists work_to date;
alter table settlement_pending add column if not exists work_day int;
alter table settlement_pending add column if not exists inflow_cnt int;
