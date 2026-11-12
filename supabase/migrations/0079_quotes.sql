-- 0079: 견적서 (작성 → 이미지로 바로 복사·저장) — chamhan 프로젝트에서 실행
create table if not exists quotes (
  id          bigserial primary key,
  owner_id    uuid not null references profiles(id) on delete cascade,
  title       text not null default '',          -- 목록에 보이는 이름 (보통 거래처명)
  data        jsonb not null default '{}',        -- 입력값 전체 (거래처·품목·조건)
  total       bigint not null default 0,          -- 합계(공급가액+세액)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists quotes_owner_idx on quotes(owner_id, updated_at desc);
alter table quotes enable row level security;
drop policy if exists quotes_sel on quotes; create policy quotes_sel on quotes for select using (auth.uid() is not null);
