# 슬롯 오픈 (ykreward 연동) 적용 순서

1. **ykreward Supabase** SQL 에디터에서 `ykreward_workhub.sql` 실행 → 마지막 확인 쿼리에 reward_name, opened_by 두 줄 나오면 OK
2. **워크허브 Supabase**: `supabase/migrations/0048_reward_slot_opens.sql` 실행
3. **Vercel 환경변수** 2개 추가 후 재배포
   - `YKREWARD_URL` = https://lpdoqpccbtrqvzwbelji.supabase.co
   - `YKREWARD_SERVICE_KEY` = ykreward 프로젝트의 service_role 키 (Settings › API)
4. 코드: `lib/ykreward.ts`, `app/(app)/slots-open/{page,actions,SlotsOpenClient}.tsx`
5. `app/(app)/layout.tsx` 메뉴 추가 — 정산 그룹 hrefs 에 `'/slots-open'` 넣고 그룹 안에:
   ```tsx
   <NavLink href="/slots-open">슬롯 오픈</NavLink>
   ```
   (직원·팀장·총괄·대표·관리팀 전부 보이게 — 조건 없이 넣으면 됨)

## 동작
- 셀러 검색(아이디·업체명·소속) → 없으면 「+ 새 셀러 계정」: ykreward auth(`<아이디>@ykad.local`) + accounts(seller, 소속 = app_settings `ykreward_parent_login`, 기본 lchkgy, 담당자 = 직원 이름)
- 발급: 리워드 이름(필수) · 유형 · 슬롯 수 · 일유입 · 시작일(내일 이후) · 운영일수 → ykreward `workhub_issue_slots` (기존 issue_slots 와 같은 검증·한도·로그, 발급자 = 유노애드 어드민, slots.reward_name / opened_by 기록)
- 아래 표: ykreward 에서 opened_by 로 읽어온 실제 슬롯 현황(상품 미등록 / 대기 / 운영 중 / 종료 / 중지 / 회수) + 워크허브 발급 이력
- 범위: 직원 본인 · 팀장 팀 · 총괄·대표·관리팀 전체 (이력은 RLS, 슬롯 현황은 같은 범위의 직원 이름으로 필터)
- 상품·키워드 등록, 중지·연장은 지금처럼 ykreward 에서
