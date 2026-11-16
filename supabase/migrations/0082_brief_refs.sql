-- 0082 영업 브리핑: 내 레퍼런스 (셀팜 외 다른 상품으로 진행한 건을 직접 적어 두는 칸 — 본인 것만 쓰임)
create table if not exists brief_refs (
  id         bigserial primary key,
  owner_id   uuid not null references profiles(id) on delete cascade,
  keyword    text not null,
  vol        int,            -- 월 검색량 (선택)
  slots      int,            -- 진행 규모(개)
  rank_now   int,            -- 현재 순위
  up         int,            -- 등록 후 상승폭 (선택)
  created_at timestamptz not null default now()
);
create index if not exists brief_refs_owner on brief_refs(owner_id);
alter table brief_refs enable row level security;   -- 정책 없음 = 서버(서비스 키)만 접근
