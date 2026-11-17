-- 0084 메일 대상: 수동 전용 (추출기 CSV 로 올린 업체 — 「수동 발송 엑셀」에만 나오고 직원 자동 발송에는 안 나옴)
alter table mail_targets add column if not exists manual_only boolean not null default false;

create or replace function mail_targets_import2(p_rows jsonb, p_manual boolean default false) returns jsonb
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
    insert into mail_targets(store_key, store_name, store_url, product_url, email, phone, keywords, category, rank_now, review_cnt, opened_on, manual_only)
    values (k, trim(r->>'store_name'), coalesce(r->>'store_url', ''), coalesce(r->>'product_url', ''), em, coalesce(r->>'phone', ''),
            case when kw = '' then '{}'::text[] else array[kw] end, coalesce(r->>'category', ''), (r->>'rank_now')::int, (r->>'review_cnt')::int, (r->>'opened_on')::date, p_manual)
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
      manual_only = mail_targets.manual_only and p_manual,   -- 수집기가 같은 업체를 찾으면 일반 대상으로 전환, 추출기 CSV 가 기존 일반 대상을 수동 전용으로 바꾸지는 않음
      last_seen_at = now()
    returning (xmax = 0) into was_new;
    if was_new then n_add := n_add + 1; else n_upd := n_upd + 1; end if;
  end loop;
  return jsonb_build_object('added', n_add, 'updated', n_upd, 'skipped', n_skip);
end $$;
revoke all on function mail_targets_import2(jsonb, boolean) from public, anon, authenticated;

-- 기존 수집기 경로는 그대로 (일반 대상)
create or replace function mail_targets_import(p_rows jsonb) returns jsonb
language sql security definer set search_path = public as $$ select mail_targets_import2(p_rows, false) $$;
revoke all on function mail_targets_import(jsonb) from public, anon, authenticated;

-- 후보 조회에 manual_only 열 추가 (반환 열이 바뀌어 지우고 다시 만든다)
drop function if exists mail_candidates(text, int);
create or replace function mail_candidates(p_keyword text, p_days int default 3)
returns table (id bigint, store_name text, store_url text, email text, phone text, rank_now int, review_cnt int,
               optout boolean, replied boolean, ours text, interest text, recent_by text, recent_at timestamptz, manual_only boolean)
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
    (select max(q.queued_at) from mail_queue q where lower(q.to_email) = lower(t.email) and q.status in ('queued','sending','sent') and q.queued_at > now() - make_interval(days => p_days)) as recent_at,
    t.manual_only
  from mail_targets t
  where p_keyword = any(t.keywords) and t.email <> ''
  order by coalesce(t.rank_now, 999), t.id
$$;
revoke all on function mail_candidates(text, int) from public, anon;
grant execute on function mail_candidates(text, int) to authenticated;
