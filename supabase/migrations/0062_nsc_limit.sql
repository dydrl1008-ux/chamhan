-- 0062: 시크릿 지수 1인 하루 조회 한도 10 → 30 (콜 리스트 상품명 조회용)
update app_settings set value = '30' where key = 'nsc_daily_per_user' and value::int < 30;
insert into app_settings(key, value) values ('nsc_daily_per_user', '30') on conflict (key) do nothing;
