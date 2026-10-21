-- 0038: 주간보고 기간을 팀장이 직접 지정 (시작일·종료일). 자동 20일 분할은 기본 제안으로만 쓰고 저장값이 우선.
alter table weekly_reports add column if not exists week_end date;
update weekly_reports set week_end = week_start + 6 where week_end is null;
alter table weekly_reports drop constraint if exists weekly_reports_week_start_check;
alter table weekly_reports drop constraint if exists weekly_reports_period_check;
alter table weekly_reports add constraint weekly_reports_period_check check (week_end >= week_start and week_end - week_start <= 30);
comment on column weekly_reports.week_end is '보고 기간 종료일 — 팀장이 지정 (기본: 월~일, 20일 마감 주는 20일에서 끊은 값을 제안)';
