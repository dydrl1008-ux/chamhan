-- 콜 리스트 배분 이력 — 다음 날 회수돼도 「그날 누구에게 뭐가 배분됐고 결과가 뭐였나」 남김 (오늘부터 쌓임)
create table if not exists lead_assignments (
  id         bigserial primary key,
  lead_id    bigint not null references leads(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  on_date    date not null,
  created_at timestamptz not null default now(),
  unique (lead_id, user_id, on_date)
);
create index if not exists lead_assignments_day_idx on lead_assignments(on_date, user_id);
alter table lead_assignments enable row level security;
drop policy if exists la_sel on lead_assignments; create policy la_sel on lead_assignments for select to authenticated using (can_see_all() or user_id = auth.uid() or same_team(user_id));

-- 배정될 때마다 기록 (배분 함수·회신 리드·수동 배정 전부)
create or replace function lead_assignments_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and new.assigned_date is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to or new.assigned_date is distinct from old.assigned_date) then
    insert into lead_assignments(lead_id, user_id, on_date) values (new.id, new.assigned_to, new.assigned_date) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists lead_assignments_trg on leads;
create trigger lead_assignments_trg after insert or update of assigned_to, assigned_date on leads for each row execute function lead_assignments_log();

-- 현재 배정분도 이력에 넣어둠 (오늘 것)
insert into lead_assignments(lead_id, user_id, on_date) select id, assigned_to, assigned_date from leads where assigned_to is not null and assigned_date is not null on conflict do nothing;

-- 그날 결과: 그 담당자가 그날(KST) 남긴 마지막 콜 기록 상태, 없으면 'assigned'(남음)
create or replace function leads_day_summary(p_date date)
returns table(assigned_to uuid, status text, cnt int)
language sql stable security definer set search_path = public as $$
  select a.user_id, coalesce((select c.status from lead_contacts c where c.lead_id = a.lead_id and c.user_id = a.user_id
                                and (c.created_at at time zone 'Asia/Seoul')::date = a.on_date order by c.created_at desc limit 1), 'assigned'), count(*)::int
  from lead_assignments a
  where a.on_date = p_date and (can_see_all() or a.user_id = auth.uid() or same_team(a.user_id))
  group by 1, 2 $$;
grant execute on function leads_day_summary(date) to authenticated;

-- 그날 그 사람 리스트 (결과는 그날 기준으로 덮어씀)
create or replace function leads_day_list(p_date date, p_user uuid)
returns table(id bigint, store_name text, store_url text, product_url text, keyword text, category text, phone text, score int, score_why text, status text, note text, contact_round int, rank_now int, rank_prev int, next_contact_on date)
language sql stable security definer set search_path = public as $$
  select l.id, l.store_name, l.store_url, l.product_url, l.keyword, l.category, l.phone, l.score, l.score_why,
         coalesce(c.status, 'assigned'), coalesce(c.note, l.note), l.contact_round, l.rank_now, l.rank_prev, l.next_contact_on
  from lead_assignments a join leads l on l.id = a.lead_id
  left join lateral (select status, note from lead_contacts x where x.lead_id = a.lead_id and x.user_id = a.user_id and (x.created_at at time zone 'Asia/Seoul')::date = a.on_date order by x.created_at desc limit 1) c on true
  where a.on_date = p_date and a.user_id = p_user and (can_see_all() or a.user_id = auth.uid() or same_team(a.user_id))
  order by l.score desc, l.id $$;
grant execute on function leads_day_list(date, uuid) to authenticated;
