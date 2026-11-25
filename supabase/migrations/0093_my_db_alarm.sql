-- 0093 내 DB 알람 시각 — 다음 연락일에 시각까지 정하면 그 시각에 알림
alter table my_db add column if not exists alarm_time text not null default '';
alter table my_db add column if not exists alarm_sent_on date;
