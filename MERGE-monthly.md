# 월간 계획서 — 기존 layout.tsx / page.tsx 에 손으로 합칠 부분 (파일 통째로 덮어쓰지 말 것)

## 1. app/(app)/layout.tsx — 메뉴
보고·이슈 NavGroup 을 찾아서:
```tsx
<NavGroup title="보고 · 이슈" hrefs={['/monthly', '/weekly', '/reports', '/issues', '/products']}>   // '/monthly' 추가
  {(mgr || lead) && <NavLink href="/monthly">월간 계획서</NavLink>}                                   // 이 줄 추가 (팀장 주간보고 위)
  {(mgr || lead) && <NavLink href="/weekly">팀장 주간보고</NavLink>}
```

## 2. app/(app)/page.tsx — 홈 칩 (선택)
맨 위 import 에:
```ts
import { loadPlan, teamSummary } from '@/lib/monthly';
```
팀장 홈 블록(`if (isMgr) {` 안, 데이터 받는 곳)에:
```ts
const mpl = p.team_id ? teamSummary(await loadPlan(p.team_id, bm)) : null;
const mpNeed = !mpl ? 0 : !mpl.hasPlan ? 1 : (mpl.lastWeek && !mpl.reviewed ? 1 : 0);
```
팀장 칩 줄에:
```tsx
<Chip n={mpNeed} label={!mpl?.hasPlan ? '월간 계획서 미작성' : `${mpl.lastWeek?.no ?? ''}주 리뷰 안 함`} href="/monthly" hot={!!mpl && mpl.overdue >= 3} />
```
대표·총괄 홈 블록(return 직전)에:
```ts
const mps = await Promise.all(teamsShown.filter(t => rows.some(x => x.team_id === t.id && x.role === 'manager')).map(async t => ({ t, s: teamSummary(await loadPlan(t.id, bm)) })));
const mpMissing = mps.filter(x => !x.s.hasPlan || (x.s.lastWeek && !x.s.reviewed));
```
칩 줄에:
```tsx
<Chip n={mpMissing.length} label="월간 계획서 미작성·리뷰 안 한 팀" href="/monthly" hot={mpMissing.some(x => x.s.overdue >= 3)} />
```
(변수명 mp 는 이미 쓰고 있어서 mpl / mps 로 함)
