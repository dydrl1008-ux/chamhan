-- 근태 종류에 기타 추가 (예비군·민방위·경조사 등 — 사유 필수). 미팅(외근)과 같은 승인 흐름, 연차 차감·지각·결근 집계 없음
alter type leave_type add value if not exists 'etc';
