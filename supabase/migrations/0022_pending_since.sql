insert into app_settings(key,value) values ('settle_pending_since','') on conflict (key) do nothing;
