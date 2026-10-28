-- 0056: 1인당 배분 수 0 = 제한 없이 풀 전체를 배분 대상 인원수로 균등 배분 (기본값으로 변경)
update app_settings set value = '0' where key = 'lead_daily_per_person';
create or replace function leads_assign_today(p_date date default (now() at time zone 'Asia/Seoul')::date) returns int
language plpgsql security definer set search_path = public as $$
declare per int := coalesce((select value::int from app_settings where key = 'lead_daily_per_person'), 0);
        recontact int := coalesce((select value::int from app_settings where key = 'lead_recontact_days'), 3);
        only_drop boolean := coalesce((select value from app_settings where key = 'lead_only_rank_drop'), 'true') = 'true';
        n int := 0; r record; pick uuid;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  if per <= 0 then per := 1000000; end if;                      -- 0 = 제한 없음 → 풀 전체를 인원수로 나눔
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
      -- 오늘 받은 수가 가장 적은 사람부터 (번갈아) → 인원수로 균등
      select _need.id into pick from _need
       where remain > 0 and _need.id is distinct from r.rejected_by
       order by (select count(*) from leads x where x.assigned_to = _need.id and x.assigned_date = p_date) asc, name, _need.id limit 1;
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
