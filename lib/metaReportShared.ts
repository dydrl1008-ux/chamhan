// 메타 보고 — 화면과 서버가 함께 쓰는 항목 · 타입 (DB 접근 없음)
export const DAILY_FIELDS = [
  { key: 'win', label: '오늘 결제 고객 — 어떤 점이 통했는지', hint: '결제가 있는 날만' },
  { key: 'lost', label: '놓친 고객 — 왜 안 됐는지', hint: '가격 / 시기 / 비교 중 / 효과 의심 중 어느 쪽인지' },
  { key: 'quality', label: '허수 · 품질 낮은 DB 특이사항', hint: '광고 소재 개선에 씁니다' },
  { key: 'ask', label: '팀장에게 요청 · 확인할 것', hint: '' },
] as const;
export const WEEKLY_FIELDS = [
  { key: 'good', label: '이번 주 잘된 점', hint: '' },
  { key: 'bad', label: '이번 주 안 된 점', hint: '' },
  { key: 'quality', label: '광고 소재 · DB 품질 의견', hint: '' },
  { key: 'next', label: '다음 주 계획 · 요청', hint: '' },
] as const;
export type DailyAuto = { assigned: number; handled: number; by: Record<string, number>; paid: number; paidAmt: number; costAmt: number; margin: number; noCost: number; waiting: number; tomorrow: number };
export type WeekLine = { id: string; name: string; n: number; valid: number; reached: number; paid: number; amt: number; cost: number; stale: number };
export type WeeklyAuto = { lines: WeekLine[]; src: { name: string; valid: number; paid: number }[]; total: number; junk: number };
