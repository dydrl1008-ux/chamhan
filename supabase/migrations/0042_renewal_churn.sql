-- ============================================================================
-- 0042 · 이탈 고객 관리 (미결제 1주·2주 알림 → 포기 → 분배)
--   연장 체크가 찾은 「이탈」(작업이 끝났는데 연장 정산이 없는 업체)을 따로 쌓아 둠
--   · 종료 후 7일·14일 지나도 연장이 없으면 담당자에게 워크허브 알림 (사람별로 1건에 묶어서)
--   · 담당자가 「포기」 → 포기 업체 목록 → 어드민·총괄이 다른 영업사원에게 분배
--   · 누가 팔든 같은 업체·상품 정산이 새로 올라오면 자동으로 「연장됨」
-- ============================================================================

create table if not exists renewal_churn (
  id             bigserial primary key,
  owner_id       uuid not null references profiles(id) on delete cascade,   -- 원래 담당
  cust_name      text not null,
  prod_name      text not null,
  biz_no         text not null default '',
  slots          int  not null default 0,
  date_to        date not null,                                             -- 마지막 작업 종료일
  status         text not null default 'open'
                 check (status in ('open', 'given_up', 'reassigned', 'renewed', 'closed')),
  alert_level    int  not null default 0,                                   -- 0 없음 · 1 1주 알림 보냄 · 2 2주 알림 보냄
  give_up_reason text not null default '',
  given_up_at    timestamptz,
  assignee_id    uuid references profiles(id) on delete set null,           -- 분배받은 사람
  assigned_at    timestamptz,
  closed_reason  text not null default '',
  renewed_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, cust_name, prod_name, date_to)
);
create index if not exists renewal_churn_status_idx on renewal_churn(status);
create index if not exists renewal_churn_assignee_idx on renewal_churn(assignee_id) where assignee_id is not null;
drop trigger if exists renewal_churn_updated on renewal_churn;
create trigger renewal_churn_updated before update on renewal_churn for each row execute function set_updated_at();

alter table renewal_churn enable row level security;
drop policy if exists churn_read on renewal_churn;
create policy churn_read on renewal_churn for select to authenticated
  using (owner_id = auth.uid() or assignee_id = auth.uid() or can_see_all());
drop policy if exists churn_worker on renewal_churn;
create policy churn_worker on renewal_churn for select to ai_worker using (true);
grant select on renewal_churn to ai_worker;

