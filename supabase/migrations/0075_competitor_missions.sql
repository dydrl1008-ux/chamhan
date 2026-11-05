-- 경쟁사 리워드 미션 — 미션 앱(캐시플랜 등)에서 크롤링한 (키워드, 상품) + 시크릿 지수 매칭 결과
create table if not exists competitor_missions (
  id           bigserial primary key,
  app          text not null,                       -- com.cashpanda 등
  keyword      text not null,
  product      text not null default '',            -- OCR 상품명(원문)
  kind         text not null default 'nshop',       -- nshop | place | coupang
  points       text not null default '',
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  seen_cnt     int not null default 1,
  -- 시크릿 지수 매칭 (쇼핑만)
  matched_at   timestamptz,
  mall_name    text not null default '',
  product_title text not null default '',
  product_url  text not null default '',
  nvmid        text not null default '',
  rank_first   int,                                 -- 처음 매칭 때 순위
  rank_now     int,
  rank_at      timestamptz,
  match_score  int,                                 -- 제목 토큰 일치 수
  note         text not null default '',
  unique (app, keyword, product)
);
create index if not exists competitor_missions_kw_idx on competitor_missions(keyword);
create index if not exists competitor_missions_seen_idx on competitor_missions(last_seen desc);
alter table competitor_missions enable row level security;
drop policy if exists cm_sel on competitor_missions; create policy cm_sel on competitor_missions for select to authenticated using (true);

-- 크롤러 일괄 등록 (같은 앱·키워드·상품은 last_seen·seen_cnt 갱신)
create or replace function competitor_missions_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n_add int := 0; n_upd int := 0; was_new boolean;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(r->>'keyword'), '') = '' then continue; end if;
    insert into competitor_missions(app, keyword, product, kind, points, first_seen, last_seen)
    values (coalesce(r->>'app', ''), trim(r->>'keyword'), coalesce(trim(r->>'product'), ''), coalesce(r->>'kind', 'nshop'), coalesce(r->>'points', ''),
            coalesce((r->>'first_seen')::timestamptz, now()), coalesce((r->>'last_seen')::timestamptz, now()))
    on conflict (app, keyword, product) do update set
      last_seen = greatest(competitor_missions.last_seen, excluded.last_seen), seen_cnt = competitor_missions.seen_cnt + 1,
      kind = excluded.kind, points = case when excluded.points <> '' then excluded.points else competitor_missions.points end
    returning (xmax = 0) into was_new;
    if was_new then n_add := n_add + 1; else n_upd := n_upd + 1; end if;
  end loop;
  return jsonb_build_object('added', n_add, 'updated', n_upd);
end $$;
revoke all on function competitor_missions_import(jsonb) from public, anon, authenticated;
