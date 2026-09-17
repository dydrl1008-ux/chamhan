-- =====================================================================
-- 1-C 보강 : 출근 시각 수정 요청(총괄 승인) · 과거 시각 입력 차단 · 지각은 총괄 직접 승인
-- =====================================================================

-- ---------- 출퇴근 기록: 현재 KST 시각 이전 입력 차단 (허용 오차 -1분 / +10분) ----------
create or replace function attendance_check(p_kind text, p_time time, p_ip text, p_ua text)
returns attendance language plpgsql security definer set search_path=public as $$
declare v_now timestamp := (now() at time zone 'Asia/Seoul'); v_today date; v_nowt time; r attendance;
begin
  if auth.uid() is null then raise exception 'login required' using errcode='42501'; end if;
  v_today := v_now::date; v_nowt := v_now::time;
  if p_time < v_nowt - interval '1 minute' then
    raise exception '현재 시각(%) 이전으로 기록할 수 없습니다. 잘못 기록했으면 수정 요청을 이용하세요', to_char(v_nowt,'HH24:MI') using errcode='P0001';
  end if;
  if p_time > v_nowt + interval '10 minutes' then
    raise exception '미래 시각으로 기록할 수 없습니다' using errcode='P0001';
  end if;
  if p_kind = 'in' then
    insert into attendance(user_id, work_date, check_in, check_in_ip, check_in_ua)
    values (auth.uid(), v_today, p_time, safe_inet(p_ip), p_ua)
    on conflict (user_id, work_date) do update set check_in = coalesce(attendance.check_in, excluded.check_in)
    returning * into r;
  elsif p_kind = 'out' then
    update attendance set check_out = p_time, check_out_ip = safe_inet(p_ip), check_out_ua = p_ua
    where user_id = auth.uid() and work_date = v_today and check_in is not null
    returning * into r;
    if r.id is null then raise exception '출근 기록이 없습니다' using errcode='P0001'; end if;
  else raise exception 'bad kind'; end if;
  return r;
end $$;

-- ---------- 수정 요청 ----------
create table if not exists attendance_corrections (
  id            bigserial primary key,
  attendance_id bigint not null references attendance(id),
  user_id       uuid not null references profiles(id),
  field         text not null check (field in ('check_in','check_out')),
  old_time      time,
  new_time      time not null,
  reason        text not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by    uuid references profiles(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists att_corr_status on attendance_corrections(status, created_at desc);
create unique index if not exists att_corr_one_pending on attendance_corrections(attendance_id, field) where status='pending';
drop trigger if exists att_corr_audit on attendance_corrections;
create trigger att_corr_audit after insert or update or delete on attendance_corrections for each row execute function audit_row();

alter table attendance_corrections enable row level security;
drop policy if exists ac_select on attendance_corrections;
create policy ac_select on attendance_corrections for select using (user_id = auth.uid() or can_see_all() or same_team(user_id));
drop policy if exists ac_insert on attendance_corrections;
create policy ac_insert on attendance_corrections for insert with check (
  user_id = auth.uid() and status = 'pending'
  and exists (select 1 from attendance a where a.id = attendance_id and a.user_id = auth.uid()));
-- update 는 함수(decide_correction)로만. 직접 update 정책 없음.

-- 요청 등록 (old_time 자동 채움)
create or replace function request_correction(p_attendance bigint, p_field text, p_new time, p_reason text)
returns attendance_corrections language plpgsql security definer set search_path=public as $$
declare a attendance; r attendance_corrections;
begin
  if auth.uid() is null then raise exception 'login required' using errcode='42501'; end if;
  select * into a from attendance where id = p_attendance and user_id = auth.uid();
  if a.id is null then raise exception '본인 출퇴근 기록만 수정 요청할 수 있습니다' using errcode='42501'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception '사유를 입력하세요' using errcode='P0001'; end if;
  insert into attendance_corrections(attendance_id,user_id,field,old_time,new_time,reason)
  values (a.id, auth.uid(), p_field, case p_field when 'check_in' then a.check_in else a.check_out end, p_new, p_reason)
  returning * into r;
  return r;
end $$;

-- 승인/반려 (총괄·어드민만). 승인 시 attendance 반영 → is_late 트리거로 재판정
create or replace function decide_correction(p_id bigint, p_status text)
returns attendance_corrections language plpgsql security definer set search_path=public as $$
declare r attendance_corrections;
begin
  if auth.uid() is not null and my_role() not in ('admin','head') then
    raise exception '수정 요청 승인은 총괄·어드민만 가능합니다' using errcode='42501';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'bad status'; end if;
  update attendance_corrections set status = p_status, decided_by = auth.uid(), decided_at = now()
  where id = p_id and status = 'pending' returning * into r;
  if r.id is null then raise exception '이미 처리됐거나 없는 요청입니다' using errcode='P0001'; end if;
  if p_status = 'approved' then
    if r.field = 'check_in' then update attendance set check_in = r.new_time where id = r.attendance_id;
    else update attendance set check_out = r.new_time where id = r.attendance_id; end if;
  end if;
  return r;
end $$;

-- ---------- 지각·무단결근은 팀장 팀승인 없이 총괄 직접 승인 ----------
create or replace function guard_leave_final_approval() returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if auth.uid() is not null and my_role() not in ('admin','head') then
      raise exception '최종 승인은 총괄·어드민만 가능합니다' using errcode='42501';
    end if;
    new.decided_by := coalesce(new.decided_by, auth.uid());
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  if new.team_approved_at is not null and (tg_op='INSERT' or old.team_approved_at is null) then
    if new.type in ('late','absent') and auth.uid() is not null and my_role() = 'manager' then
      raise exception '지각·무단결근은 총괄이 직접 승인합니다' using errcode='42501';
    end if;
    new.team_approved_by := coalesce(new.team_approved_by, auth.uid());
  end if;
  return new;
end $$;
