-- 0057: 배분 = 오늘 결과 안 남긴 건 전부 회수 후 배분 대상 인원수로 균등 재배분 (100건·5명 → 20씩)
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
  -- 결과 안 남긴 배정은 전부 회수 (오늘 것 포함) → 다시 나눔
  update leads set status = 'new', assigned_to = null, assigned_date = null where status = 'assigned';
  update leads set status = 'new', assigned_to = null, assigned_date = null,
         rejected_by = case when status = 'rejected' then last_contact_by else rejected_by end
   where status in ('called','rejected') and last_result_at < now() - make_interval(days => recontact);
  delete from notifications where kind = 'lead' and link = '/calls' and created_at::date = p_date and read_at is null;

  create temp table if not exists _need(id uuid primary key, name text, ord int, remain int, got int default 0) on commit drop;
  delete from _need where true;
  insert into _need(id, name, ord, remain)
  select sp.id, sp.name, row_number() over (order by sp.name, sp.id) - 1, case when per <= 0 then 1000000 else per end from lead_recipients() sp;
  select count(*) into np from _need;
  if np > 0 then
    for r in select id, rejected_by from leads
             where status = 'new'
               and (contact_round > 0 or not only_drop or (rank_now is not null and rank_prev is not null and rank_now > rank_prev))
             order by contact_round desc, score desc, id loop
      -- 번갈아 (i 번째 → i % 인원), 거절당한 사람이면 다음 사람. 상한 찬 사람은 건너뜀
      select _need.id into pick from _need
       where remain > 0 and _need.id is distinct from r.rejected_by
       order by got asc, ((ord - (i % np)) + np) % np, name limit 1;
      if pick is null then exit; end if;
      update leads set status = 'assigned', assigned_to = pick, assigned_date = p_date where id = r.id;
      update _need set remain = remain - 1, got = got + 1 where id = pick;
      i := i + 1;
    end loop;
    insert into notifications(user_id, kind, title, body, link)
    select id, 'lead', '오늘의 콜 리스트 ' || got || '건', '점수 높은 순으로 정리돼 있습니다.', '/calls' from _need where got > 0;
  end if;
  select count(*) into n from leads where assigned_date = p_date and status = 'assigned';
  return n;
end $$;
revoke all on function leads_assign_today(date) from public, anon;
grant execute on function leads_assign_today(date) to authenticated;
