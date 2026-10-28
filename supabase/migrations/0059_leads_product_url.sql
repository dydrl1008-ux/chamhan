-- 0059: 리드에 상품 URL 저장 (콜 리스트에서 바로 열기)
alter table leads add column if not exists product_url text not null default '';
create or replace function leads_upsert(p_rows jsonb, p_file text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; k text; n_add int := 0; n_upd int := 0; n_skip int := 0; imp bigint; was_new boolean;
begin
  if auth.uid() is not null and not can_see_all() then raise exception '권한 없음'; end if;
  insert into lead_imports(file_name, rows_in, uploaded_by) values (p_file, jsonb_array_length(p_rows), auth.uid()) returning id into imp;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(r->>'store_name'), '') = '' then n_skip := n_skip + 1; continue; end if;
    k := coalesce(nullif(lower(regexp_replace(coalesce(r->>'store_url', ''), '^https?://(www\.|m\.)?|/+$|\?.*$', '', 'g')), ''),
                  nullif('p:' || regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 'p:'),
                  'n:' || lower(regexp_replace(r->>'store_name', '\s', '', 'g')));
    insert into leads(store_name, store_url, product_url, keyword, category, phone, ad_running, rank_now, rank_prev, review_cnt, opened_on, source, dedupe_key, import_id)
    values (trim(r->>'store_name'), coalesce(r->>'store_url', ''), coalesce(r->>'product_url', ''), coalesce(r->>'keyword', ''), coalesce(r->>'category', ''),
            coalesce(r->>'phone', ''), coalesce((r->>'ad_running')::boolean, false),
            (r->>'rank_now')::int, (r->>'rank_prev')::int, (r->>'review_cnt')::int, (r->>'opened_on')::date, p_file, k, imp)
    on conflict (dedupe_key) do update set
      store_url  = coalesce(nullif(excluded.store_url, ''), leads.store_url),
      product_url = coalesce(nullif(excluded.product_url, ''), leads.product_url),
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
