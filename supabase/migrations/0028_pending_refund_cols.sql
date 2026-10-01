-- 승인 대기: 환불 건 전용 금액 (사이트 조회 뷰의 영업이익은 환불 건에선 의미 없음)
alter table settlement_pending add column if not exists refund_sale_total bigint;   -- 환불 상품가 기준 (상품가×유입×환불일수)
alter table settlement_pending add column if not exists refund_prod_total bigint;   -- 환불금액 (판매가 기준, 승인 시 입금 확정액)
alter table settlement_pending add column if not exists refund_rate_amt bigint;     -- 환불수수료 (담당자 차감)
alter table settlement_pending add column if not exists refund_work_day int;
alter table settlement_pending add column if not exists refund_gubun_name text;
