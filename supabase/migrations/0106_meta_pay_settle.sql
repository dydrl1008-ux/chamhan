-- 0106 메타 결제 내역 ← 정산요청 연결. 메타팀이 정산요청에서 「인바운드」를 체크하면 그 정산 건이 결제 내역으로 자동 등록된다 (정산번호 하나에 결제 한 줄)
alter table meta_payments add column if not exists settle_seq text;
create unique index if not exists meta_payments_settle on meta_payments(settle_seq) where settle_seq is not null;
