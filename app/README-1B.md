# 워크허브 1-B — 출퇴근 · 근태 · 금일 이슈

## 적용
1. SQL Editor: `supabase/migrations/0003_1b_attendance_leave_issues.sql` 실행
2. Database › Extensions › **pg_cron** 활성화 → 0003 을 **한 번 더** 실행 (cron 스케줄 블록만 등록됨, 나머지는 if not exists 로 무해)
3. `supabase/checks/1b_check.sql` 실행 → [1][2] 0행, [3] 정책 attendance 3 / leave_requests 3 / issues 2 / issue_reads 2, [4] cron 1행
4. GitHub 에 코드 업로드 → Vercel 자동 배포

## 동작 규칙
- 출근: 하루 1회, 한 번 기록되면 시각 수정 불가(어드민에게 요청). IP·브라우저 정보 함께 저장
- 지각: `app_settings.late_after`(10:00) 초과 시 즉시 표시. 매일 00:10 KST cron 이 전일 지각을 근태 '대기'로 생성 → 팀장 확정/반려
- 연차·반차 신청: 잔여 초과 시 DB 에서 차단. 직원은 pending 만, 취소만 가능
- 무단결근·지각: 팀장/총괄/어드민만 등록, 즉시 승인
- 금일 이슈: 총책임자·어드민 등록, 전원 열람 + 읽음 처리, 총책임자·어드민은 읽음 인원 확인

## 1-B 종료 체크리스트
- [ ] 1b_check.sql 전부 기대값
- [ ] 직원1: 출근 기록(10:00 넘겨서) → 지각 뱃지 / 같은 날 다시 출근 눌러도 시각 안 바뀜 / 퇴근 기록
- [ ] 직원1: 연차 신청 → 대기 / 부여량 초과 신청 → "잔여 연차 부족" 에러
- [ ] 직원2 로그인: 근태·출퇴근에 직원1 데이터 안 보임
- [ ] 팀장: 직원1 근태 보임, 승인 → 직원1 화면에서 승인 확인 / 다른 팀 직원2는 목록에 없음
- [ ] 총괄: 전원 보임, 이슈 등록 → 직원 메인에 '미확인' 뱃지 → 읽음 처리 → 총괄 화면 읽음 수 증가
- [ ] 직원 계정으로 `/admin/users` 직접 입력 → 메인으로 튕김
- [ ] SQL: `select generate_late_requests(current_date);` (어드민 SQL Editor = uid null 통과) → 오늘 지각자 수만큼 대기 건 생성, 재실행 시 0
