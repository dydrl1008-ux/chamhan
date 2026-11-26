// 메타팀 교육 — 화면(클라이언트)과 서버가 함께 쓰는 상수 · 단계 계산 (DB 접근 없음)
export const EDU_DOCS = [
  { slug: 'search', title: '네이버 통합검색의 이해' },
  { slug: 'shopping', title: '쇼핑 상위노출 (네이버 · 쿠팡)' },
  { slug: 'place', title: '플레이스 상위노출' },
  { slug: 'blog', title: '블로그 · 카페 상위노출' },
  { slug: 'consult', title: '인바운드 상담' },
] as const;
export const PASS_SCORE = 80;
export const SCRIPT_PARTS = [
  { key: 'open_shop', label: '쇼핑 문의 고객 — 첫 인사와 물어볼 것', hint: '인사 · 통화 가능 여부 → 플랫폼 · 상품 링크 · 키워드 · 결정권자 순으로, 내 말투로' },
  { key: 'open_place', label: '플레이스 문의 고객 — 첫 인사와 물어볼 것', hint: '업종 · 지역 · 플레이스 링크 · 원하는 키워드 · 시작 시점' },
  { key: 'objection', label: '반론 응대 — 「비싸요」 「생각해 볼게요」 「정말 올라가나요?」', hint: '공감 → 이유 묻기 → 사실만. 순위 · 성공률 · 안전을 보장하는 말은 쓰지 않습니다' },
  { key: 'message', label: '부재 메시지와 통화 후 정리 메시지', hint: '3~5줄, 다음에 할 일(자료 · 연락 시간)을 넣습니다' },
] as const;
export type EduRow = { user_id: string; step1_at: string | null; docs: Record<string, string>; retake_ok: boolean; script: Record<string, string> | null; script_at: string | null; script_back: string; deployed_at: string | null };
export type EduExam = { id: number; user_id: string; started_at: string; submitted_at: string | null; score: number | null; passed: boolean | null; wrong: { id: string; pick: number }[] | null };
export type EduStage = 'step1' | 'docs' | 'exam' | 'locked' | 'script' | 'review' | 'done';
export const STAGE_LABEL: Record<EduStage, string> = { step1: '1차 교육 대기', docs: '2차 자료 학습 중', exam: '3차 시험 응시 가능', locked: '불합격 — 재시험 허락 대기', script: '스크립트 작성 중', review: '스크립트 제출 — 팀장 승인 대기', done: '영업 투입' };
export const emptyEdu = (user_id: string): EduRow => ({ user_id, step1_at: null, docs: {}, retake_ok: false, script: null, script_at: null, script_back: '', deployed_at: null });
export function stageOf(r: EduRow, exams: EduExam[]): EduStage {
  if (r.deployed_at) return 'done'; if (!r.step1_at) return 'step1'; if (!EDU_DOCS.every(d => r.docs?.[d.slug])) return 'docs';
  const done = exams.filter(e => e.submitted_at); if (done.some(e => e.passed)) return r.script_at ? 'review' : 'script';
  return done.length && !r.retake_ok && !exams.some(e => !e.submitted_at) ? 'locked' : 'exam';
}
