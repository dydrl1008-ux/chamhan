-- =====================================================================
-- 워크허브 1-E : 상품 · 프로모션 · 관리팀 업무 · 영업이익 · 자산/계정 · 보고서 양식
-- =====================================================================

-- ---------- 상품 안내 (전원 열람, 어드민 편집) ----------
create table if not exists products (
  id serial primary key, name text not null, category text, description text, unit_price text,
  intake_process text, required_materials text, owner_id uuid references profiles(id), caution text,
  sort_order int not null default 0, is_active boolean not null default true, updated_at timestamptz not null default now());
drop trigger if exists products_updated_at on products; create trigger products_updated_at before update on products for each row execute function set_updated_at();
alter table products enable row level security;
drop policy if exists prod_select on products; create policy prod_select on products for select using (auth.uid() is not null);
drop policy if exists prod_admin on products;  create policy prod_admin on products for all using (is_admin()) with check (is_admin());

-- ---------- 프로모션 (메인 배너) ----------
create table if not exists promotions (
  id serial primary key, title text not null, body text, link_url text, starts_at date, ends_at date,
  sort_order int not null default 0, is_active boolean not null default true, updated_at timestamptz not null default now());
drop trigger if exists promotions_updated_at on promotions; create trigger promotions_updated_at before update on promotions for each row execute function set_updated_at();
alter table promotions enable row level security;
drop policy if exists promo_select on promotions; create policy promo_select on promotions for select using (auth.uid() is not null);
drop policy if exists promo_admin on promotions;  create policy promo_admin on promotions for all using (is_admin()) with check (is_admin());

-- ---------- 관리팀 담당업무 (어드민) ----------
create table if not exists mgmt_duties (
  id serial primary key, owner_id uuid references profiles(id), title text not null, detail text, cycle text, systems text,
  backup_id uuid references profiles(id), sort_order int not null default 0, is_active boolean not null default true, updated_at timestamptz not null default now());
drop trigger if exists mgmt_duties_updated_at on mgmt_duties; create trigger mgmt_duties_updated_at before update on mgmt_duties for each row execute function set_updated_at();
alter table mgmt_duties enable row level security;
drop policy if exists duty_admin on mgmt_duties; create policy duty_admin on mgmt_duties for all using (is_admin()) with check (is_admin());

-- ---------- 영업이익 월별 (어드민) ----------
create table if not exists pnl_categories (id serial primary key, name text not null unique, sort_order int not null default 0, is_active boolean not null default true);
create table if not exists pnl_months (month date primary key, operating_profit bigint not null default 0, note text, updated_at timestamptz not null default now(), check (extract(day from month)=1));
create table if not exists pnl_items (month date references pnl_months(month) on delete cascade, category_id int references pnl_categories(id), amount bigint not null default 0, note text, primary key (month, category_id));
drop trigger if exists pnl_months_updated_at on pnl_months; create trigger pnl_months_updated_at before update on pnl_months for each row execute function set_updated_at();
drop trigger if exists pnl_months_audit on pnl_months; create trigger pnl_months_audit after insert or update or delete on pnl_months for each row execute function audit_row();
alter table pnl_categories enable row level security; alter table pnl_months enable row level security; alter table pnl_items enable row level security;
drop policy if exists pnlc_admin on pnl_categories; create policy pnlc_admin on pnl_categories for all using (is_admin()) with check (is_admin());
drop policy if exists pnlm_admin on pnl_months;     create policy pnlm_admin on pnl_months for all using (is_admin()) with check (is_admin());
drop policy if exists pnli_admin on pnl_items;      create policy pnli_admin on pnl_items for all using (is_admin()) with check (is_admin());
insert into pnl_categories(name,sort_order) values ('급여',1),('운영관리',2),('임차료',3),('회사광고비',4),('복리후생비',5),('통신비',6),('잡금',7),('수수료',8),('세금보험',9) on conflict (name) do nothing;
create or replace view v_pnl_summary with (security_invoker = on) as
select m.month, m.operating_profit, coalesce(sum(i.amount),0) as total_cost, m.operating_profit - coalesce(sum(i.amount),0) as net_profit
from pnl_months m left join pnl_items i on i.month = m.month group by m.month, m.operating_profit;

