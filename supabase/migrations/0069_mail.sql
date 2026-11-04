-- 메일 영업. 대상 = 수집기가 /api/cron/mail-import 로 보내는 이메일 있는 업체(콜 리스트와 별도). 발송·회신 확인 = 직원 PC의 SNS_Manager(localhost:5555)가 본인 네이버 계정으로.

-- ── 1. 직원별 네이버 메일 계정 ───────────────────────────────────────────
create table if not exists mail_accounts (
  user_id         uuid primary key references profiles(id) on delete cascade,
  email           text not null,
  app_pw_enc      text not null,                        -- 앱 비밀번호 (AES-256-GCM, ASSET_SECRET)
  from_name       text not null default '',
  daily_limit     int  not null default 200,
  verified_at     timestamptz,                          -- SNS_Manager 로그인 확인 시각
  imap_last_uid   bigint not null default 0,            -- 회신 확인 진행 위치
  imap_checked_at timestamptz,
  tpl_subject     text not null default '',
  tpl_body        text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
drop trigger if exists mail_accounts_updated on mail_accounts;
create trigger mail_accounts_updated before update on mail_accounts for each row execute function set_updated_at();
alter table mail_accounts enable row level security;
drop policy if exists ma_sel on mail_accounts; create policy ma_sel on mail_accounts for select to authenticated using (user_id = auth.uid() or can_see_all());

-- ── 2. 메일 대상 업체 (수집기 → mail-import) ────────────────────────────
create table if not exists mail_targets (
  id           bigserial primary key,
  store_key    text not null unique,                    -- leads.dedupe_key 와 같은 규칙 (URL > 전화 > 업체명)
  store_name   text not null default '',
  store_url    text not null default '',
  product_url  text not null default '',
  email        text not null default '',
  phone        text not null default '',
  keywords     text[] not null default '{}',
  category     text not null default '',
  rank_now     int,
  review_cnt   int,
  opened_on    date,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists mail_targets_kw_idx on mail_targets using gin(keywords);
create index if not exists mail_targets_email_idx on mail_targets(lower(email));
drop trigger if exists mail_targets_updated on mail_targets;
create trigger mail_targets_updated before update on mail_targets for each row execute function set_updated_at();
alter table mail_targets enable row level security;
drop policy if exists mt_sel on mail_targets; create policy mt_sel on mail_targets for select to authenticated using (true);

-- 수집기 일괄 등록. rows: [{store_name, store_url, product_url, keyword, email, phone, category, rank_now, review_cnt, opened_on}]
create or replace function mail_targets_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; k text; em text; kw text; n_add int := 0; n_upd int := 0; n_skip int := 0; was_new boolean;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    em := lower(trim(coalesce(r->>'email', '')));
    if em = '' or position('@' in em) = 0 or coalesce(trim(r->>'store_name'), '') = '' then n_skip := n_skip + 1; continue; end if;
    kw := coalesce(trim(r->>'keyword'), '');
    k := coalesce(nullif(lower(regexp_replace(coalesce(r->>'store_url', ''), '^https?://(www\.|m\.)?|/+$|\?.*$', '', 'g')), ''),
                  nullif('p:' || regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 'p:'),
                  'n:' || lower(regexp_replace(r->>'store_name', '\s', '', 'g')));
    insert into mail_targets(store_key, store_name, store_url, product_url, email, phone, keywords, category, rank_now, review_cnt, opened_on)
    values (k, trim(r->>'store_name'), coalesce(r->>'store_url', ''), coalesce(r->>'product_url', ''), em, coalesce(r->>'phone', ''),
            case when kw = '' then '{}'::text[] else array[kw] end, coalesce(r->>'category', ''), (r->>'rank_now')::int, (r->>'review_cnt')::int, (r->>'opened_on')::date)
    on conflict (store_key) do update set
      store_name  = excluded.store_name,
      store_url   = coalesce(nullif(excluded.store_url, ''), mail_targets.store_url),
      product_url = coalesce(nullif(excluded.product_url, ''), mail_targets.product_url),
      email       = excluded.email,
      phone       = coalesce(nullif(excluded.phone, ''), mail_targets.phone),
      keywords    = case when kw = '' or kw = any(mail_targets.keywords) then mail_targets.keywords else mail_targets.keywords || kw end,
      category    = coalesce(nullif(excluded.category, ''), mail_targets.category),
      rank_now    = coalesce(excluded.rank_now, mail_targets.rank_now),
      review_cnt  = coalesce(excluded.review_cnt, mail_targets.review_cnt),
      opened_on   = coalesce(excluded.opened_on, mail_targets.opened_on),
      last_seen_at = now()
    returning (xmax = 0) into was_new;
    if was_new then n_add := n_add + 1; else n_upd := n_upd + 1; end if;
  end loop;
  return jsonb_build_object('added', n_add, 'updated', n_upd, 'skipped', n_skip);
end $$;
revoke all on function mail_targets_import(jsonb) from public, anon, authenticated;

-- ── 3. 발송 큐 · 기록 ───────────────────────────────────────────────────
create table if not exists mail_queue (
  id             bigserial primary key,
  sender_id      uuid not null references profiles(id) on delete cascade,
  target_id      bigint references mail_targets(id) on delete set null,
  to_email       text not null,
  store_name     text not null default '',
  keyword        text not null default '',
  subject        text not null default '',
  body           text not null default '',
  proposal_code  text references proposals(code) on delete set null,
  message_id     text,                                  -- <wh.큐번호.난수@...> 회신 매칭용
  job_token      text,                                  -- SNS_Manager 결과 콜백 인증
  status         text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  error          text,
  queued_at      timestamptz not null default now(),
  sent_at        timestamptz,
  opened_at      timestamptz,
  open_cnt       int not null default 0,
  replied_at     timestamptz
);
create index if not exists mail_queue_status_idx on mail_queue(status, queued_at);
create index if not exists mail_queue_sender_idx on mail_queue(sender_id, queued_at desc);
create index if not exists mail_queue_email_idx on mail_queue(lower(to_email), queued_at desc);
alter table mail_queue enable row level security;
drop policy if exists mq_sel on mail_queue; create policy mq_sel on mail_queue for select to authenticated using (sender_id = auth.uid() or can_see_all()
  or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'manager' and p.team_id = (select team_id from profiles s where s.id = mail_queue.sender_id)));

create table if not exists mail_replies (
  id           bigserial primary key,
  queue_id     bigint references mail_queue(id) on delete set null,
  sender_id    uuid references profiles(id) on delete set null,
  from_email   text not null,
  subject      text not null default '',
  snippet      text not null default '',
  received_at  timestamptz,
  lead_id      bigint references leads(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists mail_replies_uq on mail_replies(sender_id, from_email, coalesce(received_at, created_at));
alter table mail_replies enable row level security;
drop policy if exists mr_sel on mail_replies; create policy mr_sel on mail_replies for select to authenticated using (sender_id = auth.uid() or can_see_all());

insert into app_settings(key, value) values ('mail_recontact_days', '3'), ('mail_daily_limit', '200') on conflict (key) do nothing;

-- ── 4. 키워드 대상 후보 + 제외 사유 ─────────────────────────────────────
-- 영구: 수신거부 / 회신한 이메일 / 기존 고객(업체명·전화) / 콜 리스트에서 관심·계약 중인 업체(담당자 표시)   일시: 누가 보냈든 p_days 일 내 발송
create or replace function mail_candidates(p_keyword text, p_days int default 3)
returns table (id bigint, store_name text, store_url text, email text, phone text, rank_now int, review_cnt int,
               optout boolean, replied boolean, ours text, interest text, recent_by text, recent_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.store_name, t.store_url, t.email, t.phone, t.rank_now, t.review_cnt,
    exists (select 1 from email_optouts o where o.email = lower(t.email)) as optout,
    exists (select 1 from mail_queue q where lower(q.to_email) = lower(t.email) and q.replied_at is not null) as replied,
    (select why from our_customer_keys() k where k.k = 'n:' || norm_name(t.store_name)
        or (length(regexp_replace(t.phone, '\D', '', 'g')) = 11 and k.k = 'p:' || regexp_replace(t.phone, '\D', '', 'g')) limit 1) as ours,
    (select coalesce(p.name, '') || case when l.status = 'won' then ' 계약' else ' 관심' end
       from leads l left join profiles p on p.id = coalesce(l.assigned_to, l.last_contact_by)
      where l.status in ('interested', 'won')
        and (l.dedupe_key = t.store_key or (l.name_key <> '' and l.name_key = norm_name(t.store_name))
             or (length(regexp_replace(t.phone, '\D', '', 'g')) = 11 and l.phone_key = regexp_replace(t.phone, '\D', '', 'g')))
      order by l.last_result_at desc nulls last limit 1) as interest,
    (select p.name from mail_queue q join profiles p on p.id = q.sender_id
      where lower(q.to_email) = lower(t.email) and q.status in ('queued','sending','sent') and q.queued_at > now() - make_interval(days => p_days)
      order by q.queued_at desc limit 1) as recent_by,
    (select max(q.queued_at) from mail_queue q where lower(q.to_email) = lower(t.email) and q.status in ('queued','sending','sent') and q.queued_at > now() - make_interval(days => p_days)) as recent_at
  from mail_targets t
  where p_keyword = any(t.keywords) and t.email <> ''
  order by coalesce(t.rank_now, 999), t.id
$$;
revoke all on function mail_candidates(text, int) from public, anon;
grant execute on function mail_candidates(text, int) to authenticated;

-- 키워드 목록 (대상 수 · 이메일 있는 업체 수)
create or replace function mail_keywords() returns table (keyword text, n bigint)
language sql stable security definer set search_path = public as $$
  select k, count(*) from mail_targets t, unnest(t.keywords) k where t.email <> '' group by k order by count(*) desc, k
$$;
revoke all on function mail_keywords() from public, anon;
grant execute on function mail_keywords() to authenticated;

-- ── 5. 회신 → 리드 「관심」 + 보낸 사람 담당 + 오늘 콜 리스트 맨 위 + 알림 ──────
create or replace function mail_reply_lead(p_queue_id bigint, p_subject text, p_snippet text, p_received timestamptz)
returns bigint language plpgsql security definer set search_path = public as $$
declare q mail_queue; t mail_targets; lid bigint; k text; today date := (now() at time zone 'Asia/Seoul')::date; note_txt text;
begin
  select * into q from mail_queue where id = p_queue_id; if not found then return null; end if;
  if q.target_id is not null then select * into t from mail_targets where id = q.target_id; end if;
  k := coalesce(t.store_key, 'mail:' || lower(q.to_email));
  note_txt := left('📩 메일 회신 (' || to_char(coalesce(p_received, now()) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') || ') ' || coalesce(p_snippet, ''), 300);
  select id into lid from leads where dedupe_key = k
     or (coalesce(t.store_name, '') <> '' and name_key = norm_name(t.store_name))
     or (length(regexp_replace(coalesce(t.phone, ''), '\D', '', 'g')) = 11 and phone_key = regexp_replace(t.phone, '\D', '', 'g'))
   order by (dedupe_key = k) desc, id limit 1;
  if lid is null then
    insert into leads(store_name, store_url, product_url, keyword, phone, source, dedupe_key, status, assigned_to, assigned_date, score, score_why, last_result_at, note)
    values (coalesce(nullif(t.store_name, ''), q.store_name, q.to_email), coalesce(t.store_url, ''), coalesce(t.product_url, ''), q.keyword, coalesce(t.phone, ''), 'mail_reply', k,
            'interested', q.sender_id, today, 999, '메일 회신', now(), note_txt)
    on conflict (dedupe_key) do update set status = 'interested', assigned_to = q.sender_id, assigned_date = today, score = 999, last_result_at = now(),
            note = left(note_txt || case when leads.note <> '' then ' · ' || leads.note else '' end, 1000)
    returning id into lid;
  else
    update leads set status = 'interested', assigned_to = q.sender_id, assigned_date = today, score = 999, last_result_at = now(),
           note = left(note_txt || case when note <> '' then ' · ' || note else '' end, 1000)
     where id = lid;
  end if;
  update mail_queue set replied_at = coalesce(replied_at, coalesce(p_received, now())) where id = p_queue_id;
  insert into notifications(user_id, kind, title, body, link)
  values (q.sender_id, 'lead', '📩 메일 회신 — ' || coalesce(nullif(t.store_name, ''), q.store_name, q.to_email), left(coalesce(p_subject, '') || ' · ' || coalesce(p_snippet, ''), 300), '/calls');
  return lid;
end $$;
revoke all on function mail_reply_lead(bigint, text, text, timestamptz) from public, anon, authenticated;

-- ── 6. 콜 성과용 집계 (직원별 발송·열람·회신) ────────────────────────────
create or replace function mail_stats(p_since timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('sender_id', s.sender_id, 'sent', s.sent, 'opened', s.opened, 'replied', s.replied)), '[]'::jsonb)
  from (select sender_id, count(*) filter (where status = 'sent') as sent, count(*) filter (where opened_at is not null) as opened, count(*) filter (where replied_at is not null) as replied
        from mail_queue where queued_at >= p_since group by sender_id) s
$$;
revoke all on function mail_stats(timestamptz) from public, anon;
grant execute on function mail_stats(timestamptz) to authenticated;
