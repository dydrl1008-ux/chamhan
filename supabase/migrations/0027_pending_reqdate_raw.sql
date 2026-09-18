-- 승인 대기 건의 원요청일(reqDate, API 검색 기준) 저장 → 승인 시 ±3일만 조회해 즉시 응답
alter table settlement_pending add column if not exists req_date_raw date;
