-- 근태 종류에 미팅(외근) 추가 — 연차·반차와 같은 승인 흐름(팀장 → 총괄), 연차 차감 없음
alter type leave_type add value if not exists 'meeting';
