-- 0095 내 DB 결제 예상 금액
alter table my_db add column if not exists expect_amt bigint;
