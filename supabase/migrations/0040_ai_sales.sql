-- ============================================================================
-- 0040 · AI팀 2단계 (영업지원)
--   대행사 컨택: 홍보방 내보내기 → 대행사 목록 → 메시지 초안 → 사람 승인 후 발송
--   콜 리스트:   업체 업로드 → 점수 → 매일 영업사원별 배분 → 콜 결과 기록
--   추적 링크:   제안서 링크를 /p/코드 로 감싸 열람 기록 → 담당자에게 핫리드 알림
-- ============================================================================

-- ── 1. 대행사 ──────────────────────────────────────────────────────────────
create table if not exists agency_imports (
  id          bigserial primary key,
  file_name   text not null default '',
  source_room text not null default '',           -- 홍보방 이름
  raw_text    text not null,
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  found       int not null default 0,             -- 추출된 대행사 수
  added       int not null default 0,             -- 새로 추가된 수 (중복 제외)
  drafted     int not null default 0,             -- 초안 만든 수
  message     text,
  uploaded_by uuid references profiles(id),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists agencies (
  id          bigserial primary key,
  name        text not null,                      -- 업체명 (없으면 닉네임)
  sender      text not null default '',           -- 홍보방 닉네임
  kakao       text not null default '',           -- 오픈채팅·카톡 ID·링크
  phone       text not null default '',
  other       text not null default '',           -- 기타 연락 수단 (텔레그램, 메일, 사이트)
  products    text not null default '',           -- 홍보하던 상품
  category    text not null default 'other' check (category in ('shopping_reward','place','blog_cafe','sns','other')),
  source_room text not null default '',
  sample      text not null default '',           -- 홍보글 원문 일부
  status      text not null default 'new' check (status in ('new','drafted','approved','sent','replied','joined','rejected','excluded')),
  draft       text not null default '',
  note        text not null default '',
  dedupe_key  text not null unique,               -- 전화 > 카톡 > 업체명 순으로 정규화
  import_id   bigint references agency_imports(id) on delete set null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists agencies_status_idx on agencies(status, category);
drop trigger if exists agencies_updated on agencies;
create trigger agencies_updated before update on agencies for each row execute function set_updated_at();

-- ── 2. 콜 리스트 ───────────────────────────────────────────────────────────
create table if not exists lead_imports (
  id          bigserial primary key,
  file_name   text not null default '',
  rows_in     int not null default 0,
  added       int not null default 0,
  updated     int not null default 0,
  skipped     int not null default 0,
  uploaded_by uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table if not exists leads (
  id            bigserial primary key,
  store_name    text not null,
  store_url     text not null default '',
  keyword       text not null default '',
  category      text not null default '',
  phone         text not null default '',
  ad_running    boolean not null default false,  -- 파워링크·쇼핑검색 광고 집행 중
  rank_now      int,                              -- 현재 순위 (작을수록 위)
  rank_prev     int,                              -- 이전 순위 → 하락 판단
  review_cnt    int,
  opened_on     date,                             -- 스토어 개설일
  score         int not null default 0,
  score_why     text not null default '',
  status        text not null default 'new' check (status in ('new','assigned','called','interested','rejected','won','excluded')),
  assigned_to   uuid references profiles(id) on delete set null,
  assigned_date date,
  last_result_at timestamptz,
  note          text not null default '',
  source        text not null default '',
  dedupe_key    text not null unique,             -- 스토어 URL > 전화 > 업체명
  import_id     bigint references lead_imports(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists leads_pick_idx on leads(status, score desc);
create index if not exists leads_assigned_idx on leads(assigned_to, assigned_date);
drop trigger if exists leads_updated on leads;
create trigger leads_updated before update on leads for each row execute function set_updated_at();

-- ── 3. 추적 링크 · 열람 기록 ───────────────────────────────────────────────
create table if not exists proposals (
  code        text primary key,                   -- /p/코드 (8자)
  lead_id     bigint references leads(id) on delete set null,
  agency_id   bigint references agencies(id) on delete set null,
  title       text not null default '',
  target_url  text not null,                      -- 실제 제안서 주소 (goat-app 등)
  owner_id    uuid references profiles(id),       -- 핫리드 알림 받을 사람
  views       int not null default 0,
  first_view_at timestamptz,
  last_view_at  timestamptz,
  created_at  timestamptz not null default now()
);
create table if not exists lead_events (
  id         bigserial primary key,
  code       text not null references proposals(code) on delete cascade,
  kind       text not null default 'view',
  ip_hash    text,
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_code_idx on lead_events(code, created_at desc);

-- ── 4. 설정값 ──────────────────────────────────────────────────────────────
-- 점수 가중치 (어드민이 콜 리스트 관리 화면에서 수정)
insert into app_settings(key, value) values
  ('lead_score_weights', '{"ad_running":30,"rank_drop":25,"review_vs_rank":20,"new_store":15,"has_phone":10}'),
  ('lead_daily_per_person', '30'),
  ('lead_recontact_days', '30')
on conflict (key) do nothing;

-- ── 5. 점수 계산 ───────────────────────────────────────────────────────────
create or replace function lead_score_calc(l leads, w jsonb, out score int, out why text)
language plpgsql stable as $$
declare parts text[] := '{}';
begin
  score := 0;
  if l.ad_running then score := score + coalesce((w->>'ad_running')::int, 0); parts := array_append(parts, '광고 집행 중'); end if;
  if l.rank_now is not null and l.rank_prev is not null and l.rank_now > l.rank_prev then
    score := score + coalesce((w->>'rank_drop')::int, 0); parts := array_append(parts, ('순위 하락 ' || l.rank_prev || '→' || l.rank_now)); end if;
  if coalesce(l.review_cnt, 0) >= 100 and coalesce(l.rank_now, 0) > 40 then
    score := score + coalesce((w->>'review_vs_rank')::int, 0); parts := array_append(parts, ('리뷰 ' || l.review_cnt || '개인데 ' || l.rank_now || '위')); end if;
  if l.opened_on is not null and l.opened_on > current_date - 180 then
    score := score + coalesce((w->>'new_store')::int, 0); parts := array_append(parts, '개설 6개월 이내'); end if;
  if coalesce(l.phone, '') <> '' then score := score + coalesce((w->>'has_phone')::int, 0); parts := array_append(parts, '전화번호 있음'); end if;
  why := array_to_string(parts, ' · ');
end $$;

create or replace function leads_rescore() returns int
language plpgsql security definer set search_path = public as $$
declare w jsonb := coalesce((select value::jsonb from app_settings where key = 'lead_score_weights'), '{}'); n int;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  update leads l set score = s.score, score_why = s.why
  from (select id, (lead_score_calc(x, w)).* from leads x where status in ('new','assigned')) s
  where s.id = l.id and (l.score is distinct from s.score or l.score_why is distinct from s.why);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function leads_rescore() from public, anon;
grant execute on function leads_rescore() to authenticated;

-- 영업사원 = 활성 · 팀장/직원 · 관리팀 아님
create or replace view v_sales_people with (security_invoker = true) as
  select id, name, team_id from profiles where is_active and role in ('manager','staff') and not coalesce(is_mgmt, false);

-- ── 6. 매일 배분 ───────────────────────────────────────────────────────────
--  어제까지 배정됐는데 결과를 안 남긴 건은 'new' 로 되돌려 다시 배분
--  같은 업체는 lead_recontact_days 안에 다시 안 나감 (결과가 있는 건은 제외 상태)
create or replace function leads_assign_today(p_date date default (now() at time zone 'Asia/Seoul')::date) returns int
language plpgsql security definer set search_path = public as $$
declare per int := coalesce((select value::int from app_settings where key = 'lead_daily_per_person'), 30);
        recontact int := coalesce((select value::int from app_settings where key = 'lead_recontact_days'), 30);
        n int := 0;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  perform leads_rescore();
  update leads set status = 'new', assigned_to = null, assigned_date = null
   where status = 'assigned' and assigned_date < p_date;
  -- 거절·연결 안 됨으로 끝난 건도 재컨택 기간이 지나면 다시 대상
  update leads set status = 'new', assigned_to = null, assigned_date = null
   where status in ('called','rejected') and last_result_at < now() - make_interval(days => recontact);
  -- 오늘 아직 리스트를 못 받은 영업사원에게, 점수 높은 순으로 번갈아 나눠 줌 (1등 업체가 한 사람에게 몰리지 않게)
  with ppl as (
         select sp.id, row_number() over (order by sp.name, sp.id) - 1 rn
         from v_sales_people sp
         where not exists (select 1 from leads x where x.assigned_to = sp.id and x.assigned_date = p_date)),
       np as (select count(*)::int c from ppl),
       cand as (
         select l.id, row_number() over (order by l.score desc, l.id) - 1 rn
         from leads l where l.status = 'new'
         order by l.score desc, l.id
         limit per * (select c from np)),
       upd as (
         update leads l set status = 'assigned', assigned_to = ppl.id, assigned_date = p_date
         from cand join ppl on ppl.rn = cand.rn % greatest((select c from np), 1)
         where l.id = cand.id
         returning l.assigned_to)
  insert into notifications(user_id, kind, title, body, link)
  select assigned_to, 'lead', '오늘의 콜 리스트 ' || count(*) || '건', '점수 높은 순으로 정리돼 있습니다.', '/calls'
  from upd group by assigned_to;
  select count(*) into n from leads where assigned_date = p_date and status = 'assigned';
  return n;
end $$;
revoke all on function leads_assign_today(date) from public, anon;
grant execute on function leads_assign_today(date) to authenticated;

-- 콜 결과 기록 (영업사원은 본인 배정 건만)
create or replace function lead_set_result(p_id bigint, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('called','interested','rejected','won','excluded') then raise exception '잘못된 상태'; end if;
  update leads set status = p_status, note = coalesce(nullif(p_note, ''), note), last_result_at = now()
   where id = p_id and (assigned_to = auth.uid() or can_see_all());
  if not found then raise exception '본인에게 배정된 건만 기록할 수 있습니다'; end if;
end $$;
revoke all on function lead_set_result(bigint, text, text) from public, anon;
grant execute on function lead_set_result(bigint, text, text) to authenticated;

-- ── 7. 추적 링크 열람 기록 (공개 페이지에서 서비스 키로 호출) ────────────────
create or replace function proposal_hit(p_code text, p_ip_hash text, p_ua text) returns text
language plpgsql security definer set search_path = public as $$
declare pr proposals; dup boolean; lead_name text;
begin
  select * into pr from proposals where code = p_code;
  if not found then return null; end if;
  -- 같은 사람이 10분 안에 다시 연 것은 1회로
  select exists (select 1 from lead_events where code = p_code and ip_hash = p_ip_hash and created_at > now() - interval '10 minutes') into dup;
  if not dup then
    insert into lead_events(code, ip_hash, ua) values (p_code, p_ip_hash, left(p_ua, 300));
    update proposals set views = views + 1, first_view_at = coalesce(first_view_at, now()), last_view_at = now()
     where code = p_code returning * into pr;
    if pr.owner_id is not null and pr.views in (1, 2, 5) then
      select store_name into lead_name from leads where id = pr.lead_id;
      insert into notifications(user_id, kind, title, body, link)
      values (pr.owner_id, 'lead',
              case pr.views when 1 then '🔥 제안서 열람: ' when 2 then '🔥🔥 제안서 재열람: ' else '🔥🔥🔥 제안서 5회 열람: ' end
                || coalesce(lead_name, pr.title, p_code),
              '지금 전화하기 좋은 타이밍입니다. (' || pr.views || '회 열람)', '/calls');
    end if;
  end if;
  return pr.target_url;
end $$;
revoke all on function proposal_hit(text, text, text) from public, anon, authenticated;

-- ── 8. RLS ─────────────────────────────────────────────────────────────────
alter table agency_imports enable row level security;
alter table agencies enable row level security;
alter table lead_imports enable row level security;
alter table leads enable row level security;
alter table proposals enable row level security;
alter table lead_events enable row level security;

drop policy if exists ag_imp_lead on agency_imports;  create policy ag_imp_lead on agency_imports for all to authenticated using (can_see_all()) with check (can_see_all());
drop policy if exists ag_lead on agencies;            create policy ag_lead on agencies for all to authenticated using (can_see_all()) with check (can_see_all());
drop policy if exists li_lead on lead_imports;        create policy li_lead on lead_imports for all to authenticated using (can_see_all()) with check (can_see_all());
drop policy if exists leads_lead on leads;            create policy leads_lead on leads for all to authenticated using (can_see_all()) with check (can_see_all());
drop policy if exists leads_mine on leads;            create policy leads_mine on leads for select to authenticated using (assigned_to = auth.uid());
drop policy if exists prop_read on proposals;         create policy prop_read on proposals for select to authenticated using (can_see_all() or owner_id = auth.uid());
drop policy if exists prop_insert on proposals;       create policy prop_insert on proposals for insert to authenticated
  with check (owner_id = auth.uid() and (lead_id is null or exists (select 1 from leads where id = lead_id and (assigned_to = auth.uid() or can_see_all()))));
drop policy if exists le_read on lead_events;         create policy le_read on lead_events for select to authenticated
  using (exists (select 1 from proposals p where p.code = lead_events.code and (can_see_all() or p.owner_id = auth.uid())));

-- 실행기(ai_worker): 대행사 추출·초안 작성
drop policy if exists w_ag_imp on agency_imports;     create policy w_ag_imp on agency_imports for all to ai_worker using (true) with check (true);
drop policy if exists w_ag on agencies;               create policy w_ag on agencies for all to ai_worker using (true) with check (true);
drop policy if exists w_leads on leads;               create policy w_leads on leads for select to ai_worker using (true);
grant select, insert, update on agency_imports, agencies to ai_worker;
grant select on leads, proposals to ai_worker;
grant usage, select on sequence agencies_id_seq, agency_imports_id_seq to ai_worker;

-- 워크허브에서 실행기에 '작업(work)'도 넣을 수 있게 (대행사 추출 요청)
drop policy if exists ai_tasks_insert on ai_tasks;
create policy ai_tasks_insert on ai_tasks for insert to authenticated
  with check (can_see_all() and source = 'workhub' and kind in ('order','check','briefing','work') and status = 'queued');

-- ── 9. 에이전트 · 일정 · 검사기 ────────────────────────────────────────────
insert into ai_agents(slug, name, team, role_desc, requires_review, sort) values
  ('agency', '대행사 담당', '영업지원', '홍보방 대화에서 대행사·연락처를 뽑아 목록을 만들고 첫 컨택 메시지 초안을 쓴다 (발송은 사람이 승인 후)', false, 10),
  ('leads',  '리스트 담당', '영업지원', '업로드된 업체에 점수를 매겨 매일 아침 영업사원별 콜 리스트를 배분한다 (규칙 기반, AI 미사용)', false, 11),
  ('tracker','열람 추적 담당', '영업지원', '제안서 추적 링크 열람을 기록하고 담당 영업사원에게 핫리드 알림을 보낸다 (규칙 기반, AI 미사용)', false, 12)
on conflict (slug) do update set name = excluded.name, team = excluded.team, role_desc = excluded.role_desc, requires_review = excluded.requires_review;

-- 09:00 KST(00:00 UTC) 콜 리스트 배분 — 평일만
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'leads_assign_today';
    perform cron.schedule('leads_assign_today', '0 0 * * 1-5', 'select leads_assign_today()');
  end if;
end $$;

-- 검사기: 콜 리스트 배분
create or replace function ai_chk_leads_assigned() returns table(status text, seen int, detail text)
language plpgsql stable security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; people int; got int; pool int;
begin
  select count(*) into people from v_sales_people;
  select count(*) into pool from leads l where l.status in ('new','assigned');
  if extract(isodow from d) > 5 or (now() at time zone 'Asia/Seoul')::time < time '09:10' then
    return query select 'ok'::text, pool, '배분 전 (평일 09:00) · 배분 가능 업체 ' || pool || '곳'; return;
  end if;
  select count(distinct l.assigned_to) into got from leads l where l.assigned_date = d;
    if pool = 0 and got = 0 then return query select 'warn'::text, 0, '배분할 업체 0곳 — 콜 리스트 업로드 필요'; return; end if;
  if got < people then return query select 'bad'::text, people, '영업사원 ' || people || '명 중 ' || got || '명만 오늘 리스트 받음'; return; end if;
  return query select 'ok'::text, people, '영업사원 ' || people || '명 모두 오늘 리스트 받음 · 배분 대기 ' || (select count(*) from leads l where l.status = 'new') || '곳';
end $$;

-- 검사기: 대행사 추출 작업
create or replace function ai_chk_agency_imports() returns table(status text, seen int, detail text)
language sql stable security definer set search_path = public as $$
  with s as (
    select count(*)::int total,
           count(*) filter (where status = 'failed' and created_at > now() - interval '7 days')::int failed,
           count(*) filter (where status in ('queued','running') and created_at < now() - interval '60 minutes')::int stuck,
           count(*) filter (where status = 'done' and found = 0 and created_at > now() - interval '7 days')::int empty
    from agency_imports)
  select case when stuck + failed > 0 then 'bad' when empty > 0 then 'warn' else 'ok' end, total,
         case when stuck + failed > 0 then '멈춤 ' || stuck || '건, 실패 ' || failed || '건 (최근 7일)'
              when empty > 0 then '대행사 0곳 추출된 파일 ' || empty || '건 — 파일 형식 확인'
              else '업로드 ' || total || '건 정상' end
  from s;
$$;

revoke all on function ai_chk_leads_assigned(), ai_chk_agency_imports() from public, anon, authenticated;

insert into ai_checks(slug, name, description, fn, sort) values
  ('leads_assigned', '콜 리스트 배분', '평일 09:00 이후 영업사원 전원이 오늘 리스트를 받았는지', 'ai_chk_leads_assigned', 6),
  ('agency_imports', '대행사 추출',   '홍보방 파일 추출이 멈추거나 실패하지 않았는지, 0곳 추출이 없는지', 'ai_chk_agency_imports', 7)
on conflict (slug) do update set name = excluded.name, description = excluded.description, fn = excluded.fn, sort = excluded.sort;

-- ── 10. 콜 리스트 업로드 (같은 업체면 정보 갱신, 순위가 바뀌면 이전 순위 보관) ──
create or replace function leads_upsert(p_rows jsonb, p_file text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; k text; n_add int := 0; n_upd int := 0; n_skip int := 0; imp bigint; was_new boolean;
begin
  if not can_see_all() then raise exception '권한 없음'; end if;
  insert into lead_imports(file_name, rows_in, uploaded_by) values (p_file, jsonb_array_length(p_rows), auth.uid()) returning id into imp;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(r->>'store_name'), '') = '' then n_skip := n_skip + 1; continue; end if;
    k := coalesce(nullif(lower(regexp_replace(coalesce(r->>'store_url', ''), '^https?://(www\.|m\.)?|/+$|\?.*$', '', 'g')), ''),
                  nullif('p:' || regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 'p:'),
                  'n:' || lower(regexp_replace(r->>'store_name', '\s', '', 'g')));
    insert into leads(store_name, store_url, keyword, category, phone, ad_running, rank_now, rank_prev, review_cnt, opened_on, source, dedupe_key, import_id)
    values (trim(r->>'store_name'), coalesce(r->>'store_url', ''), coalesce(r->>'keyword', ''), coalesce(r->>'category', ''),
            coalesce(r->>'phone', ''), coalesce((r->>'ad_running')::boolean, false),
            (r->>'rank_now')::int, (r->>'rank_prev')::int, (r->>'review_cnt')::int, (r->>'opened_on')::date, p_file, k, imp)
    on conflict (dedupe_key) do update set
      store_url  = coalesce(nullif(excluded.store_url, ''), leads.store_url),
      keyword    = coalesce(nullif(excluded.keyword, ''), leads.keyword),
      category   = coalesce(nullif(excluded.category, ''), leads.category),
      phone      = coalesce(nullif(excluded.phone, ''), leads.phone),
      ad_running = coalesce((r->>'ad_running')::boolean, leads.ad_running),
      rank_prev  = case when excluded.rank_now is not null and excluded.rank_now is distinct from leads.rank_now
                        then coalesce(excluded.rank_prev, leads.rank_now) else coalesce(excluded.rank_prev, leads.rank_prev) end,
      rank_now   = coalesce(excluded.rank_now, leads.rank_now),
      review_cnt = coalesce(excluded.review_cnt, leads.review_cnt),
      opened_on  = coalesce(excluded.opened_on, leads.opened_on)
    returning (xmax = 0) into was_new;
    if was_new then n_add := n_add + 1; else n_upd := n_upd + 1; end if;
  end loop;
  update lead_imports set added = n_add, updated = n_upd, skipped = n_skip where id = imp;
  perform leads_rescore();
  return jsonb_build_object('added', n_add, 'updated', n_upd, 'skipped', n_skip);
end $$;
revoke all on function leads_upsert(jsonb, text) from public, anon;
grant execute on function leads_upsert(jsonb, text) to authenticated;
