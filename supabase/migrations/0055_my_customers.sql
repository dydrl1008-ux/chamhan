-- 0055: 내 고객 — 직원이 직접 적는 기존 고객 목록. 콜 리스트에서 자동 제외 (정산 사이트 고객도 함께 제외)
create table if not exists my_customers (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  phone      text not null default '',
  memo       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists my_customers_user_idx on my_customers(user_id);
alter table my_customers enable row level security;
drop policy if exists mc_sel on my_customers;
create policy mc_sel on my_customers for select using (user_id = auth.uid() or can_see_all());   -- 본인 + 총괄·대표만 (팀장도 못 봄)
drop policy if exists mc_write on my_customers;
create policy mc_write on my_customers for all using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

create or replace function norm_name(t text) returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(t, ''), '\s|\(주\)|주식회사|스토어|store|공식|몰$', '', 'g')) $$;

-- 리드 쪽 비교 키를 저장해 두고(인덱스) 집합 조인으로 한 번에 — 행마다 함수 호출 안 함
alter table leads add column if not exists name_key text generated always as (norm_name(store_name)) stored;
alter table leads add column if not exists phone_key text generated always as (regexp_replace(phone, '\D', '', 'g')) stored;
create index if not exists leads_name_key_idx on leads(name_key);
create index if not exists leads_phone_key_idx on leads(phone_key);

-- 우리 고객 키 목록 (내 고객 + 정산 고객)
create or replace function our_customer_keys() returns table(k text, why text)
language sql stable security definer set search_path = public as $$
  select 'n:' || norm_name(c.name), c.name || ' (' || coalesce(p.name, '') || ' 고객)' from my_customers c join profiles p on p.id = c.user_id where norm_name(c.name) <> ''
  union all
  select 'p:' || regexp_replace(c.phone, '\D', '', 'g'), c.name || ' (' || coalesce(p.name, '') || ' 고객)' from my_customers c join profiles p on p.id = c.user_id where length(regexp_replace(c.phone, '\D', '', 'g')) = 11
  union all
  select 'n:' || norm_name(cust_name), '정산 고객 ' || cust_name from settlement_customers where norm_name(cust_name) <> ''
  union all
  select 'p:' || regexp_replace(coalesce(cust_tel, ''), '\D', '', 'g'), '정산 고객 ' || cust_name from settlement_customers where length(regexp_replace(coalesce(cust_tel, ''), '\D', '', 'g')) = 11
$$;

-- 우리 고객인가? (단건 조회용)
create or replace function lead_is_ours(p_name text, p_phone text) returns text
language sql stable security definer set search_path = public as $$
  select why from our_customer_keys() where k = 'n:' || norm_name(p_name) or k = 'p:' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') limit 1 $$;

create or replace function leads_exclude_ours() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  create temp table if not exists _ours(k text primary key, why text) on commit drop;
  delete from _ours where true;
  insert into _ours select k, min(why) from our_customer_keys() group by k;
  update leads l set status = 'excluded', note = left('기존 고객: ' || o.why || case when l.note <> '' then ' · ' || l.note else '' end, 1000), last_result_at = now()
  from _ours o
  where l.status in ('new', 'assigned') and ((l.name_key <> '' and o.k = 'n:' || l.name_key) or (length(l.phone_key) = 11 and o.k = 'p:' || l.phone_key));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function leads_exclude_ours() from public, anon;
grant execute on function leads_exclude_ours() to authenticated;

-- 내 고객 추가하면 바로 콜 리스트에서 빠지게
create or replace function my_customers_exclude() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update leads l set status = 'excluded', note = left('기존 고객: ' || new.name || ' (' || (select name from profiles where id = new.user_id) || ' 고객)' || case when l.note <> '' then ' · ' || l.note else '' end, 1000), last_result_at = now()
   where l.status in ('new', 'assigned')
     and ((norm_name(new.name) <> '' and l.name_key = norm_name(new.name))
       or (length(regexp_replace(new.phone, '\D', '', 'g')) = 11 and l.phone_key = regexp_replace(new.phone, '\D', '', 'g')));
  return new;
end $$;
drop trigger if exists my_customers_exclude_trg on my_customers;
create trigger my_customers_exclude_trg after insert or update on my_customers for each row execute function my_customers_exclude();
-- 배분 함수 앞단에서 제외 실행 (0054 함수 본문에 한 줄만 추가)
create or replace function leads_assign_today(p_date date default (now() at time zone 'Asia/Seoul')::date) returns int
language plpgsql security definer set search_path = public as $$
declare per int := coalesce((select value::int from app_settings where key = 'lead_daily_per_person'), 30);
        recontact int := coalesce((select value::int from app_settings where key = 'lead_recontact_days'), 3);
        only_drop boolean := coalesce((select value from app_settings where key = 'lead_only_rank_drop'), 'true') = 'true';
        n int := 0; r record; pick uuid;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  perform leads_rescore();
  perform leads_exclude_ours();
  update leads set status = 'new', assigned_to = null, assigned_date = null where status = 'assigned' and assigned_date < p_date;
  update leads set status = 'new', assigned_to = null, assigned_date = null,
         rejected_by = case when status = 'rejected' then last_contact_by else rejected_by end
   where status in ('called','rejected') and last_result_at < now() - make_interval(days => recontact);
  create temp table if not exists _need(id uuid primary key, name text, remain int, got int default 0) on commit drop;
  delete from _need where true;
  insert into _need(id, name, remain)
  select sp.id, sp.name, per - (select count(*) from leads x where x.assigned_to = sp.id and x.assigned_date = p_date) from lead_recipients() sp;
  delete from _need where remain <= 0;
  if exists (select 1 from _need) then
    for r in select id, last_contact_by, rejected_by from leads
             where status = 'new'
               and (contact_round > 0 or not only_drop or (rank_now is not null and rank_prev is not null and rank_now > rank_prev))
             order by contact_round desc, score desc, id loop
      select id into pick from _need where remain > 0 and id is distinct from r.rejected_by order by remain desc, name, id limit 1;
      if pick is null then
        if exists (select 1 from _need where remain > 0) then continue; end if;
        exit;
      end if;
      update leads set status = 'assigned', assigned_to = pick, assigned_date = p_date where id = r.id;
      update _need set remain = remain - 1, got = got + 1 where id = pick;
    end loop;
    insert into notifications(user_id, kind, title, body, link)
    select id, 'lead', '오늘의 콜 리스트 +' || got || '건', '점수 높은 순으로 정리돼 있습니다.', '/calls' from _need where got > 0;
  end if;
  select count(*) into n from leads where assigned_date = p_date and status = 'assigned';
  return n;
end $$;
revoke all on function leads_assign_today(date) from public, anon;
grant execute on function leads_assign_today(date) to authenticated;
