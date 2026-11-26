-- 0100 메타팀 — 메타 광고 인바운드 DB 를 처리하는 팀 (기본급 직원). 팀 이름이 '메타팀'인 사람이 메타팀이다
insert into teams (name, sort_order) select '메타팀', 90 where not exists (select 1 from teams where name = '메타팀');

-- 콜 리스트 자동 배분 대상에서 메타팀 제외
create or replace view v_sales_people with (security_invoker = true) as
  select id, name, team_id from profiles p where is_active and role in ('manager','staff') and not coalesce(is_mgmt, false)
    and not exists (select 1 from teams t where t.id = p.team_id and t.name = '메타팀');

create table if not exists meta_leads (
  id          bigserial primary key,
  received_on date not null default (now() at time zone 'Asia/Seoul')::date,   -- 문의 들어온 날 (광고비 마감 21일~20일 계산 기준)
  source      text not null default '상담신청',                                  -- 상담신청 / 바이럴 접수
  name        text not null default '',
  phone       text not null default '',
  phone_key   text not null default '',
  product     text not null default '',                                         -- 문의 상품·구분 (쇼핑 / 플레이스 …)
  inquiry     text not null default '',                                         -- 문의 내용 (접수 원문)
  url         text not null default '',
  owner_id    uuid references profiles(id) on delete set null,
  assigned_at timestamptz,
  status      text not null default '미연락',                                    -- 미연락 / 부재 / 상담중 / 결제 / 허수 / 중복 / 종료
  paid_amt    bigint,
  paid_at     timestamptz,
  next_on     date,
  memo        text not null default '',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists meta_leads_owner on meta_leads(owner_id, status);
create index if not exists meta_leads_recv on meta_leads(received_on);
create index if not exists meta_leads_phone on meta_leads(phone_key) where phone_key <> '';
alter table meta_leads enable row level security;

create table if not exists meta_ad_spend (                                      -- 회사월(21일~20일)별 광고비
  month      text not null,                                                     -- '2026-12' = 11/21 ~ 12/20
  source     text not null default '전체',
  amount     bigint not null default 0,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (month, source)
);
alter table meta_ad_spend enable row level security;
