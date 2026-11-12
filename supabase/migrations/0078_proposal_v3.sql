-- 0078: 제안서 v3 (광고 전체 설계 · 이미지 8장) + 지식베이스 + 워커 렌더
-- ※ chamhan 프로젝트에서 실행

-- 키워드 단위 설계 (코드 계산 + 워커 글) — 7장 공통 이미지
create table if not exists pv3_keywords (
  keyword      text primary key,
  data         jsonb not null default '{}',     -- 코드 계산 (검색량·상위10·시장·매출 기준)
  ai           jsonb,                           -- 워커 결과 (사는 사람·뒤집기·3단계·콘텐츠·안 쓰는 무기)
  ai_task_id   bigint references ai_tasks(id) on delete set null,
  ai_status    text not null default 'none' check (ai_status in ('none','queued','done','fallback')),
  images       jsonb not null default '[]',     -- 공통 페이지 이미지 URL (렌더 후)
  rendered_at  timestamptz,
  updated_at   timestamptz not null default now(),
  created_by   uuid references profiles(id) on delete set null
);
alter table pv3_keywords enable row level security;
drop policy if exists pv3k_sel on pv3_keywords; create policy pv3k_sel on pv3_keywords for select using (auth.uid() is not null);

-- 업체 단위 (개인화 2장)
create table if not exists pv3_stores (
  id           bigserial primary key,
  keyword      text not null references pv3_keywords(keyword) on delete cascade,
  target_id    bigint references mail_targets(id) on delete set null,
  store_name   text not null default '',
  data         jsonb not null default '{}',     -- 코드 계산 (순위·리뷰·가격·퍼널 판정·리딩·매출)
  ai           jsonb,                           -- 워커 결과 (헤드라인·관통 한 줄·가진 것/새는 곳)
  ai_task_id   bigint references ai_tasks(id) on delete set null,
  images       jsonb not null default '[]',     -- 업체별 페이지 이미지 URL
  rendered_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists pv3_stores_kw_idx on pv3_stores(keyword);
create unique index if not exists pv3_stores_kw_target_idx on pv3_stores(keyword, target_id) where target_id is not null;
alter table pv3_stores enable row level security;
drop policy if exists pv3s_sel on pv3_stores; create policy pv3s_sel on pv3_stores for select using (auth.uid() is not null);

-- 워커 PC 렌더 작업 (워커가 폴링 → HTML 캡처 → Storage 업로드 → images 갱신)
create table if not exists pv3_render_jobs (
  id          bigserial primary key,
  kind        text not null check (kind in ('keyword','store')),
  ref         text not null,                    -- keyword 또는 pv3_stores.id
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  error       text,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists pv3_render_jobs_status_idx on pv3_render_jobs(status, id);
alter table pv3_render_jobs enable row level security;
drop policy if exists pv3r_sel on pv3_render_jobs; create policy pv3r_sel on pv3_render_jobs for select using (auth.uid() is not null);

-- 지식베이스 (goat-app knowledge 이식 · 임베딩 없이 태그·카테고리 매칭)
create table if not exists knowledge (
  id          bigserial primary key,
  title       text not null default '',
  source_url  text,
  raw         text not null default '',
  summary     text not null default '',
  insights    jsonb not null default '[]',      -- ["…","…"]
  tags        text[] not null default '{}',
  category    text not null default 'general',  -- shopping_rank / content / influencer / paid / brand / general
  ai_task_id  bigint references ai_tasks(id) on delete set null,
  status      text not null default 'queued' check (status in ('queued','done','failed')),
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table knowledge enable row level security;
drop policy if exists kn_sel on knowledge; create policy kn_sel on knowledge for select using (auth.uid() is not null);

create table if not exists principles (
  id          bigserial primary key,
  text        text not null,
  category    text not null default 'general',
  weight      int not null default 1,
  source_ids  bigint[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table principles enable row level security;
drop policy if exists pr_sel on principles; create policy pr_sel on principles for select using (auth.uid() is not null);

create table if not exists ai_settings (key text primary key, value text not null default '', updated_at timestamptz not null default now());
alter table ai_settings enable row level security;
drop policy if exists ais_sel on ai_settings; create policy ais_sel on ai_settings for select using (auth.uid() is not null);

-- 이미지 버킷 (공개 읽기)
insert into storage.buckets (id, name, public) values ('pv3', 'pv3', true) on conflict (id) do nothing;
drop policy if exists "pv3 public read" on storage.objects;
create policy "pv3 public read" on storage.objects for select using (bucket_id = 'pv3');

-- 메일 큐: v3 이미지 발송 연결
alter table mail_queue add column if not exists pv3_store_id bigint references pv3_stores(id) on delete set null;
