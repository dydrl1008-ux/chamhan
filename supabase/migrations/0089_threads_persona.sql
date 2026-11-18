-- 0089 쓰레드 페르소나 (누구·대상·말투·관점·예시 글)
alter table threads_accounts add column if not exists persona jsonb not null default '{}'::jsonb;
