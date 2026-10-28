-- 0049: 워크허브에서 오픈 못 하는 ykreward 슬롯 유형 (쉼표 구분, 어드민 설정에서 변경)
insert into app_settings(key, value) values ('ykreward_block_types', '아센도,리얼,세이브') on conflict (key) do nothing;
