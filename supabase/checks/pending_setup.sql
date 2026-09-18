-- 배포 후 한 번: URL 과 CRON_SECRET(Vercel 환경변수와 같은 값) 등록
update app_settings set value='https://chamhan.vercel.app/api/cron/pending' where key='pending_poll_url';
update app_settings set value='<CRON_SECRET 값>' where key='pending_poll_secret';
-- 확인
select jobname, schedule, active from cron.job where jobname='poll_settlement_pending';
