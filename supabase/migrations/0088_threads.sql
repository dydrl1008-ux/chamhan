-- 0088 쓰레드 자동 발행 — 계정(토큰은 암호화 저장) · 글 대기열/발행 내역
create table if not exists threads_accounts (
  id               bigserial primary key,
  owner_id         uuid not null references profiles(id) on delete cascade,
  username         text not null default '',
  th_user_id       text not null default '',
  token_enc        text not null default '',
  token_expires_at timestamptz,
  enabled          boolean not null default false,
  per_day          int not null default 3,
  hours            text not null default '9,13,20',
  tail             text not null default '',
  tone             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (owner_id)
);
create table if not exists threads_posts (
  id           bigserial primary key,
  account_id   bigint not null references threads_accounts(id) on delete cascade,
  keyword      text not null default '',
  text         text not null,
  facts        text not null default '',
  status       text not null default 'queued' check (status in ('queued', 'posted', 'failed', 'hold')),
  scheduled_at timestamptz,
  posted_at    timestamptz,
  thread_id    text,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists threads_posts_due on threads_posts(account_id, status, scheduled_at);
alter table threads_accounts enable row level security;
alter table threads_posts enable row level security;
