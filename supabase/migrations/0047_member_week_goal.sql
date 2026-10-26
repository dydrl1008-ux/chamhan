-- 0047: 월간 계획서 사람별 주차 「목표」 자유 항목 (재계약 n건 마감 · 업셀 · 콜 … 사람마다 다름)
alter table monthly_plan_member_weeks add column if not exists goal text;
