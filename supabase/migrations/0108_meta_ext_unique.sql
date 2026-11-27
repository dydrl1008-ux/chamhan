-- 0108 자동 접수 중복 방지 색인을 일반 unique 로 바꾼다.
--   조건부 색인(where ext_id is not null)은 upsert(on_conflict=ext_id)가 쓰지 못해, 새 문의를 넣는 단계가 전부 실패했다 (2026-11-27, 평일 접수 4건 누락).
--   NULL 은 여러 개 허용되므로 직접 올린 건(접수 ID 없음)은 그대로 들어간다.
drop index if exists meta_leads_ext;
create unique index if not exists meta_leads_ext on meta_leads(ext_id);
