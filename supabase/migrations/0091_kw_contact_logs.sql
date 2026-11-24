-- 0091 키워드 콜 이전 기록 — 부재·거절로 남긴 업체를 다른 직원이 이어받을 때 전 담당자의 결과·메모를 여기 남긴다 (콜 수도 전 담당자 몫으로 유지)
create table if not exists kw_contact_logs (
  id         bigserial primary key,
  contact_id bigint not null references kw_contacts(id) on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  result     text not null default '',
  memo       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kw_contact_logs_contact on kw_contact_logs(contact_id);
create index if not exists kw_contact_logs_user on kw_contact_logs(user_id, created_at);
alter table kw_contact_logs enable row level security;
