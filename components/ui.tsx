// 워크허브 공용 UI 뼈대 — 서버/클라이언트 양쪽에서 사용 가능 (상태 없음)
// 사용 예는 README-UI.md 참고. 스타일은 app/globals.css 의 클래스에 의존.
import React from 'react';

/** 화면 맨 위: 제목 + 한 줄 설명 + 오른쪽 버튼. 긴 설명은 help 로 접어서 */
export function PageHeader({ title, desc, help, badge, actions }: { title: React.ReactNode; desc?: React.ReactNode; help?: React.ReactNode; badge?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{title}{badge}</h1>
        {desc && <p>{desc}{help && <> · <details className="help-box" style={{ display: 'inline' }}><summary style={{ display: 'inline' }}>도움말</summary><div className="body" style={{ marginTop: 8 }}>{help}</div></details></>}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

/** 숫자 카드: 라벨 / 큰 숫자 / 보조 한 줄 (+ 진행률, 대기값) */
export function Stat({ label, value, desc, pct, pending, tone, href }: { label: React.ReactNode; value: React.ReactNode; desc?: React.ReactNode; pct?: number; pending?: React.ReactNode; tone?: 'ok' | 'wait' | 'bad'; href?: string }) {
  const color = tone === 'ok' ? 'var(--ok-ink)' : tone === 'wait' ? 'var(--wait-ink)' : tone === 'bad' ? 'var(--bad-ink)' : undefined;
  const body = (
    <div className="card stat" style={{ padding: '18px 20px' }}>
      <div className="l">{label}</div>
      <div className="v" style={{ color }}>{value}{pending ? <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--wait-ink)', marginLeft: 8 }} title="승인요청 상태 (승인 전) — 합계·목표 미포함">+대기 {pending}</span> : null}</div>
      {pct != null && <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: pct >= 100 ? 'var(--ok)' : pct >= 70 ? 'var(--wait)' : undefined }} /></div>}
      {desc && <div className="d">{desc}</div>}
    </div>
  );
  return href ? <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</a> : body;
}

/** 카드 + 섹션 제목 + 오른쪽 링크/버튼. flush=true 면 표를 카드 끝까지 붙임 */
export function Section({ title, sub, right, flush, children, style }: { title?: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; flush?: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section className={'card' + (flush ? ' flush' : '')} style={style}>
      {(title || right) && <div className="card-head"><h2>{title}{sub && <span className="muted" style={{ fontWeight: 500, marginLeft: 8 }}>{sub}</span>}</h2>{right}</div>}
      {children}
    </section>
  );
}

/** 표 셀 2줄: 주 정보(굵게) + 보조(13px 회색). 열 수를 줄이는 기본 수단 */
export function Cell({ main, sub, mono }: { main: React.ReactNode; sub?: React.ReactNode; mono?: boolean }) {
  return <div><div className="cell-main">{main}</div>{sub != null && sub !== '' && <div className={'cell-sub' + (mono ? ' mono' : '')}>{sub}</div>}</div>;
}

/** 금액: 오른쪽 정렬 · tabular · 음수 빨강 · 0 은 점 */
export function Money({ v, sub, big, signed, dash }: { v: number | null | undefined; sub?: React.ReactNode; big?: boolean; signed?: boolean; dash?: boolean }) {
  const n = Math.round(Number(v ?? 0));
  if (dash && !n) return <span style={{ color: 'var(--line)' }}>·</span>;
  const txt = (signed && n > 0 ? '+' : '') + (n < 0 ? '−' : '') + '₩' + Math.abs(n).toLocaleString('ko-KR');
  return <div style={{ textAlign: 'right' }}><div className={'num ' + (n < 0 ? 'neg' : signed && n > 0 ? 'pos' : '')} style={{ fontWeight: 700, fontSize: big ? 16 : undefined }}>{txt}</div>{sub && <div className="cell-sub">{sub}</div>}</div>;
}

/** 상태: 색점 + 글자. 종류 4개만 */
export function Status({ kind, children }: { kind: 'ok' | 'wait' | 'bad' | 'off'; children: React.ReactNode }) {
  return <span className={'status ' + kind}>{children}</span>;
}
/** 정산 상태명 → Status 매핑 */
export function SettleStatus({ name }: { name: string | null | undefined }) {
  const s = String(name ?? '');
  if (/승인완료/.test(s)) return <Status kind="ok">승인 완료</Status>;
  if (/승인요청/.test(s)) return <Status kind="wait">승인 대기</Status>;
  if (/취소|반려/.test(s)) return <Status kind="bad">반려</Status>;
  return <Status kind="off">{s || '-'}</Status>;
}

/** 작은 꼬리표: 환불 / 선입금 등 */
export function Tag({ warn, children }: { warn?: boolean; children: React.ReactNode }) {
  return <span className={'tag' + (warn ? ' warn' : '')}>{children}</span>;
}

/** 라벨 위 + 입력 아래 묶음 */
export function Field({ label, htmlFor, hint, children, style }: { label: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}><label htmlFor={htmlFor}>{label}</label>{children}{hint && <div className="cell-sub">{hint}</div>}</div>;
}

/** 표 그룹 행 (요청일별 묶음 등) */
export function GroupRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return <tr className="group"><td colSpan={colSpan}>{children}</td></tr>;
}

/** 빈 상태 */
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
