-- 0068: 콜 성과 집계 — 행을 안 가져오고 DB에서 묶어서 (Vercel 시간 제한·1,000행 상한 회피)
-- ※ chamhan 프로젝트에서 실행
create or replace function sales_stats(p_since timestamptz)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'by_user', (select coalesce(jsonb_agg(x), '[]') from (
        select c.user_id, c.status, count(*)::int n
        from lead_contacts c where c.created_at >= p_since and c.user_id is not null
        group by c.user_id, c.status) x),
    'by_kw', (select coalesce(jsonb_agg(x), '[]') from (
        select l.keyword, c.status, count(*)::int n
        from lead_contacts c join leads l on l.id = c.lead_id
        where c.created_at >= p_since group by l.keyword, c.status) x),
    'by_day', (select coalesce(jsonb_agg(x), '[]') from (
        select ((c.created_at at time zone 'Asia/Seoul')::date)::text d, c.status, count(*)::int n
        from lead_contacts c where c.created_at >= p_since group by 1, 2) x),
    'props', (select coalesce(jsonb_agg(x), '[]') from (
        select p.owner_id, count(*)::int links,
               count(*) filter (where p.views > 0)::int viewed,
               count(*) filter (where p.views > 0 and l.status = 'won')::int viewed_won
        from proposals p left join leads l on l.id = p.lead_id
        where p.created_at >= p_since and p.owner_id is not null group by p.owner_id) x),
    'assigned', (select coalesce(jsonb_agg(x), '[]') from (
        select assigned_to, count(*)::int n from leads
        where assigned_date = (now() at time zone 'Asia/Seoul')::date and assigned_to is not null
        group by assigned_to) x)
  );
$$;
revoke all on function sales_stats(timestamptz) from public, anon;
grant execute on function sales_stats(timestamptz) to authenticated;
