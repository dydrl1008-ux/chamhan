-- 0101 메타팀 교육 — 1차 대면 교육 → 2차 자료 학습 → 3차 시험(80점) → 영업 스크립트 작성 → 팀장 승인(투입). 투입 전에는 인바운드 DB 가 배정되지 않는다
create table if not exists meta_edu (
  user_id     uuid primary key references profiles(id) on delete cascade,
  step1_at    timestamptz,                         -- 1차 대면 교육 완료 (팀장 체크)
  step1_by    uuid references profiles(id) on delete set null,
  docs        jsonb not null default '{}',         -- 교육자료 열람 시각 { shopping: '2026-12-01T…' }
  retake_ok   boolean not null default false,      -- 불합격 뒤 재시험 허락 (팀장)
  script      jsonb,                               -- 본인이 짠 영업 스크립트 { open_shop, open_place, objection, message }
  script_at   timestamptz,                         -- 스크립트 제출 시각
  script_back text not null default '',            -- 팀장이 돌려보낸 사유 (다시 쓰기)
  deployed_at timestamptz,                         -- 투입 승인 시각 (팀장) — 이때부터 DB 배정
  deployed_by uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table meta_edu enable row level security;
create table if not exists meta_edu_exams (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  qs           jsonb not null,                     -- 출제된 문제와 보기 순서 [{ id, perm }]
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  score        int,
  passed       boolean,
  wrong        jsonb                               -- 틀린 문제 [{ id, pick }]
);
create index if not exists meta_edu_exams_user on meta_edu_exams(user_id, id);
alter table meta_edu_exams enable row level security;
