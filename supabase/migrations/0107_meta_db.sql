-- 0107 메타 DB — 메타팀 전용 화면. 한 군데(meta_leads)에만 저장한다: 등급 · 연락방식 · 알람 · 관리 내용(인수인계) · 연락 기록(횟수 제한 없음) · 담당 이력
alter table meta_leads add column if not exists grade text not null default '';        -- 결제 가능성 등급 S~F
alter table meta_leads add column if not exists channel text not null default '';      -- 연락방식: 카톡,전화,문자
alter table meta_leads add column if not exists alarm_time text not null default '';   -- 다음 연락 시각 (HH:MM)
alter table meta_leads add column if not exists alarm_sent_on date;
alter table meta_leads add column if not exists care_note text not null default '';    -- 관리 내용 (인수인계용)
alter table meta_leads add column if not exists prev_owner uuid references profiles(id) on delete set null;   -- 이전 담당자
alter table meta_leads add column if not exists moved_at timestamptz;                  -- 담당자가 바뀐 시각
create table if not exists meta_contacts (                                             -- 연락 기록 — 덮어쓰지 않고 쌓인다
  id         bigserial primary key,
  lead_id    bigint not null references meta_leads(id) on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  at         timestamptz not null default now(),
  way        text not null default '전화',            -- 전화 / 카톡 / 문자 / 기타
  result     text not null default '',                -- 부재 / 통화 / 메시지 남김 …
  note       text not null default ''
);
create index if not exists meta_contacts_lead on meta_contacts(lead_id, id);
alter table meta_contacts enable row level security;
-- 내 DB 로 복사해 두던 메타 건은 내린다 (이제 메타 DB 화면 한 곳에서만 관리)
update my_db set deleted_at = now() where meta_id is not null and deleted_at is null;