-- 직원 → 정산 사이트 직원ID (ai_renewal_rows 와 같은 규칙)
create or replace function settle_empl_of(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(m.empl_id, c.settle_user_id, split_part(p.email, '@', 1))
  from profiles p
  left join settlement_empl_map m on m.user_id = p.id
  left join settlement_credentials c on c.user_id = p.id
  where p.id = p_user limit 1;
$$;
revoke all on function settle_empl_of(uuid) from public, anon, authenticated;

-- ── 매일 동기화 (연장 체크 때 실행기가 호출) ───────────────────────────────────
create or replace function renewal_churn_sync(p_date date default (now() at time zone 'Asia/Seoul')::date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_new int := 0; n_renewed int := 0; n_w1 int := 0; n_w2 int := 0; n_wait int; n_people int := 0; r record;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;

  -- 1) 최근 30일 안에 끝나고 연장 없는 업체를 쌓음
  with x as (
    select owner_id, cust_name, prod_name, slots, date_to
    from ai_renewal_rows(p_date, 3, 30) where kind = 'churned' and owner_id is not null
  ), ins as (
    insert into renewal_churn(owner_id, cust_name, prod_name, slots, date_to, biz_no)
    select x.owner_id, x.cust_name, x.prod_name, x.slots, x.date_to,
           coalesce((select coalesce(s.raw->>'bizNo', s.raw->>'custBizNo', '') from settlement_items s
                     where trim(s.raw->>'custName') = x.cust_name and coalesce(s.raw->>'bizNo', s.raw->>'custBizNo', '') <> ''
                     limit 1), '')
    from x
    on conflict (owner_id, cust_name, prod_name, date_to) do nothing
    returning 1)
  select count(*) into n_new from ins;

  -- 2) 같은 업체·상품의 새 정산이 올라왔으면 (누가 팔았든) 연장됨
  with upd as (
    update renewal_churn c set status = 'renewed', renewed_at = now()
    where c.status in ('open', 'given_up', 'reassigned')
      and exists (select 1 from settlement_items s
                  where trim(s.raw->>'custName') = c.cust_name and trim(s.raw->>'prodName') = c.prod_name
                    and coalesce(s.raw->>'refundInd', '') <> 'Y' and s.status in ('승인완료', '승인요청')
                    and (s.raw->>'dateWorkTo') ~ '^\d{4}-\d{2}-\d{2}' and (s.raw->>'dateWorkTo')::date > c.date_to)
    returning 1)
  select count(*) into n_renewed from upd;

  -- 3) 미결제 1주·2주 알림 (담당자별로 한 건에 묶음, 같은 단계는 한 번만)
  for r in
    select owner_id,
           string_agg(case when lvl = 2 then '🔴 2주 ' else '🟡 1주 ' end || cust_name || ' (' || prod_name || ', ' || to_char(date_to, 'MM/DD') || ' 종료)', E'\n' order by lvl desc, date_to) body,
           count(*) filter (where lvl = 1) w1, count(*) filter (where lvl = 2) w2
    from (select c.*, case when p_date - c.date_to >= 14 then 2 when p_date - c.date_to >= 7 then 1 else 0 end lvl
          from renewal_churn c where c.status = 'open') t
    where lvl > alert_level
    group by owner_id
  loop
    insert into notifications(user_id, kind, title, body, link)
    values (r.owner_id, 'alert',
            '연장 미결제 ' || (r.w1 + r.w2) || '곳' || case when r.w2 > 0 then ' (2주 ' || r.w2 || ')' else '' end,
            r.body || E'\n\n연장이 어려우면 「이탈 고객」에서 포기로 넘기세요. 다른 영업사원에게 분배됩니다.', '/renewals');
    n_w1 := n_w1 + r.w1; n_w2 := n_w2 + r.w2; n_people := n_people + 1;
  end loop;
  update renewal_churn c set alert_level = case when p_date - c.date_to >= 14 then 2 else 1 end
   where c.status = 'open' and p_date - c.date_to >= 7
     and alert_level < case when p_date - c.date_to >= 14 then 2 else 1 end;

  select count(*) into n_wait from renewal_churn where status = 'given_up';
  return jsonb_build_object('new', n_new, 'renewed', n_renewed, 'week1', n_w1, 'week2', n_w2, 'people', n_people, 'waiting', n_wait);
end $$;
revoke all on function renewal_churn_sync(date) from public, anon;
grant execute on function renewal_churn_sync(date) to authenticated, ai_worker;

-- ── 포기 ─────────────────────────────────────────────────────────────────────
--   원래 담당이 포기 → given_up (분배 대기) · 분배받은 사람이 포기 → closed (끝)
create or replace function renewal_give_up(p_id bigint, p_reason text default '')
returns text language plpgsql security definer set search_path = public as $$
declare c renewal_churn;
begin
  select * into c from renewal_churn where id = p_id for update;
  if not found then raise exception '없는 건'; end if;
  if c.status = 'open' and (c.owner_id = auth.uid() or can_see_all()) then
    update renewal_churn set status = 'given_up', given_up_at = now(), give_up_reason = left(coalesce(p_reason, ''), 300) where id = p_id;
    return 'given_up';
  elsif c.status = 'reassigned' and (c.assignee_id = auth.uid() or can_see_all()) then
    update renewal_churn set status = 'closed', closed_reason = left(coalesce(p_reason, ''), 300) where id = p_id;
    return 'closed';
  end if;
  raise exception '포기할 수 없는 상태입니다';
