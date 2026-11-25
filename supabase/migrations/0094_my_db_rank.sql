-- 0094 내 DB 순위 체크 — 키워드로 지수 프로그램을 새로 조회해 100위 안 순위를 줄마다 남긴다
alter table my_db add column if not exists rank_now int;          -- null = 아직 안 봄, 0 = 100위 밖
alter table my_db add column if not exists rank_prev int;
alter table my_db add column if not exists rank_at timestamptz;
alter table my_db add column if not exists rank_title text not null default '';
alter table my_db add column if not exists rank_hist jsonb not null default '[]';   -- 조회 이력 [{t, r, k}] (r 0 = 100위 밖), 최근 90번
