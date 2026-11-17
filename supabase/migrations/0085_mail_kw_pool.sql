-- 0085 키워드 발굴: 아직 수집 안 된 키워드 후보 (검색광고 API 연관 키워드). taken_at = 추출하려고 가져간 시각
create table if not exists mail_kw_pool (
  keyword  text primary key,
  vol      int not null default 0,
  seed     text not null default '',
  found_at timestamptz not null default now(),
  taken_at timestamptz
);
create index if not exists mail_kw_pool_wait on mail_kw_pool(vol desc) where taken_at is null;
alter table mail_kw_pool enable row level security;
