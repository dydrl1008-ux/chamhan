-- 회신 알림에 전화·스토어 링크, 「열기」는 그 발송 행으로
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
  values (q.sender_id, 'lead', '📩 메일 회신 — ' || coalesce(nullif(t.store_name, ''), q.store_name, q.to_email),
          left(q.to_email || case when coalesce(t.phone, '') <> '' then ' · ' || t.phone else '' end || case when coalesce(t.store_url, '') <> '' then ' · ' || t.store_url else '' end
               || E'\n' || coalesce(p_subject, '') || ' · ' || coalesce(p_snippet, ''), 400), '/mail?hl=' || p_queue_id);
  return lid;
end $$;
revoke all on function mail_reply_lead(bigint, text, text, timestamptz) from public, anon, authenticated;
