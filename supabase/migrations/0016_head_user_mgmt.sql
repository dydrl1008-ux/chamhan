-- 총책임자(head): 직원·팀장·총책임자 계정 등록/수정 가능 (admin 계정·admin 승격은 불가)
create or replace function admin_upsert_profile(
  p_id uuid, p_name text, p_email text, p_role user_role, p_team int,
  p_is_mgmt boolean, p_position text, p_hired date, p_annual numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and my_role() not in ('admin','head') then raise exception 'admin/head only' using errcode='42501'; end if;
  if auth.uid() is not null and my_role() = 'head' and p_role = 'admin' then raise exception '총책임자는 어드민 계정을 만들 수 없습니다' using errcode='42501'; end if;
  insert into profiles(id,name,email,role,team_id,is_mgmt,position,hired_at,annual_leave_granted)
  values (p_id,p_name,p_email,p_role,p_team,coalesce(p_is_mgmt,false),p_position,p_hired,coalesce(p_annual,0))
  on conflict (id) do update set
    name=excluded.name, email=excluded.email, role=excluded.role, team_id=excluded.team_id,
    is_mgmt=excluded.is_mgmt, position=excluded.position, hired_at=excluded.hired_at,
    annual_leave_granted=excluded.annual_leave_granted;
end $$;
-- head 의 profiles 수정: 대상이 admin 이 아니고, admin 으로 바꾸지 않는 경우만
drop policy if exists profiles_head_update on profiles;
create policy profiles_head_update on profiles for update
  using (my_role()='head' and role <> 'admin') with check (my_role()='head' and role <> 'admin');
drop policy if exists teams_head_write on teams;
create policy teams_head_write on teams for all using (my_role()='head') with check (my_role()='head');
