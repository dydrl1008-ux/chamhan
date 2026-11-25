-- 0099 콜 리스트 현황용 합계 — 권한 검사를 줄마다 하지 않는 버전 (서버에서만 호출, 화면이 역할·팀을 직접 가린다).
--   팀장 계정은 기존 함수가 업체 줄마다 팀 확인을 하느라 시간 초과가 나서 숫자가 비어 보였다
create or replace function leads_summary_all(p_date date)
returns table(assigned_to uuid, status text, cnt int)
language sql stable security definer set search_path = public as $$
  select l.assigned_to, l.status, count(*)::int from leads l
  where p_date = (now() at time zone 'Asia/Seoul')::date and l.assigned_date = p_date group by 1, 2
  union all
  select a.user_id, coalesce((select c.status from lead_contacts c where c.lead_id = a.lead_id and c.user_id = a.user_id
           and (c.created_at at time zone 'Asia/Seoul')::date = a.on_date order by c.created_at desc limit 1), 'assigned'), count(*)::int
  from lead_assignments a
  where p_date <> (now() at time zone 'Asia/Seoul')::date and a.on_date = p_date group by 1, 2 $$;
revoke all on function leads_summary_all(date) from public, anon, authenticated;
grant execute on function leads_summary_all(date) to service_role;
create index if not exists leads_assigned_date_idx on leads(assigned_date);
create index if not exists lead_assignments_on_date_idx on lead_assignments(on_date);
