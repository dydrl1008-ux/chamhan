-- 0102 메타팀 — 결제 건 상품비(원가) + 메타 보고(일일: 사원 / 주간: 팀장)
alter table meta_leads add column if not exists cost_amt bigint;   -- 상품비 (결제 금액 - 상품비 = 마진)
create table if not exists meta_reports (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  kind         text not null,                      -- daily / weekly
  period_key   date not null,                      -- 일일: 그날 / 주간: 그 주 월요일
  auto         jsonb not null default '{}',        -- 제출 시점의 자동 집계 숫자
  data         jsonb not null default '{}',        -- 직접 쓴 내용
  submitted_at timestamptz not null default now(),
  unique (user_id, kind, period_key)
);
create index if not exists meta_reports_period on meta_reports(kind, period_key);
alter table meta_reports enable row level security;
