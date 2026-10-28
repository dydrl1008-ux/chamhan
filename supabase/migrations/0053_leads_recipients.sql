-- 0053: 콜 리스트 배분 대상 지정(app_settings.lead_recipients = uuid 목록 JSON, 비면 영업사원 전원) + 오늘 배분 수거
insert into app_settings(key, value) values ('lead_recipients', '[]') on conflict (key) do nothing;

-- 배분 대상 영업사원 (설정이 비어 있으면 전원)
create or replace function lead_recipients() returns table(id uuid, name text, team_id int)
language sql stable security definer set search_path = public as $$
  with cfg as (select coalesce(nullif(value, ''), '[]')::jsonb j from app_settings where key = 'lead_recipients')
  select sp.id, sp.name, sp.team_id from v_sales_people sp
  where not exists (select 1 from cfg where jsonb_array_length(j) > 0)
     or sp.id::text in (select jsonb_array_elements_text(j) from cfg)
$$;

-- 오늘 배분 수거: 결과 안 남긴 건(assigned)을 다시 배분 대기로. 관심·거절 등 결과 있는 건은 그대로
create or replace function leads_recall_today(p_date date default (now() at time zone 'Asia/Seoul')::date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  update leads set status = 'new', assigned_to = null, assigned_date = null where status = 'assigned' and assigned_date = p_date;
  get diagnostics n = row_count;
  delete from notifications where kind = 'lead' and link = '/calls' and created_at::date = p_date and read_at is null;
  return n;
end $$;
revoke all on function leads_recall_today(date) from public, anon;
grant execute on function leads_recall_today(date) to authenticated;

-- 배분: 대상자에게만, 사람당 lead_daily_per_person 까지 채우기
create or replace function leads_assign_today(p_date date default (now() at time zone 'Asia/Seoul')::date) returns int
language plpgsql security definer set search_path = public as $$
declare per int := coalesce((select value::int from app_settings where key = 'lead_daily_per_person'), 30);
        recontact int := coalesce((select value::int from app_settings where key = 'lead_recontact_days'), 30);
        n int := 0; r record; pick uuid;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  perform leads_rescore();
  update leads set status = 'new', assigned_to = null, assigned_date = null where status = 'assigned' and assigned_date < p_date;
  update leads set status = 'new', assigned_to = null, assigned_date = null
   where status in ('called','rejected') and last_result_at < now() - make_interval(days => recontact);
  create temp table if not exists _need(id uuid primary key, name text, remain int, got int default 0) on commit drop;
  delete from _need where true;
  insert into _need(id, name, remain)
  select sp.id, sp.name, per - (select count(*) from leads x where x.assigned_to = sp.id and x.assigned_date = p_date) from lead_recipients() sp;
  delete from _need where remain <= 0;
  if exists (select 1 from _need) then
    for r in select id from leads where status = 'new' order by score desc, id loop
      select id into pick from _need where remain > 0 order by remain desc, name, id limit 1;
      exit when pick is null;
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
