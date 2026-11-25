-- 0092 내 DB — 직원 개인별 가망 고객(DB) 정리. 엑셀·콜 리스트·직접 입력으로 모으고 등급·상태·다음 연락일을 관리한다
create table if not exists my_db (
  id           bigserial primary key,
  owner_id     uuid not null references profiles(id) on delete cascade,
  created_by   uuid references profiles(id) on delete set null,
  source       text not null default '직접',        -- 직접 / 엑셀 / 콜리스트 / 키워드콜 / 배정 / 넘겨받음
  src_ref      text not null default '',            -- lead:123 · kw:45 (같은 건 두 번 안 담기게)
  contact_date date,
  name         text not null default '',
  phone        text not null default '',
  phone_key    text not null default '',            -- 숫자만 (중복 확인용)
  biz_no       text not null default '',
  kind         text not null default '',            -- 분류: 스토어 / 플레이스 / 수산업체 …
  gender       text not null default '',            -- 성별
  channel      text not null default '',            -- 껀덕지(연락 수단): 카톡 / 문자 / 전화 / 이메일
  item         text not null default '',            -- 키워드·품목
  url          text not null default '',
  url2         text not null default '',
  grade        text not null default '',            -- 결제 가능성 등급: S A B C D E F
  status       text not null default '진행',        -- 진행 / 결제 / 보류 / 종료
  paid_at      timestamptz,
  next_on      date,
  note1        text not null default '',            -- 상황설명 및 진행사항
  note2        text not null default '',            -- 1차 콜(추가 통화 1)
  note3        text not null default '',            -- 추가 통화 2
  deleted_at   timestamptz,
  deleted_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists my_db_owner on my_db(owner_id) where deleted_at is null;
create index if not exists my_db_phone on my_db(phone_key) where phone_key <> '';
create index if not exists my_db_next on my_db(next_on) where next_on is not null and deleted_at is null;
alter table my_db enable row level security;

create table if not exists my_db_logs (
  id         bigserial primary key,
  db_id      bigint not null references my_db(id) on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  action     text not null,                         -- 삭제 / 되살림 / 넘김 / 결제 …
  detail     text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists my_db_logs_db on my_db_logs(db_id);
alter table my_db_logs enable row level security;
