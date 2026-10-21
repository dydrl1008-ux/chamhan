-- 0037: 주간보고 기간을 회사 월 마감(20일)에서 끊음 → 기간 시작일이 월요일이 아닐 수 있음(21일 시작). 월요일 제약 해제.
alter table weekly_reports drop constraint if exists weekly_reports_week_start_check;
comment on column weekly_reports.week_start is '보고 기간 시작일 — 월요일 또는 회사 월 시작일(21일). 끝은 lib/date/period.ts reportPeriodOf 로 계산';
