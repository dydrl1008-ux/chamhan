-- =============== 1-A 종료 점검 (전부 통과해야 1-B 진행) ===============

-- [1] RLS 안 켜진 public 테이블 → 결과 0행이어야 함
select c.relname as "RLS_OFF_TABLE"
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;

-- [2] security_invoker 없는 뷰 → 결과 0행이어야 함 (지난 사고 재발 방지)
select c.relname as "VIEW_WITHOUT_SECURITY_INVOKER"
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v'
  and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=on%' and coalesce(array_to_string(c.reloptions,','),'') not like '%security_invoker=true%';

-- [3] 정책 목록 확인
select tablename, policyname, cmd from pg_policies where schemaname='public' order by 1,2;

-- [4] IP 함수 동작 (true / false 나와야 함)
select ip_allowed('211.205.68.33') as office_true, ip_allowed('8.8.8.8') as other_false;

-- [5] 역할별 가시성 시뮬레이션 — 각 테스트 계정 uuid로 바꿔서 실행
--     기대: admin=전체, head=전체, manager=본인 팀 인원수, staff=1
-- set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- select count(*) from profiles;
-- reset role;
