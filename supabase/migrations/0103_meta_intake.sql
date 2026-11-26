-- 0103 메타 인바운드 자동 접수 — 접수 시트(상담신청 · 바이럴 접수)의 줄을 접수 ID 로 구분해 한 번만 넣는다. 유입 경로(광고 세트)도 저장
alter table meta_leads add column if not exists ext_id text;            -- 접수 ID (sub_… / vir_…)
alter table meta_leads add column if not exists inflow text not null default '';   -- 유입 경로 원문 (ig / paid / 캠페인 / 광고세트)
alter table meta_leads add column if not exists received_at timestamptz;          -- 접수 시각 (날짜만이 아니라 시각까지)
create unique index if not exists meta_leads_ext on meta_leads(ext_id) where ext_id is not null;
