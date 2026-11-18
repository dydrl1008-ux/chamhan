-- 0087 키워드 콜 리스트: 직원의 키워드 요청 (총괄이 따로 추출해 CSV 로 올리면 자동 완료)
create table if not exists kw_requests (
  id           bigserial primary key,
  keyword      text not null,
  requested_by uuid not null references profiles(id) on delete cascade,
  status       text not null default 'open' check (status in ('open', 'done', 'rejected')),
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);
create index if not exists kw_requests_status on kw_requests(status, created_at);
create index if not exists kw_requests_user on kw_requests(requested_by, created_at desc);
alter table kw_requests enable row level security;