end $$;
revoke all on function renewal_give_up(bigint, text) from public, anon;
grant execute on function renewal_give_up(bigint, text) to authenticated;

-- 포기 취소 (실수로 누른 경우, 분배 전까지)
create or replace function renewal_undo_give_up(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update renewal_churn set status = 'open', given_up_at = null, give_up_reason = ''
   where id = p_id and status = 'given_up' and (owner_id = auth.uid() or can_see_all());
  if not found then raise exception '되돌릴 수 없습니다 (이미 분배됨)'; end if;
end $$;
revoke all on function renewal_undo_give_up(bigint) from public, anon;
grant execute on function renewal_undo_give_up(bigint) to authenticated;

-- ── 분배 (어드민·총괄) ────────────────────────────────────────────────────────
--   p_to 를 주면 그 사람에게, 비우면 영업사원(원래 담당 제외)에게 지금 맡은 수가 적은 사람부터 번갈아
create or replace function renewal_reassign(p_ids bigint[], p_to uuid default null)
returns table(id bigint, assignee_id uuid, assignee text, biz_no text, empl_id text)
language plpgsql security definer set search_path = public as $$
declare c record; pick uuid;
begin
  if not can_see_all() then raise exception '권한 없음'; end if;
  for c in select * from renewal_churn r where r.id = any(p_ids) and r.status = 'given_up' order by r.date_to loop
    if p_to is not null then
      pick := p_to;
    else
      select sp.id into pick from v_sales_people sp
       where sp.id <> c.owner_id
       order by (select count(*) from renewal_churn x where x.assignee_id = sp.id and x.status = 'reassigned'), random()
       limit 1;
    end if;
    if pick is null then raise exception '분배할 영업사원이 없습니다'; end if;
    if pick = c.owner_id then raise exception '원래 담당에게는 분배할 수 없습니다 (%)', c.cust_name; end if;
    update renewal_churn r set status = 'reassigned', assignee_id = pick, assigned_at = now() where r.id = c.id;
    insert into notifications(user_id, kind, title, body, link)
    values (pick, 'lead', '이탈 고객 분배: ' || c.cust_name,
            c.cust_name || ' (' || c.prod_name || ', ' || to_char(c.date_to, 'MM/DD') || ' 종료)'
            || case when c.give_up_reason <> '' then E'\n원래 담당 메모: ' || c.give_up_reason else '' end, '/renewals');
    id := c.id; assignee_id := pick; assignee := (select name from profiles where profiles.id = pick);
    biz_no := c.biz_no; empl_id := settle_empl_of(pick);
    return next;
  end loop;
end $$;
revoke all on function renewal_reassign(bigint[], uuid) from public, anon;
grant execute on function renewal_reassign(bigint[], uuid) to authenticated;

-- ── 검사기: 포기 업체가 3일 넘게 분배 안 됨 ───────────────────────────────────
create or replace function ai_chk_churn_waiting() returns table(status text, seen int, detail text)
language plpgsql stable security definer set search_path = public as $$
declare n int; old int;
begin
  select count(*), count(*) filter (where given_up_at < now() - interval '3 days') into n, old
  from renewal_churn where renewal_churn.status = 'given_up';
  if old > 0 then return query select 'warn'::text, n, '포기 업체 ' || old || '곳이 3일 넘게 분배 안 됨 (이탈 고객 › 분배)'; return; end if;
  return query select 'ok'::text, n, '분배 대기 ' || n || '곳';
end $$;
revoke all on function ai_chk_churn_waiting() from public, anon, authenticated;
grant execute on function ai_chk_churn_waiting() to ai_worker;

insert into ai_checks(slug, name, description, fn, sort) values
  ('churn_waiting', '이탈 고객 분배', '담당자가 포기한 업체가 3일 넘게 분배 안 된 채 남아 있지 않은지', 'ai_chk_churn_waiting', 8)
on conflict (slug) do update set name = excluded.name, description = excluded.description, fn = excluded.fn, sort = excluded.sort;
