-- 0067: 직원 연락처 (제안서·리포트에 찍히는 번호) — 본인만 수정
-- ※ chamhan 프로젝트에서 실행
alter table profiles add column if not exists phone text not null default '';
create or replace function set_my_phone(p_phone text) returns void
language sql security definer set search_path = public as $$
  update profiles set phone = left(coalesce(p_phone, ''), 30) where id = auth.uid();
$$;
revoke all on function set_my_phone(text) from public, anon;
grant execute on function set_my_phone(text) to authenticated;
-- 기존에 리포트 화면에서 저장한 번호 옮기기
update profiles p set phone = l.phone from reward_watch_links l where l.user_id = p.id and l.phone <> '' and p.phone = '';
