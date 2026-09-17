-- 1-A 초기 데이터 (staging)
insert into teams(name, sort_order) values ('1팀',1),('2팀',2),('A팀',3),('관리팀',9)
on conflict (name) do nothing;

insert into allowed_ips(label, cidr, is_active) values ('본사 사무실','211.205.68.33/32',true)
on conflict do nothing;

insert into app_settings(key,value) values
 ('late_after','10:00'),
 ('week_start','mon'),
 ('annual_reset','01-01'),
 ('admin_bypass_ip','false')       -- true면 admin은 IP 무관 접속 (기본 off)
on conflict (key) do nothing;