-- ---------- 자산 · 계정 (어드민, 비밀번호는 앱에서 AES 암호화 후 저장) ----------
create table if not exists assets_businesses (id serial primary key, name text not null, reg_no text, ceo text, purpose text, note text, is_active boolean not null default true);
create table if not exists assets_phones (id serial primary key, phone_no text not null, device text, owner_id uuid references profiles(id), business_id int references assets_businesses(id), carrier text, opened_at date, note text, is_active boolean not null default true);
create table if not exists assets_accounts (id serial primary key, service text not null, login_id text not null, password_enc text, business_id int references assets_businesses(id), owner_id uuid references profiles(id), payment_method text, renew_note text, url text, note text, is_active boolean not null default true, updated_at timestamptz not null default now());
create table if not exists asset_access_logs (id bigserial primary key, user_id uuid, account_id int, action text not null, at timestamptz not null default now());
drop trigger if exists assets_accounts_updated_at on assets_accounts; create trigger assets_accounts_updated_at before update on assets_accounts for each row execute function set_updated_at();
alter table assets_businesses enable row level security; alter table assets_phones enable row level security; alter table assets_accounts enable row level security; alter table asset_access_logs enable row level security;
drop policy if exists ab_admin on assets_businesses; create policy ab_admin on assets_businesses for all using (is_admin()) with check (is_admin());
drop policy if exists ap_admin on assets_phones;     create policy ap_admin on assets_phones for all using (is_admin()) with check (is_admin());
drop policy if exists aa_admin on assets_accounts;   create policy aa_admin on assets_accounts for all using (is_admin()) with check (is_admin());
drop policy if exists al_admin on asset_access_logs; create policy al_admin on asset_access_logs for all using (is_admin()) with check (is_admin());

-- ---------- 보고서 양식 ----------
do $$ begin if not exists (select 1 from pg_type where typname='form_period') then create type form_period as enum ('daily','weekly','monthly','adhoc'); end if; end $$;
create table if not exists report_forms (
  id serial primary key, name text not null, period form_period not null default 'daily', description text,
  created_by uuid references profiles(id), is_active boolean not null default true, updated_at timestamptz not null default now());
create table if not exists report_form_fields (
  id serial primary key, form_id int not null references report_forms(id) on delete cascade, key text not null, label text not null,
  type text not null check (type in ('text','textarea','number','select','date','checkbox','auto_margin_today','auto_margin_month','auto_plan_rate','auto_attendance')),
  options jsonb, required boolean not null default false, sort_order int not null default 0, unique (form_id, key));
create table if not exists report_form_assignments (
  id serial primary key, form_id int not null references report_forms(id) on delete cascade,
  team_id int references teams(id), role user_role, user_id uuid references profiles(id), only_mgmt boolean not null default false,
  check (team_id is not null or role is not null or user_id is not null or only_mgmt));
create table if not exists report_submissions (
  id bigserial primary key, form_id int not null references report_forms(id), user_id uuid not null references profiles(id),
  period_key text not null, data jsonb not null default '{}', status text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (form_id, user_id, period_key));
drop trigger if exists report_submissions_updated_at on report_submissions; create trigger report_submissions_updated_at before update on report_submissions for each row execute function set_updated_at();
drop trigger if exists report_forms_audit on report_forms; create trigger report_forms_audit after insert or update or delete on report_forms for each row execute function audit_row();
alter table report_forms enable row level security; alter table report_form_fields enable row level security; alter table report_form_assignments enable row level security; alter table report_submissions enable row level security;
drop policy if exists rf_select on report_forms;  create policy rf_select on report_forms for select using (auth.uid() is not null);
drop policy if exists rf_admin on report_forms;   create policy rf_admin on report_forms for all using (is_admin()) with check (is_admin());
drop policy if exists rff_select on report_form_fields; create policy rff_select on report_form_fields for select using (auth.uid() is not null);
drop policy if exists rff_admin on report_form_fields;  create policy rff_admin on report_form_fields for all using (is_admin()) with check (is_admin());
drop policy if exists rfa_select on report_form_assignments; create policy rfa_select on report_form_assignments for select using (auth.uid() is not null);
drop policy if exists rfa_admin on report_form_assignments;  create policy rfa_admin on report_form_assignments for all using (is_admin()) with check (is_admin());
drop policy if exists rs_select on report_submissions; create policy rs_select on report_submissions for select using (user_id = auth.uid() or can_see_all() or same_team(user_id));
drop policy if exists rs_write on report_submissions;  create policy rs_write on report_submissions for all using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

-- 나에게 배정된 양식
create or replace function my_forms() returns setof report_forms language sql stable security definer set search_path=public as $$
  select distinct f.* from report_forms f join report_form_assignments a on a.form_id = f.id
  join profiles p on p.id = auth.uid()
  where f.is_active and (a.user_id = p.id or a.role = p.role or (a.team_id is not null and a.team_id = p.team_id) or (a.only_mgmt and p.is_mgmt))
  order by f.id $$;
