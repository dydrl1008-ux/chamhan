-- 정산 승인요청 감시: 새 요청 감지 → 관리팀/총괄/어드민 알림, 승인·반려되면 자동 해소
create table if not exists settlement_pending (
  item_key    text primary key,
  settle_no   text, empl_id text, empl_name text, cust_name text, prod_name text, req_gubun text,
  amount      bigint not null default 0, req_date date, status text,
  first_seen  timestamptz not null default now(), last_seen timestamptz not null default now(),
  resolved_at timestamptz, resolved_status text,
  notified_at timestamptz
);
create index if not exists settlement_pending_open on settlement_pending(first_seen desc) where resolved_at is null;
alter table settlement_pending enable row level security;
drop policy if exists sp_read on settlement_pending;
create policy sp_read on settlement_pending for select using (is_admin() or my_role()='head' or is_mgmt());
-- 쓰기는 service role 만 (정책 없음)

-- 확장: pg_cron + pg_net (Supabase Dashboard › Database › Extensions 에서 pg_cron, pg_net 활성화 필요)
create extension if not exists pg_net;
insert into app_settings(key,value) values ('pending_poll_url',''),('pending_poll_secret',''),('settle_pending_code','01') on conflict (key) do nothing;
-- 2분마다 워크허브 감시 API 호출. URL/시크릿은 app_settings 에서 읽음 (아래 setup 참고)
create or replace function poll_settlement_pending() returns void language plpgsql security definer set search_path=public as $$
declare v_url text; v_secret text;
begin
  select value into v_url from app_settings where key='pending_poll_url';
  select value into v_secret from app_settings where key='pending_poll_secret';
  if coalesce(v_url,'')='' or coalesce(v_secret,'')='' then return; end if;
  perform net.http_get(url := v_url, headers := jsonb_build_object('Authorization','Bearer '||v_secret), timeout_milliseconds := 25000);
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='poll_settlement_pending';
    perform cron.schedule('poll_settlement_pending', '*/2 * * * *', 'select poll_settlement_pending()');
  end if;
end $$;
