-- 0098 순위 체크에 지수(클릭·판매·품질) — 조회할 때 같이 저장해 상승·하락을 본다
alter table rank_watch_ranks add column if not exists cur_click numeric;
alter table rank_watch_ranks add column if not exists prev_click numeric;
alter table rank_watch_ranks add column if not exists cur_sale numeric;
alter table rank_watch_ranks add column if not exists prev_sale numeric;
alter table rank_watch_ranks add column if not exists cur_quality numeric;
alter table rank_watch_ranks add column if not exists prev_quality numeric;
alter table rank_watch_hist add column if not exists click numeric;
alter table rank_watch_hist add column if not exists sale numeric;
alter table rank_watch_hist add column if not exists quality numeric;
