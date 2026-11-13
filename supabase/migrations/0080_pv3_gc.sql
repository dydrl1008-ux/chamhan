-- 0080 제안서 이미지 정리: 30일 지난 이미지 파일 목록을 돌려주는 함수 (실제 삭제는 서버가 Storage API 로 — 표에서만 지우면 파일이 남음)
create or replace function pv3_old_objects(p_days int default 30, p_limit int default 500) returns table(name text)
language sql security definer set search_path = public, storage as $$
  select o.name from storage.objects o
  where o.bucket_id = 'pv3' and o.created_at < now() - make_interval(days => greatest(p_days, 7))
  order by o.created_at limit least(greatest(p_limit, 1), 1000);
$$;
revoke all on function pv3_old_objects(int, int) from public, anon, authenticated;
grant execute on function pv3_old_objects(int, int) to service_role;
