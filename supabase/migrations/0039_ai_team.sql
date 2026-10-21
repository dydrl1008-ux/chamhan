-- ============================================================================
-- 0039 · AI팀 1단계 (기반)
--   작업 큐 · 실행 기록 · 자동 일정 · 검사기 · 워커 상태 · 직원 알림(워크허브)
--   실행기(ai-worker)는 서비스 키가 아니라 전용 DB 역할 ai_worker 로 접속한다.
--   ※ 실행 후 README-AI1.md 의 "ai_worker 비밀번호 설정" 단계를 반드시 진행
-- ============================================================================

-- ── 0. 실행기 전용 DB 역할 ─────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ai_worker') then
    create role ai_worker login noinherit;
  end if;
end $$;
grant usage on schema public to ai_worker;

-- ── 1. 에이전트 ────────────────────────────────────────────────────────────
create table if not exists ai_agents (
  slug            text primary key,                 -- chief, auditor, ...
  name            text not null,                    -- 비서실장
  team            text not null,                    -- 본부 / 감사 / 영업지원 ...
  role_desc       text not null default '',         -- 비서실장이 업무를 나눌 때 보는 한 줄 설명
  requires_review boolean not null default true,    -- 결과를 감사팀이 재확인해야 완료 처리
  active          boolean not null default true,
  sort            int not null default 100,
  created_at      timestamptz not null default now()
);

-- ── 2. 작업 큐 ─────────────────────────────────────────────────────────────
create table if not exists ai_tasks (
  id            bigserial primary key,
  kind          text not null check (kind in ('order','work','review','report','check','briefing')),
  agent         text references ai_agents(slug),
  parent_id     bigint references ai_tasks(id) on delete cascade,
  title         text not null default '',
  instruction   text not null default '',
  status        text not null default 'queued'
                check (status in ('queued','running','waiting','review','done','rejected','failed','cancelled')),
  source        text not null default 'telegram' check (source in ('telegram','workhub','schedule','agent')),
  requested_by  text,                               -- 텔레그램 이름 또는 워크허브 사용자 이름
  report_chat   bigint,                             -- 결과를 돌려줄 텔레그램 chat id (없으면 기본 보고 대상)
  result        text,
  result_json   jsonb,
  audit_note    text,                               -- 감사팀 판정 근거
  attempts      int not null default 0,
  worker        text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  updated_at    timestamptz not null default now()
);
create index if not exists ai_tasks_status_idx on ai_tasks(status, id);
create index if not exists ai_tasks_parent_idx on ai_tasks(parent_id);
create index if not exists ai_tasks_created_idx on ai_tasks(created_at desc);
drop trigger if exists ai_tasks_updated on ai_tasks;
create trigger ai_tasks_updated before update on ai_tasks for each row execute function set_updated_at();

-- ── 3. 실행 기록 (Claude 실행 1회 = 1행) ───────────────────────────────────
create table if not exists ai_runs (
  id           bigserial primary key,
  task_id      bigint references ai_tasks(id) on delete cascade,
  agent        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  num_turns    int,
  duration_ms  int,
  cost_usd     numeric(10,4),     -- Claude가 알려주는 정가 환산값 (구독이라 실제 청구 아님, 개발비 장부용)
  error        text,
  log          text               -- 출력 원문 일부 (최대 20,000자)
);
create index if not exists ai_runs_started_idx on ai_runs(started_at desc);

-- ── 4. 자동 일정 (pg_cron 으로 작업을 큐에 넣음) ───────────────────────────
create table if not exists ai_schedules (
  slug             text primary key,
  name             text not null,
  cron_utc         text not null,          -- pg_cron 은 UTC 기준. 08:00 KST = '0 23 * * *'
  kind             text not null check (kind in ('order','work','check','briefing')),
  agent            text references ai_agents(slug),
  instruction      text not null default '',
  active           boolean not null default true,
  last_enqueued_at timestamptz
);

-- ── 5. 검사기 ──────────────────────────────────────────────────────────────
create table if not exists ai_checks (
  slug        text primary key,
  name        text not null,
  description text not null default '',
  fn          text not null,              -- returns table(status text, seen int, detail text)
  active      boolean not null default true,
  sort        int not null default 100
);
create table if not exists ai_check_results (
  id         bigserial primary key,
  check_slug text not null references ai_checks(slug) on delete cascade,
  run_at     timestamptz not null default now(),
  status     text not null check (status in ('ok','warn','bad')),
  seen       int not null default 0,      -- 실제로 본 대상 수 (0건 통과 방지)
  detail     text not null default ''
);
create index if not exists ai_check_results_idx on ai_check_results(check_slug, run_at desc);

