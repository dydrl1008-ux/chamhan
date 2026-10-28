'use client';
// 슬롯 오픈 — ① 셀러 선택(없으면 새로 생성) ② 발급 조건 ③ 발급 → 아래에 내가 연 슬롯·이력
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { PageHeader, Section, Status, Empty, Field } from '@/components/ui';
import { fmtMD, fmtKST } from '@/lib/date/kst';
import { openSlots, newSeller, checkSeller, registerOne } from './actions';
import type { Seller, SlotType, OpenedSlot } from '@/lib/ykreward';

type Hist = { id: number; who: string; target_login: string; target_name: string; cnt: number; daily_goal: number; start_date: string; days: number; slot_type: string | null; reward_name: string; slot_codes: number[]; created_at: string };
type Props = { me: { id: string; name: string; role: string }; types: SlotType[]; slots: OpenedSlot[]; hist: Hist[]; err: string; minStart: string };

export default function SlotsOpenClient({ me, types, slots, hist, err, minStart }: Props) {
  const r = useRouter();
  const [q, setQ] = useState(''); const [sel, setSel] = useState<Seller | null>(null); const [chk, setChk] = useState(''); const [busy, setBusy] = useState(false); const [mkOpen, setMkOpen] = useState(false);
  const [f, setF] = useState({ count: '', daily_goal: '', start: minStart, days: '', slot_type: types[0]?.name ?? '', reward_name: '', url: '', keyword: '' });
  const [reg, setReg] = useState<{ code: number; url: string; keyword: string } | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const submit = async () => {
    if (!sel) return notify('셀러 아이디를 먼저 확인하세요', 'bad');
    if (!confirm(`${sel.name} (${sel.login_id}) 에 ${f.slot_type || '기본'} 슬롯 ${f.count}개 · 일유입 ${f.daily_goal} · ${f.start}부터 ${f.days}일 발급할까요?\n리워드: ${f.reward_name}${f.url ? `\n상품: ${f.url}\n키워드: ${f.keyword}` : ''}`)) return;
    setBusy(true); const fd = new FormData(); Object.entries({ ...f, login: sel.login_id, target_name: sel.name }).forEach(([k, v]) => fd.set(k, v));
    const x = await openSlots(fd); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad', x.ok ? 6000 : undefined);
    if (x.ok) { setF(s => ({ ...s, count: '', reward_name: '', url: '', keyword: '' })); r.refresh(); }
  };
  const check = async () => { const id = q.trim().toLowerCase(); if (!id) return; setBusy(true); const x = await checkSeller(id); setBusy(false); if (x.ok && x.seller) { setSel(x.seller); setChk(''); setMkOpen(false); } else { setSel(null); setChk(x.msg); } };
  const create = async (fd: FormData) => { setBusy(true); const x = await newSeller(fd); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setMkOpen(false); setQ(x.login!); const y = await checkSeller(x.login!); if (y.ok && y.seller) { setSel(y.seller); setChk(''); } r.refresh(); } };

  const doReg = async (fd: FormData) => { setBusy(true); const x = await registerOne(fd); setBusy(false); notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setReg(null); r.refresh(); } };
  const mine = slots.filter(s => s.opened_by === me.name); const active = (s: OpenedSlot) => !s.stopped_at && !s.dropped_at && (!s.end_date || s.end_date >= today);
  const stat = (s: OpenedSlot) => s.dropped_at ? <Status kind="off">회수</Status> : s.stopped_at ? <Status kind="off">중지 {fmtMD(s.stopped_at)}</Status> : s.end_date && s.end_date < today ? <Status kind="off">종료</Status> : s.start_date && s.start_date > today ? <Status kind="wait">대기</Status> : s.keyword ? <Status kind="ok">운영 중</Status> : <Status kind="bad">상품 미등록</Status>;
  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px' };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <PageHeader title="슬롯 오픈" desc="ykreward 에 셀러 계정을 만들고 슬롯을 발급합니다. 상품·키워드 등록은 셀러(또는 담당자)가 ykreward 에서." badge={<span className="cell-sub">내가 연 슬롯 {mine.length} · 운영 중 {mine.filter(active).length}</span>} />
      {err && <div className="card" style={{ background: 'var(--bad-soft)', color: 'var(--bad-ink)' }}>ykreward 연결 오류: {err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: 14, alignItems: 'start' }}>
        <Section title="① 셀러 아이디" sub="고객의 ykreward 셀러 아이디를 입력하고 확인. 없으면 새 계정을 만드세요.">
          <div style={{ display: 'flex', gap: 8 }}><input value={q} onChange={e => { setQ(e.target.value); setSel(null); setChk(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); check(); } }} placeholder="셀러 아이디" style={inp} autoCapitalize="none" /><button type="button" className="btn" disabled={busy || !q.trim()} onClick={check}>확인</button></div>
          {sel && <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--ok-soft)' }}><Status kind="ok">확인됨</Status> <b>{sel.name || sel.login_id}</b> <span className="cell-sub" style={{ display: 'inline' }}>{sel.login_id} · 소속 {sel.parent || '-'}{sel.manager ? ` · 담당 ${sel.manager}` : ''} · 운영 슬롯 {sel.slots}</span></div>}
          {chk && <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bad-soft)', color: 'var(--bad-ink)', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><span>{chk}</span>{!mkOpen && <button type="button" className="btn ghost" onClick={() => setMkOpen(true)}>+ 새 계정 만들기</button>}</div>}
          {mkOpen && <form action={create} style={{ display: 'grid', gap: 8, padding: 12, border: '1px dashed var(--wait)', borderRadius: 10, marginTop: 10, background: 'var(--wait-soft)' }}>
            <div className="cell-sub">ykreward 셀러 계정을 바로 만듭니다 (담당자 = {me.name}). 아이디·비밀번호는 고객에게 전달하세요.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="아이디"><input name="login" style={inp} defaultValue={q.trim().toLowerCase()} placeholder="영문·숫자 3~30" required /></Field>
              <Field label="비밀번호"><input name="password" style={inp} placeholder="6자 이상" minLength={6} required /></Field>
              <Field label="업체명"><input name="name" style={inp} placeholder="OO스토어" required /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn" disabled={busy}>계정 생성</button><button type="button" className="btn ghost" onClick={() => setMkOpen(false)}>취소</button></div>
          </form>}
        </Section>
        <Section title="② 발급 조건" sub={sel ? <>대상: <b>{sel.name}</b> ({sel.login_id})</> : '왼쪽에서 셀러 아이디를 확인하세요'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="리워드 이름" hint="양쪽 원장에 표시" style={{ gridColumn: '1 / -1' }}><input style={inp} value={f.reward_name} onChange={e => setF({ ...f, reward_name: e.target.value })} placeholder="예: OO스토어 11월 리워드 · 겨울패딩 키워드" /></Field>
            <Field label="슬롯 유형"><select style={inp} value={f.slot_type} onChange={e => setF({ ...f, slot_type: e.target.value })}>{types.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}{types.length === 0 && <option value="">기본</option>}</select></Field>
            <Field label="슬롯 수"><input style={inp} type="number" min={1} max={500} value={f.count} onChange={e => setF({ ...f, count: e.target.value })} placeholder="1~500" /></Field>
            <Field label="일유입 (슬롯당)"><input style={inp} type="number" min={1} value={f.daily_goal} onChange={e => setF({ ...f, daily_goal: e.target.value })} placeholder="예: 100" /></Field>
            <Field label="시작일" hint="내일 이후"><input style={inp} type="date" min={minStart} value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="운영일수"><input style={inp} type="number" min={1} value={f.days} onChange={e => setF({ ...f, days: e.target.value })} placeholder="예: 30" /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 10, padding: 10, border: '1px dashed var(--line)', borderRadius: 10 }}>
            <Field label="상품 URL (선택)" hint="스마트스토어·브랜드스토어 상품 페이지 — 넣으면 발급과 동시에 등록"><input style={inp} value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://smartstore.naver.com/스토어/products/숫자" /></Field>
            <Field label="키워드"><input style={inp} value={f.keyword} onChange={e => setF({ ...f, keyword: e.target.value })} placeholder="예: 미아방지목걸이" /></Field>
            <div className="cell-sub" style={{ gridColumn: '1 / -1' }}>발급되는 슬롯 전부에 같은 상품·키워드가 들어감. 슬롯마다 다르면 비워두고 아래 표에서 하나씩 등록. 가격비교(카탈로그) 상품은 ykreward 에서.</div>
          </div>
          <div style={{ marginTop: 10 }}><button type="button" className="btn" disabled={busy || !sel} onClick={submit} style={{ width: '100%' }}>{busy ? '처리 중…' : '③ 발급'}</button></div>
          {f.count && f.daily_goal && <div className="cell-sub" style={{ marginTop: 8 }}>총 일유입 {(Number(f.count) * Number(f.daily_goal)).toLocaleString()} · {f.start} ~ {f.days ? addD(f.start, Number(f.days) - 1) : '?'}</div>}
        </Section>
      </div>

      <Section title={me.role === 'staff' ? '내가 연 슬롯' : '연 슬롯 (ykreward 현황)'} sub={`${slots.length}개 · 운영 중 ${slots.filter(active).length}`} flush>
        <table><thead><tr><th>#</th><th>리워드</th><th>셀러</th><th>유형</th><th>기간</th><th className="num">일유입</th><th>키워드</th><th>상태</th><th>오픈</th></tr></thead>
          <tbody>{slots.slice(0, 300).map(s => <tr key={s.id}><td className="num">{s.code}</td><td><b>{s.reward_name ?? '-'}</b></td><td>{s.owner}</td><td>{s.slot_type ?? '-'}</td><td className="num">{s.start_date ? `${fmtMD(s.start_date)}~${s.end_date ? fmtMD(s.end_date) : ''}` : '-'}</td><td className="num">{s.daily_goal ?? '-'}</td><td className="cell-sub">{s.keyword ?? '-'}</td><td>{stat(s)}{!s.keyword && !s.stopped_at && !s.dropped_at && <button type="button" className="btn ghost" style={{ marginLeft: 6, padding: '1px 8px', fontSize: 12 }} onClick={() => setReg(reg?.code === s.code ? null : { code: s.code, url: '', keyword: '' })}>등록</button>}</td><td>{s.opened_by}</td></tr>).flatMap(row => reg && row.key === String(reg.code) ? [row, <tr key={`reg-${reg.code}`}><td colSpan={9} style={{ background: 'var(--wait-soft)' }}><form action={doReg} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto auto', gap: 8, alignItems: 'center' }}><input type="hidden" name="code" value={reg.code} /><input name="url" style={inp} placeholder="상품 URL (…/products/숫자)" required /><input name="keyword" style={inp} placeholder="키워드" required /><button className="btn" disabled={busy}>#{reg.code} 등록</button><button type="button" className="btn ghost" onClick={() => setReg(null)}>취소</button></form></td></tr>] : [row])}
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
