-- 0060: 콜 결과 수정 — 같은 날 같은 사람이 다시 누르면 차수 안 올리고 '수정'으로 처리 + 「되돌리기」(오늘 기록 삭제 → 미기록)
create or replace function lead_set_result(p_id bigint, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare last_c lead_contacts; v_round int;
begin
  if p_status not in ('called','interested','rejected','won','excluded') then raise exception '잘못된 상태'; end if;
  select * into last_c from lead_contacts where lead_id = p_id order by created_at desc limit 1;
  if found and last_c.user_id = auth.uid() and (last_c.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date then
    -- 오늘 내가 남긴 기록이 있으면 그걸 고침 (차수 유지)
    update lead_contacts set status = p_status, note = coalesce(p_note, note) where id = last_c.id;
    update leads set status = p_status, note = coalesce(nullif(p_note, ''), note), last_result_at = now()
     where id = p_id and (assigned_to = auth.uid() or can_see_all());
    if not found then raise exception '본인에게 배정된 건만 기록할 수 있습니다'; end if;
    return;
  end if;
  update leads set status = p_status, note = coalesce(nullif(p_note, ''), note), last_result_at = now(),
         contact_round = contact_round + 1, last_contact_by = auth.uid()
   where id = p_id and (assigned_to = auth.uid() or can_see_all())
   returning contact_round into v_round;
  if not found then raise exception '본인에게 배정된 건만 기록할 수 있습니다'; end if;
  insert into lead_contacts(lead_id, user_id, round, status, note) values (p_id, auth.uid(), v_round, p_status, coalesce(p_note, ''));
end $$;

-- 되돌리기: 오늘 내가 남긴 마지막 기록 삭제 → 차수 -1, 다시 오늘 리스트(assigned)로
create or replace function lead_undo_result(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare last_c lead_contacts; prev_c lead_contacts;
begin
  select * into last_c from lead_contacts where lead_id = p_id order by created_at desc limit 1;
  if not found or not (last_c.user_id = auth.uid() or can_see_all()) or (last_c.created_at at time zone 'Asia/Seoul')::date <> (now() at time zone 'Asia/Seoul')::date then
    raise exception '오늘 본인이 남긴 기록만 되돌릴 수 있습니다'; end if;
  delete from lead_contacts where id = last_c.id;
  select * into prev_c from lead_contacts where lead_id = p_id order by created_at desc limit 1;
  update leads set status = 'assigned', assigned_to = coalesce(assigned_to, last_c.user_id), assigned_date = coalesce(assigned_date, (now() at time zone 'Asia/Seoul')::date),
         contact_round = greatest(contact_round - 1, 0), last_result_at = prev_c.created_at, last_contact_by = prev_c.user_id
   where id = p_id;
end $$;
revoke all on function lead_undo_result(bigint) from public, anon;
grant execute on function lead_undo_result(bigint) to authenticated;
