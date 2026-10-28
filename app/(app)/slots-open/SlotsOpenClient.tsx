'use client';
// 슬롯 오픈 — ① 셀러 선택(없으면 새로 생성) ② 발급 조건 ③ 발급 → 아래에 내가 연 슬롯·이력
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { PageHeader, Section, Status, Empty, Field } from '@/components/ui';
import { fmtMD, fmtKST } from '@/lib/date/kst';
import { openSlots, newSeller } from './actions';
import type { Seller, SlotType, OpenedSlot } from '@/lib/ykreward';

type Hist = { id: number; who: string; target_login: string; target_name: string; cnt: number; daily_goal: number; start_date: string; days: number; slot_type: string | null; reward_name: string; slot_codes: number[]; created_at: string };
type Props = { me: { id: string; name: string; role: string }; sellers: Seller[]; types: SlotType[]; slots: OpenedSlot[]; hist: Hist[]; err: string; minStart: string };

export default function SlotsOpenClient({ me, sellers, types, slots, hist, err, minStart }: Props) {
  const r = useRouter();
  const [q, setQ] = useState(''); const [login, setLogin] = useState(''); const [busy, setBusy] = useState(false); const [mkOpen, setMkOpen] = useState(false);
  const [f, setF] = useState({ count: '', daily_goal: '', start: minStart, days: '', slot_type: types[0]?.name ?? '', reward_name: '' });
  const found = useMemo(() => { const k = q.trim().toLowerCase(); if (!k) return sellers.slice(0, 30); return sellers.filter(s => s.login_id.includes(k) || s.name.toLowerCase().includes(k) || s.parent.toLowerCase().includes(k)).slice(0, 30); }, [q, sellers]);
  const sel = sellers.find(s => s.login_id === login);
  const today = new Date().toISOString().slice(0, 10);

  const submit = async () => {
    if (!sel) return notify('셀러를 선택하세요', 'bad');
    if (!confirm(`${sel.name} (${sel.login_id}) 에 ${f.slot_type || '기본'} 슬롯 ${f.count}개 · 일유입 ${f.daily_goal} · ${f.start}부터 ${f.days}일 발급할까요?\n리워드: ${f.reward_name}`)) return;
    setBusy(true); const fd = new FormData(); Object.entries({ ...f, login: sel.login_id, target_name: sel.name }).forEach(([k, v]) => fd.set(k, v));
    const x = await openSlots(fd); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad', x.ok ? 6000 : undefined);
    if (x.ok) { setF(s => ({ ...s, count: '', reward_name: '' })); r.refresh(); }
  };
  const create = async (fd: FormData) => { setBusy(true); const x = await newSeller(fd); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setMkOpen(false); setLogin(x.login!); setQ(x.login!); r.refresh(); } };

  const mine = slots.filter(s => s.opened_by === me.name); const active = (s: OpenedSlot) => !s.stopped_at && !s.dropped_at && (!s.end_date || s.end_date >= today);
  const stat = (s: OpenedSlot) => s.dropped_at ? <Status kind="off">회수</Status> : s.stopped_at ? <Status kind="off">중지 {fmtMD(s.stopped_at)}</Status> : s.end_date && s.end_date < today ? <Status kind="off">종료</Status> : s.start_date && s.start_date > today ? <Status kind="wait">대기</Status> : s.keyword ? <Status kind="ok">운영 중</Status> : <Status kind="bad">상품 미등록</Status>;
  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px' };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <PageHeader title="슬롯 오픈" desc="ykreward 에 셀러 계정을 만들고 슬롯을 발급합니다. 상품·키워드 등록은 셀러(또는 담당자)가 ykreward 에서." badge={<span className="cell-sub">내가 연 슬롯 {mine.length} · 운영 중 {mine.filter(active).length}</span>} />
      {err && <div className="card" style={{ background: 'var(--bad-soft)', color: 'var(--bad-ink)' }}>ykreward 연결 오류: {err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: 14, alignItems: 'start' }}>
        <Section title="① 셀러" right={<button type="button" className="btn ghost" onClick={() => setMkOpen(v => !v)}>{mkOpen ? '닫기' : '+ 새 셀러 계정'}</button>}>
          {mkOpen && <form action={create} style={{ display: 'grid', gap: 8, padding: 12, border: '1px dashed var(--wait)', borderRadius: 10, marginBottom: 12, background: 'var(--wait-soft)' }}>
            <div className="cell-sub">신규 고객이면 여기서 ykreward 계정을 바로 만듭니다 (담당자 = {me.name}). 아이디·비밀번호는 고객에게 전달하세요.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="아이디"><input name="login" style={inp} placeholder="영문·숫자 3~30" required /></Field>
              <Field label="비밀번호"><input name="password" style={inp} placeholder="4자 이상" required /></Field>
              <Field label="업체명"><input name="name" style={inp} placeholder="OO스토어" required /></Field>
            </div>
            <div><button className="btn" disabled={busy}>계정 생성</button></div>
          </form>}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="아이디 · 업체명 · 소속 대행사 검색" style={{ ...inp, marginBottom: 8 }} />
          <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
            {found.map(s => <button key={s.login_id} type="button" onClick={() => setLogin(s.login_id)} style={{ display: 'grid', gridTemplateColumns: '1fr auto', width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, borderBottom: '1px solid var(--line-soft)', background: login === s.login_id ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', opacity: s.active ? 1 : 0.5 }}>
              <span><b>{s.name || s.login_id}</b> <span className="cell-sub" style={{ display: 'inline' }}>{s.login_id} · {s.parent}{s.manager ? ` · 담당 ${s.manager}` : ''}{!s.active ? ' · 중지' : ''}</span></span><span className="num cell-sub">슬롯 {s.slots}</span></button>)}
            {found.length === 0 && <div style={{ padding: 14 }}><Empty>검색 결과 없음 — 새 셀러 계정을 만드세요</Empty></div>}
          </div>
        </Section>
        <Section title="② 발급 조건" sub={sel ? <>대상: <b>{sel.name}</b> ({sel.login_id}) · 소속 {sel.parent}</> : '왼쪽에서 셀러를 선택하세요'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="리워드 이름" hint="양쪽 원장에 표시" style={{ gridColumn: '1 / -1' }}><input style={inp} value={f.reward_name} onChange={e => setF({ ...f, reward_name: e.target.value })} placeholder="예: OO스토어 11월 리워드 · 겨울패딩 키워드" /></Field>
            <Field label="슬롯 유형"><select style={inp} value={f.slot_type} onChange={e => setF({ ...f, slot_type: e.target.value })}>{types.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}{types.length === 0 && <option value="">기본</option>}</select></Field>
            <Field label="슬롯 수"><input style={inp} type="number" min={1} max={500} value={f.count} onChange={e => setF({ ...f, count: e.target.value })} placeholder="1~500" /></Field>
            <Field label="일유입 (슬롯당)"><input style={inp} type="number" min={1} value={f.daily_goal} onChange={e => setF({ ...f, daily_goal: e.target.value })} placeholder="예: 100" /></Field>
            <Field label="시작일" hint="내일 이후"><input style={inp} type="date" min={minStart} value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="운영일수"><input style={inp} type="number" min={1} value={f.days} onChange={e => setF({ ...f, days: e.target.value })} placeholder="예: 30" /></Field>
            <div style={{ alignSelf: 'end' }}><button type="button" className="btn" disabled={busy || !sel} onClick={submit} style={{ width: '100%' }}>{busy ? '처리 중…' : '③ 발급'}</button></div>
          </div>
          {f.count && f.daily_goal && <div className="cell-sub" style={{ marginTop: 8 }}>총 일유입 {(Number(f.count) * Number(f.daily_goal)).toLocaleString()} · {f.start} ~ {f.days ? addD(f.start, Number(f.days) - 1) : '?'}</div>}
        </Section>
      </div>

      <Section title={me.role === 'staff' ? '내가 연 슬롯' : '연 슬롯 (ykreward 현황)'} sub={`${slots.length}개 · 운영 중 ${slots.filter(active).length}`} flush>
        <table><thead><tr><th>#</th><th>리워드</th><th>셀러</th><th>유형</th><th>기간</th><th className="num">일유입</th><th>키워드</th><th>상태</th><th>오픈</th></tr></thead>
          <tbody>{slots.slice(0, 300).map(s => <tr key={s.id}><td className="num">{s.code}</td><td><b>{s.reward_name ?? '-'}</b></td><td>{s.owner}</td><td>{s.slot_type ?? '-'}</td><td className="num">{s.start_date ? `${fmtMD(s.start_date)}~${s.end_date ? fmtMD(s.end_date) : ''}` : '-'}</td><td className="num">{s.daily_goal ?? '-'}</td><td className="cell-sub">{s.keyword ?? '-'}</td><td>{stat(s)}</td><td>{s.opened_by}</td></tr>)}
            {slots.length === 0 && <tr><td colSpan={9}><Empty>아직 연 슬롯이 없습니다</Empty></td></tr>}</tbody></table>
      </Section>
      <Section title="발급 이력" flush>
        <table><thead><tr><th>일시</th><th>담당</th><th>리워드</th><th>셀러</th><th className="num">슬롯</th><th className="num">일유입</th><th>기간</th><th>슬롯 번호</th></tr></thead>
          <tbody>{hist.map(h => <tr key={h.id}><td className="num">{fmtKST(h.created_at)}</td><td>{h.who}</td><td><b>{h.reward_name}</b>{h.slot_type ? <span className="cell-sub" style={{ display: 'inline' }}> · {h.slot_type}</span> : null}</td><td>{h.target_name} <span className="cell-sub" style={{ display: 'inline' }}>{h.target_login}</span></td><td className="num">{h.cnt}</td><td className="num">{h.daily_goal}</td><td className="num">{fmtMD(h.start_date)} · {h.days}일</td><td className="num cell-sub">{h.slot_codes.length ? `#${h.slot_codes[0]}~#${h.slot_codes.at(-1)}` : '-'}</td></tr>)}
            {hist.length === 0 && <tr><td colSpan={8}><Empty>이력 없음</Empty></td></tr>}</tbody></table>
      </Section>
    </div>
  );
}
function addD(d: string, n: number) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '?'; const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
