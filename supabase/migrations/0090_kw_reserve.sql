-- 0090 키워드 요청 건 우선권 — 직원이 요청한 키워드로 올라온 업체는 요청자에게 7일간 우선 배정 (그 동안 다른 직원은 결과를 못 남김)
alter table kw_contacts add column if not exists reserved_by uuid references profiles(id) on delete set null;
alter table kw_contacts add column if not exists reserved_until timestamptz;
alter table kw_contacts add column if not exists reserved_kw text not null default '';
create index if not exists kw_contacts_reserved on kw_contacts(reserved_by) where reserved_by is not null;
create index if not exists kw_contacts_result_at on kw_contacts(result_at) where result_at is not null;
