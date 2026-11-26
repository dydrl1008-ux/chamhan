-- 0104 메타 인바운드 DB ↔ 내 DB 연결 — 배정하면 그 사람의 내 DB 에 한 줄이 생기고, 내 DB 에서 고친 상태 · 결제 금액 · 상품비가 인바운드 DB(효율 집계)로 돌아온다
alter table my_db add column if not exists meta_id bigint;      -- 연결된 인바운드 DB (meta_leads.id)
alter table my_db add column if not exists paid_amt bigint;     -- 결제 금액 (메타 건)
alter table my_db add column if not exists cost_amt bigint;     -- 상품비 (메타 건)
create unique index if not exists my_db_meta on my_db(meta_id) where meta_id is not null;
alter table meta_leads add column if not exists first_contact_at timestamptz;   -- 첫 연락(내 DB 에 처음 기록한 시각)
alter table meta_leads add column if not exists last_contact_at timestamptz;
alter table meta_leads add column if not exists contacts int not null default 0; -- 연락 차수 (1 · 2 · 3차 콜 중 적힌 칸 수)
alter table meta_leads add column if not exists nag_at timestamptz;             -- 첫 연락 지연 알림을 보낸 시각
