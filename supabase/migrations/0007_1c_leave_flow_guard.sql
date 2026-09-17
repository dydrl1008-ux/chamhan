-- 연차·반차·월차·병가: 팀장 팀승인 없이는 최종 승인 불가 (총괄·어드민도). 지각·무단결근은 총괄 직접.
-- 총괄·어드민이 직접 등록하는 건(INSERT 시 approved)은 팀승인 자동 처리.
create or replace function guard_leave_final_approval() returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if auth.uid() is not null and my_role() not in ('admin','head') then
      raise exception '최종 승인은 총괄·어드민만 가능합니다' using errcode='42501';
    end if;
    if new.type not in ('late','absent') then
      if tg_op = 'INSERT' then
        new.team_approved_at := coalesce(new.team_approved_at, now());
        new.team_approved_by := coalesce(new.team_approved_by, auth.uid());
      elsif new.team_approved_at is null and auth.uid() is not null then
        raise exception '팀장 승인 후 최종 승인할 수 있습니다' using errcode='P0001';
      end if;
    end if;
    new.decided_by := coalesce(new.decided_by, auth.uid());
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  -- 최종 승인 취소 / 반려 취소 → pending 으로 되돌릴 때 결정자 정보 초기화
  if tg_op = 'UPDATE' and new.status = 'pending' and old.status in ('approved','rejected') then
    new.decided_by := null; new.decided_at := null;
  end if;
  if new.team_approved_at is not null and (tg_op='INSERT' or old.team_approved_at is null) then
    if new.type in ('late','absent') and auth.uid() is not null and my_role() = 'manager' then
      raise exception '지각·무단결근은 총괄이 직접 승인합니다' using errcode='42501';
    end if;
    new.team_approved_by := coalesce(new.team_approved_by, auth.uid());
  end if;
  if new.team_approved_at is null then new.team_approved_by := null; end if;
  return new;
end $$;
