-- monthly_targets: 부분 유니크 인덱스 → 일반 유니크 제약 (PostgREST upsert onConflict 가 부분 인덱스를 못 찾는 문제)
drop index if exists monthly_targets_user;
drop index if exists monthly_targets_team;
alter table monthly_targets drop constraint if exists monthly_targets_month_user_key;
alter table monthly_targets drop constraint if exists monthly_targets_month_team_key;
alter table monthly_targets add constraint monthly_targets_month_user_key unique (month, user_id);
alter table monthly_targets add constraint monthly_targets_month_team_key unique (month, team_id);
-- (user_id/team_id 는 한쪽만 null → null 은 서로 다른 값으로 취급되므로 팀 행끼리 충돌 없음)
