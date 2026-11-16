-- 0081 영업 브리핑: 셀팜 슬롯 운영 화면에서 붙여넣은 키워드별 진행 현황 (원본 수치는 서버에만 두고, 화면에는 구간으로만 내보냄)
create table if not exists sales_brief (
  id          bigserial primary key,
  rows        jsonb not null default '[]',      -- [{k 키워드, v 검색량, s 슬롯수, r 현재순위, b 최고순위, d 등록대비}]
  n           int not null default 0,
  uploaded_by uuid references profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
alter table sales_brief enable row level security;   -- 정책 없음 = 서버(서비스 키)만 접근
