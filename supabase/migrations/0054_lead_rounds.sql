-- 0054: 콜 리스트 — 결제(계약)·제외 전까지 계속 순환. 콜 차수(1차·2차·3차…)와 이력 기록
alter table leads add column if not exists contact_round int not null default 0;        -- 지금까지 콜한 횟수
alter table leads add column if not exists last_contact_by uuid references profiles(id) on delete set null;   -- 마지막 콜한 사람 (표시용)
alter table leads add column if not exists rejected_by uuid references profiles(id) on delete set null;       -- 마지막으로 거절당한 사람 (이 사람에겐 다시 안 감)
create table if not exists lead_contacts (                                                -- 콜 이력
  id         bigserial primary key,
  lead_id    bigint not null references leads(id) on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  round      int not null,
  status     text not null,
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists lead_contacts_lead_idx on lead_contacts(lead_id, created_at desc);
alter table lead_contacts enable row level security;
drop policy if exists lc_sel on lead_contacts;
create policy lc_sel on lead_contacts for select to authenticated using (can_see_all() or user_id = auth.uid() or exists (select 1 from leads l where l.id = lead_id and (l.assigned_to = auth.uid() or same_team(coalesce(l.assigned_to, user_id)))));

-- 거절·부재 뒤 다시 돌아오기까지: 기본 3일 (결제 전까지 계속 콜). 바꾸려면 콜 리스트 관리 › 설정
update app_settings set value = '3' where key = 'lead_recontact_days' and value = '30';

-- 결과 기록: 차수 +1, 이력 저장. 계약(won)·제외(excluded)만 순환 종료
create or replace function lead_set_result(p_id bigint, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_round int;
begin
  if p_status not in ('called','interested','rejected','won','excluded') then raise exception '잘못된 상태'; end if;
  update leads set status = p_status, note = coalesce(nullif(p_note, ''), note), last_result_at = now(),
         contact_round = contact_round + 1, last_contact_by = auth.uid()
   where id = p_id and (assigned_to = auth.uid() or can_see_all())
   returning contact_round into v_round;
  if not found then raise exception '본인에게 배정된 건만 기록할 수 있습니다'; end if;
  insert into lead_contacts(lead_id, user_id, round, status, note) values (p_id, auth.uid(), v_round, p_status, coalesce(p_note, ''));
end $$;
revoke all on function lead_set_result(bigint, text, text) from public, anon;
grant execute on function lead_set_result(bigint, text, text) to authenticated;

-- 배분: 한 번이라도 콜한 업체(차수>0)는 순위 조건 없이 계속 순환. 새 업체는 순위 하락 건만 (lead_only_rank_drop)
--       부재·거절·미기록 → 전부 순환 (전담 없음, 거절당한 사람에게만 다시 안 감) / 관심·계약·제외 → 순환 종료
create or replace function leads_assign_today(p_date date default (now() at time zone 'Asia/Seoul')::date) returns int
language plpgsql security definer set search_path = public as $$
declare per int := coalesce((select value::int from app_settings where key = 'lead_daily_per_person'), 30);
        recontact int := coalesce((select value::int from app_settings where key = 'lead_recontact_days'), 3);
        only_drop boolean := coalesce((select value from app_settings where key = 'lead_only_rank_drop'), 'true') = 'true';
        n int := 0; r record; pick uuid;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  perform leads_rescore();
  update leads set status = 'new', assigned_to = null, assigned_date = null where status = 'assigned' and assigned_date < p_date;
  update leads set status = 'new', assigned_to = null, assigned_date = null,
         rejected_by = case when status = 'rejected' then last_contact_by else rejected_by end        -- 거절당한 사람에겐 다시 안 감
   where status in ('called','rejected') and last_result_at < now() - make_interval(days => recontact);
  create temp table if not exists _need(id uuid primary key, name text, remain int, got int default 0) on commit drop;
  delete from _need where true;
  insert into _need(id, name, remain)
  select sp.id, sp.name, per - (select count(*) from leads x where x.assigned_to = sp.id and x.assigned_date = p_date) from lead_recipients() sp;
  delete from _need where remain <= 0;
  if exists (select 1 from _need) then
    for r in select id, last_contact_by, rejected_by from leads
             where status = 'new'
               and (contact_round > 0 or not only_drop or (rank_now is not null and rank_prev is not null and rank_now > rank_prev))
             order by contact_round desc, score desc, id loop        -- 진행 중인 업체(2차·3차) 먼저, 그다음 새 하락 업체
      select id into pick from _need where remain > 0 and id is distinct from r.rejected_by order by remain desc, name, id limit 1;   -- 거절당한 사람만 제외, 나머지 순환
      if pick is null then
        if exists (select 1 from _need where remain > 0) then continue; end if;   -- 남은 사람이 거절당한 사람뿐이면 오늘은 보류
        exit;
      end if;
      update leads set status = 'assigned', assigned_to = pick, assigned_date = p_date where id = r.id;
      update _need set remain = remain - 1, got = got + 1 where id = pick;
    end loop;
    insert into notifications(user_id, kind, title, body, link)
    select id, 'lead', '오늘의 콜 리스트 +' || got || '건', '점수 높은 순으로 정리돼 있습니다.', '/calls' from _need where got > 0;
  end if;
  select count(*) into n from leads where assigned_date = p_date and status = 'assigned';
  return n;
end $$;
revoke all on function leads_assign_today(date) from public, anon;
grant execute on function leads_assign_today(date) to authenticated;
