-- 인센티브 구간 그룹을 직급 단위로: scope 자유 텍스트 (예: '사원','주임','대리','팀장'). 'staff'/'manager' 는 기본(직급 매칭 없을 때)
alter table incentive_tiers drop constraint if exists incentive_tiers_scope_check;
update incentive_tiers set scope='기본(팀원)' where scope='staff';
update incentive_tiers set scope='기본(팀장)' where scope='manager';
-- 팀장 그룹 표시: 팀 합계 마진 기준인 그룹 목록 (콤마 구분) — 여기 든 그룹은 base 가 팀 마진
insert into app_settings(key,value) values ('incentive_team_scopes','기본(팀장),팀장,총괄팀장') on conflict (key) do nothing;
update app_settings set value = value where key='incentive_team_scopes';
