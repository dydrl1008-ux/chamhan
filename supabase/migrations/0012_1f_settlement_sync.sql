-- =====================================================================
-- 1-F : 정산 사이트(lchkgy.com) 연동 — 정산승인 건을 가져와 담당자·요청일별 영업이익(÷1.1) → KPI 자동 마진
-- =====================================================================
-- KPI 마진 = 정산 자동값 + 직원 수동 추가분
alter table kpi_daily add column if not exists margin_auto   bigint not null default 0;
alter table kpi_daily add column if not exists margin_manual bigint not null default 0;
-- 기존 데이터: margin 을 수동값으로 이관
update kpi_daily set margin_manual = margin where margin_manual = 0 and margin_auto = 0 and margin <> 0;
create or replace function kpi_daily_before() returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' or new.team_id is null then select team_id into new.team_id from profiles where id = new.user_id; end if;
  -- 정산 자동값은 서비스롤(정산 동기화)·어드민만 변경 가능
  if auth.uid() is not null and not is_admin() then
    if tg_op='INSERT' then new.margin_auto := 0;
    elsif new.margin_auto is distinct from old.margin_auto then raise exception '정산 자동 마진은 수정할 수 없습니다' using errcode='42501'; end if;
  end if;
  new.margin := coalesce(new.margin_auto,0) + coalesce(new.margin_manual,0);
  new.updated_at := now();
  return new;
end $$;

-- 정산 원본 (정산번호 기준 중복 방지)
create table if not exists settlement_items (
  settle_no  text primary key,
  empl_id    text,
  req_date   date,
  profit     bigint not null default 0,          -- VAT 포함 원값
  status     text,
  raw        jsonb not null,
  synced_at  timestamptz not null default now()
);
create index if not exists settlement_items_date on settlement_items(req_date, empl_id);

-- 담당자ID → 워크허브 계정 (기본: 이메일 앞부분 일치, 여기서 수동 지정 가능)
create table if not exists settlement_empl_map (
  empl_id  text primary key,
  user_id  uuid references profiles(id),
  note     text,
  updated_at timestamptz not null default now()
);

-- 실행 이력
create table if not exists settlement_sync_runs (
  id bigserial primary key, started_at timestamptz not null default now(), finished_at timestamptz,
  ok boolean, message text, rows_fetched int default 0, rows_applied int default 0, range_from date, range_to date, triggered_by text
);

alter table settlement_items enable row level security; alter table settlement_empl_map enable row level security; alter table settlement_sync_runs enable row level security;
drop policy if exists si_admin on settlement_items;     create policy si_admin on settlement_items for all using (is_admin()) with check (is_admin());
drop policy if exists sem_admin on settlement_empl_map; create policy sem_admin on settlement_empl_map for all using (is_admin()) with check (is_admin());
drop policy if exists ssr_admin on settlement_sync_runs;create policy ssr_admin on settlement_sync_runs for all using (is_admin()) with check (is_admin());

-- 필드 매핑 설정 (연결 테스트 후 어드민이 지정). JSON: {"settle_no":"..","empl_id":"..","req_date":"..","profit":"..","status":"..","status_ok":"승인완료"}
insert into app_settings(key,value) values ('settle_field_map','{}') on conflict (key) do nothing;
insert into app_settings(key,value) values ('settle_vat_divisor','1.1') on conflict (key) do nothing;

-- 정산 원본 → kpi_daily.margin_auto 반영 (service role 에서 호출)
create or replace function apply_settlement_margin(p_from date, p_to date) returns int
language plpgsql security definer set search_path=public as $$
declare n int; v_div numeric := coalesce((select value::numeric from app_settings where key='settle_vat_divisor'),1.1);
begin
  perform assert_admin();
  with agg as (
    select coalesce(m.user_id, p.id) as user_id, s.req_date, round(sum(s.profit)/v_div) as margin_auto
    from settlement_items s
    left join settlement_empl_map m on m.empl_id = s.empl_id
    left join profiles p on p.is_active and split_part(p.email,'@',1) = s.empl_id
    where s.req_date between p_from and p_to and s.status = coalesce((select value::jsonb->>'status_ok' from app_settings where key='settle_field_map'),'승인완료')
    group by 1,2)
  insert into kpi_daily(user_id, work_date, margin_auto)
  select user_id, req_date, margin_auto from agg where user_id is not null
  on conflict (user_id, work_date) do update set margin_auto = excluded.margin_auto;
  get diagnostics n = row_count;
  -- 기간 내 정산 건이 사라진 날은 자동값 0 으로
  update kpi_daily k set margin_auto = 0
  where k.work_date between p_from and p_to and k.margin_auto <> 0
    and not exists (select 1 from settlement_items s left join settlement_empl_map m on m.empl_id=s.empl_id left join profiles p on split_part(p.email,'@',1)=s.empl_id
                    where s.req_date = k.work_date and coalesce(m.user_id,p.id) = k.user_id);
  return n;
end $$;
revoke all on function apply_settlement_margin(date,date) from public, anon, authenticated;
