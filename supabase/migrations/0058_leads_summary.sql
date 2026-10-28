-- 0058: 오늘 배분·결과 집계를 DB에서 (화면이 1,000행 제한에 걸려 잘못 보이던 문제)
create or replace function leads_today_summary(p_date date default (now() at time zone 'Asia/Seoul')::date)
returns table(assigned_to uuid, status text, cnt int)
language sql stable security definer set search_path = public as $$
  select assigned_to, status, count(*)::int from leads where assigned_date = p_date and (can_see_all() or assigned_to = auth.uid() or same_team(assigned_to)) group by 1, 2 $$;
grant execute on function leads_today_summary(date) to authenticated;
