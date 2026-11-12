-- 메일 자동 발송 캠페인 + SNS_Manager 끌어가기 키
alter table mail_queue add column if not exists campaign_id bigint;

create table if not exists mail_campaigns (
  id          bigserial primary key,
  owner_id    uuid not null references profiles(id) on delete cascade,
  account_id  bigint not null references mail_accounts(id) on delete cascade,
  keywords    jsonb not null default '[]',          -- ["토퍼","과메기",...] 순서대로
  per_kw      int not null default 30,
  daily_cap   int not null default 0,               -- 0 = 계정 일 상한까지
  subject     text not null default '',
  body        text not null default '',
  owner_name  text not null default '',
  phone       text not null default '',
  offer       jsonb not null default '{"basic":"","rec":""}',
  status      text not null default 'active' check (status in ('active','paused','done')),
  progress    jsonb not null default '{"done":[],"sent":0,"log":[]}',
  last_pull_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table mail_campaigns enable row level security;
drop policy if exists mc_sel on mail_campaigns; create policy mc_sel on mail_campaigns for select using (owner_id = auth.uid() or my_role() in ('admin','head'));
create index if not exists mail_campaigns_owner_idx on mail_campaigns(owner_id, status);

-- SNS_Manager 가 서버에서 일감을 끌어갈 때 쓰는 개인 키
create table if not exists mail_agent_keys (
  user_id    uuid primary key references profiles(id) on delete cascade,
  key        text not null unique,
  created_at timestamptz not null default now()
);
alter table mail_agent_keys enable row level security;
drop policy if exists mak_sel on mail_agent_keys; create policy mak_sel on mail_agent_keys for select using (user_id = auth.uid());
