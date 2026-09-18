# 워크허브 1-F — 정산 사이트(lchkgy.com) 연동

## 적용
1. SQL `0012_1f_settlement_sync.sql`
2. Vercel 환경변수: `SETTLE_CO_CODE`(회사코드) · `SETTLE_USER_ID` · `SETTLE_USER_PW`(정산 어드민 계정) · `CRON_SECRET`(임의 문자열 32자, Vercel cron 인증) · `SETTLE_BASE_URL`(기본 http://lchkgy.com) → Redeploy
3. 어드민 › 정산 연동:
   - **연결 테스트** → 로그인·최근 30일 조회 성공 시 JSON 키 목록과 샘플이 표시됨
   - 정산번호 / 담당자ID / 요청일 / 영업이익 / 진행상태 키를 골라 **매핑 저장** (자동 추정값이 먼저 채워짐, 샘플 값 보고 확인)
   - **지금 동기화** (기간 선택) → 실행 이력에 "정산 N건 → KPI M건 반영"
   - **담당자 매핑**: 정산 담당자ID가 워크허브 이메일 앞부분과 같으면 자동, 다르면 지정
4. 이후 매일 06:00 KST 자동(최근 7일). 실패하면 실행 이력에 빨간 메시지

## 동작
- KPI `금일 마진` = `정산 자동`(승인완료 건의 영업이익 합 ÷ VAT 나누기) + `추가 마진`(직원 입력, 정산 외). 자동값은 직원이 수정 불가
- 정산 건은 정산번호로 저장해 중복 없음. 동기화 기간에 정산이 사라진 날은 자동값 0으로 재계산
- 정산 계정 정보는 서버 환경변수에만, 사이트는 http 이므로 제작사에 https 요청 권장

## 자동 동기화 (GitHub Actions) — Vercel 시간 제한 없이
1. GitHub 저장소 › Settings › Secrets and variables › Actions › **New repository secret** 로 6개 등록:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SETTLE_BASE_URL`(http://lchkgy.com), `SETTLE_CO_CODE`, `SETTLE_USER_ID`, `SETTLE_USER_PW`
2. 매일 06:00 KST 자동 실행(최근 7일). 결과는 워크허브 정산 연동 › 실행 이력에 `github-schedule` 로 표시
3. 수동: Actions 탭 › settle-sync › **Run workflow** › from/to 입력 (예: 2026-07-21 / 2026-08-20)
4. 실패 시 Actions 로그와 실행 이력 메시지에 원인 표시. 정산 사이트는 조회만 함

## 정산 승인요청 실시간 감시 (관리팀 알림)
1. Supabase › Database › Extensions: **pg_cron**, **pg_net** 활성화
2. SQL `0020_settlement_pending.sql` 실행 → `checks/pending_setup.sql` 의 URL·CRON_SECRET 채워 실행
3. 2분마다 워크허브 `/api/cron/pending` 호출 → 정산 사이트 최근 3일 조회(읽기만) → 새 승인요청은 `정산 승인 대기` 메뉴(관리팀·총괄·어드민)에 표시, 사이드바 빨간 배지. 사이트에서 승인/반려되면 다음 확인 때 자동 해소
4. 외부 알림: Vercel 환경변수 `NOTIFY_WEBHOOK_URL` 에 웹훅 주소를 넣으면 새 건 발생 시 JSON POST (`text`, `count`, `items`). 솔라피 알림톡·카톡발송기·Slack 등 연결 가능
