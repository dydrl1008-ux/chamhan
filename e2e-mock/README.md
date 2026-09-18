# 정산 연동 E2E (모의 서버)
정산 사이트 소스(biz_new-main)에서 확인한 API 동작을 흉내 내는 모의 서버로 워크허브 정산 코드를 통째로 검증.
```
node e2e-mock/server.mjs &            # 모의 정산 사이트 (18080)
cd e2e-mock && npm i -D tsx typescript && npx tsx --tsconfig tsconfig.json run.ts
```
28개 시나리오: 계정 연결·접수(킵 차감/초과 차단)·고객 등록/중복·승인 대기 감시·승인(입금·킵 적립·수수료 기록 대조)·재승인 차단·승인취소·요청취소·선입금(05)·상품인센·세션 만료.
실제 사이트 검증은 별도로 필요 (업체1 테스트 건).
