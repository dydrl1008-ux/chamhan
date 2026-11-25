-- 0097 순위 체크 항목을 워크허브에 직접 둔다 (ykreward 계정 연결 없이 워크허브 사용자 기준). 원부(가격비교)도 등록 가능
create table if not exists rank_watch_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  url         text not null default '',
  mid         text not null,                       -- 단일: 상품 번호(/products/번호) · 원부: 카탈로그 번호(/catalog/번호)
  mid_type    text not null default '단일',        -- 단일 / 원부
  keyword     text not null,
  group_name  text,
  group_order int,
  sort_order  int not null default 0,
  memo        text,
  title       text,
  store       text,
  image_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists rank_watch_items_user on rank_watch_items(user_id) where active;
alter table rank_watch_items enable row level security;
