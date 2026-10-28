-- 0063: 관심 → 다음 연락일. 그날 아침 그 직원 리스트 맨 위로 (약속 팔로업). 결과 안 남기면 다음날도 계속 위에
alter table leads add column if not exists next_contact_on date;
create index if not exists leads_next_idx on leads(next_contact_on) where next_contact_on is not null;

create or replace function lead_set_result(p_id bigint, p_status text, p_note text default null, p_next date default null) returns void
language plpgsql security definer set search_path = public as $$
declare last_c lead_contacts; v_round int; nxt date := case when p_status = 'interested' then p_next else null end;
begin
  if p_status not in ('called','interested','rejected','won','excluded') then raise exception '잘못된 상태'; end if;
  select * into last_c from lead_contacts where lead_id = p_id order by created_at desc limit 1;
  if found and last_c.user_id = auth.uid() and (last_c.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date then
    update lead_contacts set status = p_status, note = coalesce(p_note, note) where id = last_c.id;
    update leads set status = p_status, note = coalesce(nullif(p_note, ''), note), last_result_at = now(), next_contact_on = nxt
     where id = p_id and (assigned_to = auth.uid() or can_see_all());
    if not found then raise exception '본인에게 배정된 건만 기록할 수 있습니다'; end if;
    return;
  end if;
  update leads set status = p_status, note = coalesce(nullif(p_note, ''), note), last_result_at = now(), next_contact_on = nxt,
         contact_round = contact_round + 1, last_contact_by = auth.uid()
   where id = p_id and (assigned_to = auth.uid() or can_see_all())
   returning contact_round into v_round;
  if not found then raise exception '본인에게 배정된 건만 기록할 수 있습니다'; end if;
  insert into lead_contacts(lead_id, user_id, round, status, note) values (p_id, auth.uid(), v_round, p_status, coalesce(p_note, ''));
end $$;
-- 예전 3인자 호출도 그대로 동작
create or replace function lead_set_result(p_id bigint, p_status text, p_note text) returns void
language sql security definer set search_path = public as $$ select lead_set_result(p_id, p_status, p_note, null::date) $$;
revoke all on function lead_set_result(bigint, text, text, date) from public, anon;
grant execute on function lead_set_result(bigint, text, text, date) to authenticated;

-- 다음 연락일만 바꾸기 (관심 목록에서)
create or replace function lead_set_next(p_id bigint, p_next date) returns void
language sql security definer set search_path = public as $$
  update leads set next_contact_on = p_next where id = p_id and status in ('interested', 'assigned') and (assigned_to = auth.uid() or last_contact_by = auth.uid() or can_see_all()) $$;
revoke all on function lead_set_next(bigint, date) from public, anon;
grant execute on function lead_set_next(bigint, date) to authenticated;

create or replace function leads_assign_today(p_date date default (now() at time zone 'Asia/Seoul')::date) returns int
language plpgsql security definer set search_path = public as $$
declare per int := coalesce((select value::int from app_settings where key = 'lead_daily_per_person'), 0);
        recontact int := coalesce((select value::int from app_settings where key = 'lead_recontact_days'), 3);
        only_drop boolean := coalesce((select value from app_settings where key = 'lead_only_rank_drop'), 'true') = 'true';
        n int := 0; np int; r record; pick uuid; i int := 0;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  perform leads_rescore();
  perform leads_exclude_ours();
  -- 회수: 약속 팔로업(next_contact_on 있음)은 관심으로 되돌리고, 나머지는 배분 대기로
  update leads set status = case when next_contact_on is not null then 'interested' else 'new' end,
         assigned_to = case when next_contact_on is not null then assigned_to else null end,
         assigned_date = null
   where status = 'assigned';
  update leads set status = 'new', assigned_to = null, assigned_date = null,
         rejected_by = case when status = 'rejected' then last_contact_by else rejected_by end
   where status in ('called','rejected') and last_result_at < now() - make_interval(days => recontact);
  delete from notifications where kind = 'lead' and link = '/calls' and created_at::date = p_date and read_at is null;
  -- 약속일 된 관심 업체 → 그 직원에게 (맨 위에 뜸)
  update leads set status = 'assigned', assigned_to = coalesce(last_contact_by, assigned_to), assigned_date = p_date
   where status = 'interested' and next_contact_on is not null and next_contact_on <= p_date and coalesce(last_contact_by, assigned_to) is not null;

  create temp table if not exists _need(id uuid primary key, name text, ord int, remain int, got int default 0) on commit drop;
  delete from _need where true;
  insert into _need(id, name, ord, remain)
  select sp.id, sp.name, row_number() over (order by sp.name, sp.id) - 1,
         case when per <= 0 then 1000000 else per - (select count(*) from leads x where x.assigned_to = sp.id and x.assigned_date = p_date) end
  from lead_recipients() sp;
  delete from _need where remain <= 0;
  select count(*) into np from _need;
  if np > 0 then
    for r in select id, rejected_by from leads
             where status = 'new'
               and (contact_round > 0 or not only_drop or (rank_now is not null and rank_prev is not null and rank_now > rank_prev))
             order by contact_round desc, score desc, id loop
      select _need.id into pick from _need where remain > 0 and _need.id is distinct from r.rejected_by order by got asc, ((ord - (i % np)) + np) % np, name limit 1;
      if pick is null then exit; end if;
      update leads set status = 'assigned', assigned_to = pick, assigned_date = p_date where id = r.id;
      update _need set remain = remain - 1, got = got + 1 where id = pick;
      i := i + 1;
    end loop;
  end if;
  insert into notifications(user_id, kind, title, body, link)
  select assigned_to, 'lead', '오늘의 콜 리스트 ' || count(*) || '건' || case when count(*) filter (where next_contact_on is not null) > 0 then ' · 약속 팔로업 ' || count(*) filter (where next_contact_on is not null) || '건' else '' end, '점수 높은 순으로 정리돼 있습니다.', '/calls'
  from leads where assigned_date = p_date and status = 'assigned' group by assigned_to;
  select count(*) into n from leads where assigned_date = p_date and status = 'assigned';
  return n;
end $$;
revoke all on function leads_assign_today(date) from public, anon;
grant execute on function leads_assign_today(date) to authenticated;
