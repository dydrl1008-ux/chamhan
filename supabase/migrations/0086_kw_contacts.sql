-- 0086 키워드 콜 리스트 — 추출기 CSV 의 연락처(대표자·전화·이메일·주소)를 키워드별로 모아 두는 표. 기존 콜 리스트(leads·자동 배분)와 별개
create table if not exists kw_contacts (
  id         bigserial primary key,
  store_key  text not null unique,
  store_name text not null default '',
  store_url  text not null default '',
  company    text not null default '',
  rep        text not null default '',
  email      text not null default '',
  phone      text not null default '',
  address    text not null default '',
  biz_no     text not null default '',
  keywords   text[] not null default '{}',
  claimed_by uuid references profiles(id) on delete set null,
  result     text not null default '',
  memo       text not null default '',
  result_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kw_contacts_kw on kw_contacts using gin(keywords);
alter table kw_contacts enable row level security;

create or replace function kw_contacts_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; k text; kw text; n_add int := 0; n_upd int := 0; n_skip int := 0; was_new boolean;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(r->>'store_name'), '') = '' or (coalesce(trim(r->>'phone'), '') = '' and coalesce(trim(r->>'email'), '') = '') then n_skip := n_skip + 1; continue; end if;
    kw := coalesce(trim(r->>'keyword'), '');
    k := coalesce(nullif(lower(regexp_replace(coalesce(r->>'store_url', ''), '^https?://(www\.|m\.)?|/+$|\?.*$', '', 'g')), ''),
                  nullif('p:' || regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g'), 'p:'),
                  'n:' || lower(regexp_replace(r->>'store_name', '\s', '', 'g')));
    insert into kw_contacts(store_key, store_name, store_url, company, rep, email, phone, address, biz_no, keywords)
    values (k, trim(r->>'store_name'), coalesce(r->>'store_url', ''), coalesce(r->>'company', ''), coalesce(r->>'rep', ''), lower(coalesce(r->>'email', '')),
            coalesce(r->>'phone', ''), coalesce(r->>'address', ''), coalesce(r->>'biz_no', ''), case when kw = '' then '{}'::text[] else array[kw] end)
    on conflict (store_key) do update set
      store_name = excluded.store_name,
      store_url  = coalesce(nullif(excluded.store_url, ''), kw_contacts.store_url),
      company    = coalesce(nullif(excluded.company, ''), kw_contacts.company),
      rep        = coalesce(nullif(excluded.rep, ''), kw_contacts.rep),
      email      = coalesce(nullif(excluded.email, ''), kw_contacts.email),
      phone      = coalesce(nullif(excluded.phone, ''), kw_contacts.phone),
      address    = coalesce(nullif(excluded.address, ''), kw_contacts.address),
      biz_no     = coalesce(nullif(excluded.biz_no, ''), kw_contacts.biz_no),
      keywords   = case when kw = '' or kw = any(kw_contacts.keywords) then kw_contacts.keywords else kw_contacts.keywords || kw end,
      updated_at = now()
    returning (xmax = 0) into was_new;
    if was_new then n_add := n_add + 1; else n_upd := n_upd + 1; end if;
  end loop;
  return jsonb_build_object('added', n_add, 'updated', n_upd, 'skipped', n_skip);
end $$;
revoke all on function kw_contacts_import(jsonb) from public, anon, authenticated;

create or replace function kw_contact_keywords() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('keyword', k, 'n', n, 'open', o) order by n desc, k), '[]'::jsonb)
  from (select k, count(*) as n, count(*) filter (where c.result = '') as o from kw_contacts c, unnest(c.keywords) k group by k) x
$$;
revoke all on function kw_contact_keywords() from public, anon, authenticated;
