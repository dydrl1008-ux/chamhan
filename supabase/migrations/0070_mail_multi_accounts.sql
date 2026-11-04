-- 메일 계정 여러 개 (네이버·지메일) — 직원당 N개, 계정별 일 상한. 0069 실행 후 적용
alter table mail_accounts drop constraint if exists mail_accounts_pkey;
alter table mail_accounts add column if not exists id bigserial;
alter table mail_accounts add primary key (id);
create unique index if not exists mail_accounts_user_email_uq on mail_accounts(user_id, lower(email));
alter table mail_accounts add column if not exists provider text not null default 'naver';   -- naver | gmail
update mail_accounts set provider = case when lower(email) like '%@gmail.com' then 'gmail' else 'naver' end;

alter table mail_queue add column if not exists account_id bigint references mail_accounts(id) on delete set null;
create index if not exists mail_queue_account_idx on mail_queue(account_id, queued_at desc);

-- 계정별 오늘(KST) 발송·대기 수
create or replace function mail_account_today(p_user uuid) returns table (account_id bigint, n bigint)
language sql stable security definer set search_path = public as $$
  select account_id, count(*) from mail_queue
   where sender_id = p_user and status in ('queued','sending','sent') and account_id is not null
     and queued_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
   group by account_id
$$;
revoke all on function mail_account_today(uuid) from public, anon;
grant execute on function mail_account_today(uuid) to authenticated;
