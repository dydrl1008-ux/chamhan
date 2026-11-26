-- 0105 메타 결제 내역(1차 · 2차 · 3차 …) + 회사월 마감. 금액은 VAT 제외. 결제는 결제일이 속한 회사월(21일~20일)의 실적, 그때 담당자의 실적으로 잡는다
create table if not exists meta_payments (
  id          bigserial primary key,
  lead_id     bigint not null references meta_leads(id) on delete cascade,
  owner_id    uuid references profiles(id) on delete set null,   -- 결제 시점의 담당자 (실적 귀속)
  kind        text not null default '결제',                      -- 결제 / 환불 (환불은 금액을 마이너스로 저장)
  paid_on     date not null,
  amount      bigint not null,                                   -- VAT 제외
  cost        bigint not null default 0,                         -- 상품비 (VAT 제외)
  product     text not null default '',
  memo        text not null default '',
  canceled_at timestamptz,                                       -- 잘못 넣은 건은 지우지 않고 취소 표시
  canceled_by uuid references profiles(id) on delete set null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists meta_payments_lead on meta_payments(lead_id);
create index if not exists meta_payments_day on meta_payments(paid_on);
alter table meta_payments enable row level security;
create table if not exists meta_closings (                       -- 회사월 마감 — 그 달 효율 숫자를 그대로 저장해 이후에 바뀌지 않게
  month     text primary key,                                    -- '2026-12' = 11/21 ~ 12/20
  snapshot  jsonb not null,
  closed_by uuid references profiles(id) on delete set null,
  closed_at timestamptz not null default now()
);
alter table meta_closings enable row level security;
