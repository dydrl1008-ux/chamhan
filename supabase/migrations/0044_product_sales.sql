-- ============================================================================
-- 0044 · 상품별 월 판매 수량 (영업 마진 화면)
--   요청일(req_date) 기준 · 회사 월(21일~20일) · 승인완료 + 승인요청(대기) · 환불은 따로 셈
--   본인 것만. 팀장은 자기 팀원, 어드민·총괄은 전체를 골라 볼 수 있음
-- ============================================================================
create or replace function product_sales(p_from date, p_to date, p_user uuid default null)
returns table(month_key text, prod_name text, gubun text, approved boolean, refund boolean, cnt int, inflow bigint, sale_total bigint, profit bigint)
language plpgsql stable security definer set search_path = public as $$
declare target uuid := coalesce(p_user, auth.uid()); empl text;
begin
  if target is null then raise exception '로그인 필요'; end if;
  if target <> auth.uid() and not can_see_all()
     and not (my_role() = 'manager' and (select team_id from profiles where id = target) = (select team_id from profiles where id = auth.uid())) then
    raise exception '권한 없음';
  end if;
  select coalesce(m.empl_id, c.settle_user_id, split_part(p.email, '@', 1)) into empl
  from profiles p left join settlement_empl_map m on m.user_id = p.id left join settlement_credentials c on c.user_id = p.id
  where p.id = target;
  return query
  select to_char(date_trunc('month', s.req_date) + case when extract(day from s.req_date) >= 21 then interval '1 month' else interval '0' end, 'YYYY-MM'),
         coalesce(nullif(trim(s.raw->>'prodName'), ''), '(상품 없음)'),
         coalesce(nullif(trim(coalesce(s.raw->>'gubunName', s.raw->>'reqGubunName')), ''), '-'),
         s.status = '승인완료',
         coalesce(s.raw->>'refundInd', '') = 'Y',
         count(*)::int,
         sum(coalesce(nullif(regexp_replace(coalesce(s.raw->>'inflowCnt', '0'), '[^0-9-]', '', 'g'), '')::bigint, 0))::bigint,
         sum(coalesce(nullif(regexp_replace(coalesce(s.raw->>'saleTotalAmt', '0'), '[^0-9.-]', '', 'g'), '')::numeric, 0))::bigint,
         sum(coalesce(s.profit, 0))::bigint
  from settlement_items s
  where s.empl_id = empl and s.req_date between p_from and p_to and s.status in ('승인완료', '승인요청')
  group by 1, 2, 3, 4, 5;
end $$;
revoke all on function product_sales(date, date, uuid) from public, anon;
grant execute on function product_sales(date, date, uuid) to authenticated;
