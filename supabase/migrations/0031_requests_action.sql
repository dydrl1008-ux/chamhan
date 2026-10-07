-- settlement_requests.action 에 고객 배정/해제 기록 허용 (고객 등록·배정 화면)
alter table settlement_requests drop constraint if exists settlement_requests_action_check;
alter table settlement_requests add constraint settlement_requests_action_check check (action in ('create','cancel','assign','unassign'));
