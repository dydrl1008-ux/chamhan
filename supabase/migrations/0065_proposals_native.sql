-- 0065: 워크허브 안에서 그려지는 제안서(/p/코드) + 메일 수신거부
-- ※ chamhan 프로젝트(jeehtcoccvdnuphopgth)에서 실행
alter table proposals add column if not exists kind text not null default 'link';   -- link(외부 URL iframe) | native(워크허브가 그림)
alter table proposals add column if not exists data jsonb;                           -- native 제안서 스냅샷
alter table proposals add column if not exists email text;                           -- 보낸 메일 주소 (수신거부 매칭)
alter table proposals alter column target_url set default '';
create table if not exists email_optouts (email text primary key, code text, created_at timestamptz not null default now());
alter table email_optouts enable row level security;
drop policy if exists eo_sel on email_optouts; create policy eo_sel on email_optouts for select using (auth.uid() is not null);
