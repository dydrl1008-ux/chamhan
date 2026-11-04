-- 1,000행 상한(PostgREST) 회피 — 대상 후보·키워드 목록을 jsonb 한 덩어리로
create or replace function mail_candidates_json(p_keyword text, p_days int default 3) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from mail_candidates(p_keyword, p_days) c
$$;
revoke all on function mail_candidates_json(text, int) from public, anon;
grant execute on function mail_candidates_json(text, int) to authenticated;

create or replace function mail_keywords_json() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb) from mail_keywords() k
$$;
revoke all on function mail_keywords_json() from public, anon;
grant execute on function mail_keywords_json() to authenticated;

-- 회신 매칭용: 계정이 최근 60일 보낸 주소 전부 (배열 — 행 상한 없음)
create or replace function mail_known_emails(p_account bigint) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct lower(to_email)), '{}'::text[]) from mail_queue
   where account_id = p_account and status = 'sent' and queued_at > now() - interval '60 days'
$$;
revoke all on function mail_known_emails(bigint) from public, anon;
grant execute on function mail_known_emails(bigint) to authenticated;
