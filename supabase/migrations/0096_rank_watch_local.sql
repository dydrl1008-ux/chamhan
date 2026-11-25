-- 0096 순위 체크를 워크허브가 직접 조회(지수 프로그램) — 순위·이력을 워크허브 DB 에 둔다. 항목 목록은 지금처럼 ykreward 에서 읽기만 함
create table if not exists rank_watch_ranks (
  watch_id  text primary key,
  cur_rank  int,                 -- 0 = 100위 밖
  cur_at    timestamptz,
  prev_rank int,
  title     text not null default '',
  store     text not null default ''
);
alter table rank_watch_ranks enable row level security;
create table if not exists rank_watch_hist (
  id         bigserial primary key,
  watch_id   text not null,
  rank       int not null default 0,
  checked_at timestamptz not null default now()
);
create index if not exists rank_watch_hist_w on rank_watch_hist(watch_id, checked_at);
alter table rank_watch_hist enable row level security;