-- ── 6. 워커 생존 신호 ──────────────────────────────────────────────────────
create table if not exists ai_worker_heartbeat (
  worker  text primary key,
  seen_at timestamptz not null default now(),
  version text,
  note    text
);

-- ── 7. 직원 알림 (워크허브) ────────────────────────────────────────────────
create table if not exists notifications (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null default 'info',     -- info / alert / lead ...
  title      text not null,
  body       text not null default '',
  link       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on notifications(user_id, read_at, created_at desc);

-- ── 8. RLS ─────────────────────────────────────────────────────────────────
alter table ai_agents enable row level security;
alter table ai_tasks enable row level security;
alter table ai_runs enable row level security;
alter table ai_schedules enable row level security;
alter table ai_checks enable row level security;
alter table ai_check_results enable row level security;
alter table ai_worker_heartbeat enable row level security;
alter table notifications enable row level security;

-- 워크허브: 어드민·총괄만 AI팀 열람. 지시(order)·점검(check) 넣기만 허용
drop policy if exists ai_agents_read on ai_agents;        create policy ai_agents_read on ai_agents for select to authenticated using (can_see_all());
drop policy if exists ai_agents_admin on ai_agents;       create policy ai_agents_admin on ai_agents for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists ai_tasks_read on ai_tasks;          create policy ai_tasks_read on ai_tasks for select to authenticated using (can_see_all());
drop policy if exists ai_tasks_insert on ai_tasks;        create policy ai_tasks_insert on ai_tasks for insert to authenticated
  with check (can_see_all() and source = 'workhub' and kind in ('order','check','briefing') and status = 'queued');
drop policy if exists ai_runs_read on ai_runs;            create policy ai_runs_read on ai_runs for select to authenticated using (can_see_all());
drop policy if exists ai_sched_read on ai_schedules;      create policy ai_sched_read on ai_schedules for select to authenticated using (can_see_all());
drop policy if exists ai_sched_admin on ai_schedules;     create policy ai_sched_admin on ai_schedules for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists ai_checks_read on ai_checks;        create policy ai_checks_read on ai_checks for select to authenticated using (can_see_all());
drop policy if exists ai_cres_read on ai_check_results;   create policy ai_cres_read on ai_check_results for select to authenticated using (can_see_all());
drop policy if exists ai_hb_read on ai_worker_heartbeat;  create policy ai_hb_read on ai_worker_heartbeat for select to authenticated using (can_see_all());

-- 알림: 본인 것만 보고 읽음 처리
drop policy if exists noti_read on notifications;         create policy noti_read on notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists noti_mark on notifications;         create policy noti_mark on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists noti_admin_insert on notifications; create policy noti_admin_insert on notifications for insert to authenticated with check (can_see_all());

-- 실행기(ai_worker): AI 테이블 전체 + 알림 쓰기. 다른 업무 테이블은 못 봄
drop policy if exists w_agents on ai_agents;              create policy w_agents on ai_agents for select to ai_worker using (true);
drop policy if exists w_tasks on ai_tasks;                create policy w_tasks on ai_tasks for all to ai_worker using (true) with check (true);
drop policy if exists w_runs on ai_runs;                  create policy w_runs on ai_runs for all to ai_worker using (true) with check (true);
drop policy if exists w_sched on ai_schedules;            create policy w_sched on ai_schedules for select to ai_worker using (true);
drop policy if exists w_checks on ai_checks;              create policy w_checks on ai_checks for select to ai_worker using (true);
drop policy if exists w_cres on ai_check_results;         create policy w_cres on ai_check_results for select to ai_worker using (true);
drop policy if exists w_hb on ai_worker_heartbeat;        create policy w_hb on ai_worker_heartbeat for all to ai_worker using (true) with check (true);
drop policy if exists w_noti on notifications;            create policy w_noti on notifications for insert to ai_worker with check (true);
drop policy if exists w_profiles on profiles;             create policy w_profiles on profiles for select to ai_worker using (true);  -- 알림 받을 어드민·총괄 찾기용

grant select on ai_agents, ai_schedules, ai_checks, ai_check_results, profiles to ai_worker;
grant select, insert, update on ai_tasks, ai_runs, ai_worker_heartbeat to ai_worker;
grant insert on notifications to ai_worker;
grant usage, select on sequence ai_tasks_id_seq, ai_runs_id_seq, notifications_id_seq to ai_worker;

-- ── 9. 작업 꺼내기 (동시에 여러 실행 슬롯이 같은 작업을 잡지 않게) ─────────
create or replace function ai_claim_task(p_worker text) returns setof ai_tasks
language sql security definer set search_path = public as $$
  update ai_tasks t set status = 'running', worker = p_worker, started_at = now(), attempts = t.attempts + 1
  where t.id = (select id from ai_tasks where status = 'queued' order by id for update skip locked limit 1)
  returning t.*;
$$;
revoke all on function ai_claim_task(text) from public, anon, authenticated;
grant execute on function ai_claim_task(text) to ai_worker;

-- ── 10. 자동 일정 → 작업 생성 ──────────────────────────────────────────────
create or replace function ai_enqueue_schedule(p_slug text) returns bigint
language plpgsql security definer set search_path = public as $$
declare s ai_schedules; v_id bigint;
begin
  select * into s from ai_schedules where slug = p_slug and active;
  if not found then return null; end if;
  insert into ai_tasks(kind, agent, title, instruction, source, requested_by)
  values (s.kind, s.agent, s.name, s.instruction, 'schedule', '자동 일정')
  returning id into v_id;
  update ai_schedules set last_enqueued_at = now() where slug = p_slug;
  return v_id;
end $$;
revoke all on function ai_enqueue_schedule(text) from public, anon, authenticated;

-- ai_schedules 행 기준으로 pg_cron 작업을 다시 맞춘다 (일정 추가·수정 후 호출)
create or replace function ai_sync_schedules() returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  if auth.uid() is not null and not is_admin() then raise exception '어드민만 실행할 수 있습니다'; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then raise exception 'pg_cron 확장이 꺼져 있습니다'; end if;
  perform cron.unschedule(jobid) from cron.job where jobname like 'ai\_%';
  for s in select * from ai_schedules where active loop
    perform cron.schedule('ai_' || s.slug, s.cron_utc, format('select ai_enqueue_schedule(%L)', s.slug));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function ai_sync_schedules() from public, anon;
grant execute on function ai_sync_schedules() to authenticated;

-- ── 11. 검사기 ─────────────────────────────────────────────────────────────
-- 판정 로직은 순수 함수로 분리 → 같은 함수에 일부러 나쁜 값을 넣어 빨개지는지 확인(고장 주입)

-- 정산 동기화 판정: 최근 실행 시각·성공 여부·가져온 건수
create or replace function ai_eval_settle(p_last timestamptz, p_ok boolean, p_rows int)
returns table(status text, seen int, detail text) language sql immutable as $$
  select case
           when p_last is null then 'bad'
           when p_last < now() - interval '26 hours' then 'bad'
           when p_ok is not true then 'bad'
           when coalesce(p_rows, 0) = 0 then 'warn'      -- 0건은 정상이 아니다
           else 'ok' end,
         coalesce(p_rows, 0),
         case
           when p_last is null then '실행 기록 없음'
           when p_last < now() - interval '26 hours' then '마지막 실행 ' || to_char(p_last at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ' (26시간 넘게 안 돎)'
           when p_ok is not true then '마지막 실행 실패'
           when coalesce(p_rows, 0) = 0 then '실행은 됐지만 가져온 정산 0건'
           else to_char(p_last at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ' 실행, 정산 ' || p_rows || '건' end;
$$;

create or replace function ai_chk_settle_sync() returns table(status text, seen int, detail text)
language sql stable security definer set search_path = public as $$
  with r as (select started_at, ok, rows_fetched from settlement_sync_runs order by started_at desc limit 1)
  select e.* from ai_eval_settle((select started_at from r), (select ok from r), (select rows_fetched from r)) e;
$$;

-- 실행기 생존 판정
create or replace function ai_eval_heartbeat(p_seen timestamptz, p_workers int)
returns table(status text, seen int, detail text) language sql immutable as $$
  select case when p_seen is null then 'bad'
              when p_seen < now() - interval '5 minutes' then 'bad'
              else 'ok' end,
         coalesce(p_workers, 0),
         case when p_seen is null then '실행기 신호 기록 없음 (실행 PC에서 ai-worker가 안 돎)'
              when p_seen < now() - interval '5 minutes' then '마지막 신호 ' || to_char(p_seen at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || ' — 실행 PC 확인 필요'
              else '정상 (마지막 신호 ' || to_char(p_seen at time zone 'Asia/Seoul', 'HH24:MI') || ')' end;
$$;

create or replace function ai_chk_worker_alive() returns table(status text, seen int, detail text)
language sql stable security definer set search_path = public as $$
  select e.* from (select max(seen_at) m, count(*)::int c from ai_worker_heartbeat) h
  cross join lateral ai_eval_heartbeat(h.m, h.c) e;
$$;

-- 자동 일정이 제때 작업을 만들었는지 (현재 일정은 모두 하루 1회 이상)
create or replace function ai_chk_schedules_ran() returns table(status text, seen int, detail text)
language plpgsql stable security definer set search_path = public as $$
declare n int; stale text; failed int := 0;
begin
  select count(*) into n from ai_schedules where active;
  if n = 0 then return query select 'warn'::text, 0, '활성 일정 0개'; return; end if;
  select string_agg(name, ', ') into stale from ai_schedules
   where active and (last_enqueued_at is null or last_enqueued_at < now() - interval '26 hours');
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select count(*) into failed from cron.job_run_details d join cron.job j on j.jobid = d.jobid
     where j.jobname like 'ai\_%' and d.status = 'failed' and d.start_time > now() - interval '24 hours';
  else
    return query select 'bad'::text, n, 'pg_cron 꺼짐 — 일정이 돌지 않음'; return;
  end if;
  if failed > 0 then return query select 'bad'::text, n, '최근 24시간 일정 실패 ' || failed || '건'; return; end if;
  if stale is not null then return query select 'warn'::text, n, '26시간 넘게 안 돈 일정: ' || stale; return; end if;
  return query select 'ok'::text, n, '활성 일정 ' || n || '개 모두 정상 실행';
end $$;

-- 멈춘 작업 (진행 30분 초과 / 대기 60분 초과)
create or replace function ai_chk_stuck_tasks() returns table(status text, seen int, detail text)
language sql stable security definer set search_path = public as $$
  with o as (
    select count(*) filter (where status in ('queued','running','waiting','review'))::int open_n,
           count(*) filter (where status = 'running' and started_at < now() - interval '30 minutes')::int run_n,
           count(*) filter (where status = 'queued' and created_at < now() - interval '60 minutes')::int q_n
    from ai_tasks)
  select case when run_n + q_n > 0 then 'bad' else 'ok' end, open_n,
         case when run_n + q_n > 0 then '30분 넘게 진행 중 ' || run_n || '건, 60분 넘게 대기 ' || q_n || '건'
              else '진행·대기 중 ' || open_n || '건, 멈춘 작업 없음' end
  from o;
$$;

-- 고장 주입: 판정 함수에 일부러 나쁜 값을 넣었을 때 실제로 빨개지는지
create or replace function ai_chk_canary() returns table(status text, seen int, detail text)
language plpgsql stable security definer set search_path = public as $$
declare cases int := 0; broken text := '';
begin
  cases := cases + 1; if (select e.status from ai_eval_settle(null, null, null) e) <> 'bad' then broken := broken || '정산(기록 없음) '; end if;
  cases := cases + 1; if (select e.status from ai_eval_settle(now() - interval '3 days', true, 10) e) <> 'bad' then broken := broken || '정산(오래됨) '; end if;
  cases := cases + 1; if (select e.status from ai_eval_settle(now(), false, 10) e) <> 'bad' then broken := broken || '정산(실패) '; end if;
  cases := cases + 1; if (select e.status from ai_eval_settle(now(), true, 0) e) <> 'warn' then broken := broken || '정산(0건) '; end if;
  cases := cases + 1; if (select e.status from ai_eval_heartbeat(null, 0) e) <> 'bad' then broken := broken || '실행기(기록 없음) '; end if;
  cases := cases + 1; if (select e.status from ai_eval_heartbeat(now() - interval '1 hour', 1) e) <> 'bad' then broken := broken || '실행기(멈춤) '; end if;
  if broken <> '' then return query select 'bad'::text, cases, '고장 주입에 반응하지 않는 검사기: ' || broken; return; end if;
  return query select 'ok'::text, cases, '고장 주입 ' || cases || '건 모두 정상 감지';
end $$;

-- 활성 검사기 전체 실행 → 결과 저장
create or replace function ai_run_checks() returns setof ai_check_results
language plpgsql security definer set search_path = public as $$
declare c ai_checks; r record; row ai_check_results;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  for c in select * from ai_checks where active order by sort, slug loop
    begin
      execute format('select * from %I()', c.fn) into r;
      insert into ai_check_results(check_slug, status, seen, detail)
      values (c.slug, coalesce(r.status, 'bad'), coalesce(r.seen, 0), coalesce(r.detail, '결과 없음'))
      returning * into row;
    exception when others then
      insert into ai_check_results(check_slug, status, seen, detail)
      values (c.slug, 'bad', 0, '검사기 오류: ' || sqlerrm) returning * into row;
    end;
    return next row;
  end loop;
end $$;
revoke all on function ai_run_checks() from public, anon;
grant execute on function ai_run_checks() to authenticated, ai_worker;

revoke all on function ai_chk_settle_sync(), ai_chk_worker_alive(), ai_chk_schedules_ran(), ai_chk_stuck_tasks(), ai_chk_canary() from public, anon, authenticated;

-- 검사기별 최신 결과
create or replace view ai_check_latest with (security_invoker = true) as
  select distinct on (r.check_slug) r.check_slug, c.name, c.sort, r.status, r.seen, r.detail, r.run_at
  from ai_check_results r join ai_checks c on c.slug = r.check_slug
  where c.active
  order by r.check_slug, r.run_at desc;
grant select on ai_check_latest to authenticated, ai_worker;

-- ── 12. 기본 데이터 ────────────────────────────────────────────────────────
insert into ai_agents(slug, name, team, role_desc, requires_review, sort) values
  ('chief',   '비서실장',          '본부', '대표 지시를 받아 직접 처리하거나 팀별 에이전트에게 나눠 맡기고, 결과를 모아 보고한다', false, 1),
  ('auditor', '검증 담당',         '감사', '다른 에이전트의 완료 보고를 원본 근거로 다시 확인해 통과/반려를 판정한다',       false, 2)
on conflict (slug) do update set name = excluded.name, team = excluded.team, role_desc = excluded.role_desc;

insert into ai_checks(slug, name, description, fn, sort) values
  ('worker_alive',  '실행기 생존',      '실행 PC의 ai-worker가 5분 안에 신호를 보냈는지',          'ai_chk_worker_alive',  1),
  ('settle_sync',   '정산 동기화',      '매일 06:00 정산 동기화가 성공했고 가져온 건수가 0이 아닌지', 'ai_chk_settle_sync',   2),
  ('schedules_ran', '자동 일정 실행',   '등록된 일정이 제때 작업을 만들었고 실패가 없는지',        'ai_chk_schedules_ran', 3),
  ('stuck_tasks',   '멈춘 작업',        '진행 30분·대기 60분을 넘긴 작업이 없는지',                'ai_chk_stuck_tasks',   4),
  ('canary',        '검사기 고장 주입', '판정 함수에 나쁜 값을 넣으면 실제로 빨개지는지',            'ai_chk_canary',        5)
on conflict (slug) do update set name = excluded.name, description = excluded.description, fn = excluded.fn, sort = excluded.sort;

-- 시각은 UTC. 07:30 KST = 22:30 UTC(전날), 08:00 KST = 23:00 UTC(전날)
insert into ai_schedules(slug, name, cron_utc, kind, agent, instruction) values
  ('morning_checks',   '아침 전체 점검', '30 22 * * *', 'check',    null,    '활성 검사기 전체 실행'),
  ('morning_briefing', '아침 브리핑',    '0 23 * * *',  'briefing', 'chief', '전날 AI팀 작업·점검 결과·오늘 할 일을 대표에게 브리핑')
on conflict (slug) do nothing;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform ai_sync_schedules();
  else
    raise notice 'pg_cron 이 꺼져 있어 일정 등록을 건너뜀. 켠 뒤 select ai_sync_schedules(); 실행';
  end if;
end $$;
