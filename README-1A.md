# 워크허브 1-A — 인증 · IP · 사용자 관리

## 1. Supabase (staging) 준비
1. 새 프로젝트 생성 → Settings › API 에서 `URL`, `anon key`, `service_role key` 복사
2. SQL Editor 에서 순서대로 실행
   - `supabase/migrations/0001_1a_auth_ip.sql`
   - `supabase/migrations/0002_1a_seed.sql`  (팀 4개, 본사 IP 211.205.68.33, 설정값)
3. `supabase/checks/1a_check.sql` 실행 → [1] [2] 결과 **0행**, [4] `true / false` 확인
4. Authentication › Providers › Email: **Confirm email OFF** (관리자 초대 방식이므로 메일 확인 불필요)
5. Authentication › URL Configuration: Site URL = 배포 주소

## 2. 첫 어드민 만들기 (한 번만)
Authentication › Users › **Add user** (email + password, Auto Confirm 체크) → 생성된 UUID 복사 후 SQL:
```sql
insert into profiles(id,name,email,role,position)
values ('<UUID>','김건영','<이메일>','admin','대표');
```

## 3. 앱 실행
```bash
cp .env.example .env.local   # 값 채우기
npm install
npm run dev                  # 로컬은 IP가 127.0.0.1 → 차단됨. 테스트용으로 allowed_ips 에 127.0.0.1/32 추가 후 끝나면 비활성
```
Vercel 배포 시 환경변수 3개 동일하게 등록. `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용(NEXT_PUBLIC 붙이지 않음).

## 4. 1-A 종료 체크리스트 (전부 통과해야 1-B 진행)
- [ ] `1a_rls_test.sql` 시나리오 전부 기대값과 일치 (로컬 Postgres 16에서 사전 통과 확인됨)
- [ ] `1a_check.sql` [1] RLS 꺼진 테이블 0행 / [2] security_invoker 없는 뷰 0행
- [ ] 미등록 IP에서 접속 → 403 화면에 내 IP 표시됨
- [ ] 어드민 → 사용자 초대 4명(head / manager 1팀 / staff 1팀 / staff 2팀), 임시 비밀번호 발급
- [ ] 각 계정 로그인 → 메인의 "보이는 인원": admin=전체, head=전체, manager=1팀 인원수, staff=1
- [ ] staff 계정으로 `/admin/users` 주소 직접 입력 → `/` 로 튕김, 네트워크 탭에 profiles 데이터 전체가 내려오지 않음
- [ ] admin 이 사용자 비활성 → 그 계정 로그인 시 다시 /login 으로
- [ ] allowed_ips 에서 IP 비활성 → 60초 내 차단 확인 후 다시 활성
- [ ] audit_logs 에 profiles / allowed_ips 변경이 before/after 로 남는지 확인

## 다음 (1-B)
출퇴근 · 근태 · 금일 이슈 — attendance / leave_requests / issues 테이블, 지각 자동판정 트리거, 팀장 승인.
