'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { upsertRow, deactivateRow } from '@/lib/adminCrud';
import { saveAccount, revealPassword, deactivateAccount } from './actions';
import { fmtKST } from '@/lib/date/kst';
type B = { id: number; name: string; reg_no: string | null; ceo: string | null; purpose: string | null; note: string | null };
type Ph = { id: number; phone_no: string; device: string | null; owner_id: string | null; business_id: number | null; carrier: string | null; opened_at: string | null; note: string | null };
type A = { id: number; service: string; login_id: string; business_id: number | null; owner_id: string | null; payment_method: string | null; renew_note: string | null; url: string | null; note: string | null; updated_at: string; has_pw: boolean };
export default function AssetsAdmin({ biz, phones, accounts, people, logs, secretReady }: { biz: B[]; phones: Ph[]; accounts: A[]; people: { id: string; name: string }[]; logs: { user_id: string | null; account_id: number | null; action: string; at: string }[]; secretReady: boolean }) {
  const r = useRouter(); const [tab, setTab] = useState<'accounts' | 'phones' | 'biz'>('accounts'); const [edit, setEdit] = useState<any>(null); const [shown, setShown] = useState<Record<number, string>>({});
  const nm = (id: string | null) => people.find(p => p.id === id)?.name ?? '-'; const bz = (id: number | null) => biz.find(b => b.id === id)?.name ?? '-';
  const Tab = ({ k, l }: { k: typeof tab; l: string }) => <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 13, background: tab === k ? 'var(--accent-soft)' : undefined, color: tab === k ? 'var(--accent)' : undefined, borderColor: tab === k ? 'var(--accent)' : undefined }} onClick={() => { setTab(k); setEdit(null); }}>{l}</button>;
  const paths = ['/admin/assets'];
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><h1 style={{ fontSize: 20, margin: 0 }}>회사 자산 · 계정</h1><Tab k="accounts" l={`계정 ${accounts.length}`} /><Tab k="phones" l={`업무폰 ${phones.length}`} /><Tab k="biz" l={`사업자 ${biz.length}`} /><span style={{ fontSize: 12, color: 'var(--muted)' }}>어드민 전용 · 비밀번호 열람은 로그 기록</span></div>
      {!secretReady && tab === 'accounts' && <div style={{ background: 'var(--bad-soft)', color: 'var(--bad)', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>Vercel 환경변수 <b>ASSET_SECRET</b>(16자 이상 임의 문자열)이 없어 비밀번호 저장·열람이 막혀 있습니다. 추가 후 Redeploy 하세요.</div>}
      {tab === 'accounts' && <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
        <div className="card"><table><thead><tr><th>서비스</th><th>아이디</th><th>비밀번호</th><th>사업자</th><th>담당</th><th>결제</th><th></th></tr></thead><tbody>{accounts.map(a => <tr key={a.id}><td><b>{a.service}</b>{a.url && <div style={{ fontSize: 11 }}><a href={a.url} target="_blank" rel="noreferrer">{a.url.replace(/^https?:\/\//, '').slice(0, 30)}</a></div>}</td><td>{a.login_id}</td><td>{shown[a.id] ? <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 6 }}>{shown[a.id]}</code> : a.has_pw ? <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={async () => { const x = await revealPassword(a.id); notify(x.msg); if (x.ok && x.pw) { setShown({ ...shown, [a.id]: x.pw }); setTimeout(() => setShown(s => { const c = { ...s }; delete c[a.id]; return c; }), 20000); } }}>보기</button> : <span style={{ color: 'var(--muted)' }}>-</span>}</td><td>{bz(a.business_id)}</td><td>{nm(a.owner_id)}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{a.payment_method}{a.renew_note ? ` · ${a.renew_note}` : ''}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEdit(a)}>편집</button> <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={async () => { if (confirm('삭제할까요?')) { const x = await deactivateAccount(a.id); notify(x.msg); r.refresh(); } }}>삭제</button></td></tr>)}{accounts.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>없음</td></tr>}</tbody></table>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>비밀번호는 20초 후 자동으로 가려집니다. 최근 열람: {logs.filter(l => l.action === 'reveal').slice(0, 5).map(l => `${nm(l.user_id)} ${fmtKST(l.at)}`).join(' · ') || '없음'}</div></div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? `편집 — ${edit.service}` : '계정 추가'}</h3>
          <form key={edit?.id ?? 'new'} action={async fd => { const x = await saveAccount(fd); notify(x.msg); if (x.ok) { setEdit(null); r.refresh(); } }} style={{ display: 'grid', gap: 8 }}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input name="service" placeholder="서비스명" defaultValue={edit?.service ?? ''} required /><input name="login_id" placeholder="아이디" defaultValue={edit?.login_id ?? ''} required /></div>
            <input name="password" type="password" placeholder={edit?.has_pw ? '비밀번호 (변경 시에만 입력)' : '비밀번호'} autoComplete="new-password" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><select name="business_id" defaultValue={edit?.business_id ?? ''}><option value="">사업자</option>{biz.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><select name="owner_id" defaultValue={edit?.owner_id ?? ''}><option value="">담당자</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input name="payment_method" placeholder="결제수단 (카드 ****4417)" defaultValue={edit?.payment_method ?? ''} /><input name="renew_note" placeholder="갱신 (매월 5일)" defaultValue={edit?.renew_note ?? ''} /></div>
            <input name="url" placeholder="URL" defaultValue={edit?.url ?? ''} /><input name="note" placeholder="메모" defaultValue={edit?.note ?? ''} />
            <div style={{ display: 'flex', gap: 8 }}><button className="btn">{edit ? '저장' : '추가'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>취소</button>}</div>
          </form></div></div>}
      {tab === 'phones' && <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
        <div className="card"><table><thead><tr><th>번호</th><th>기기</th><th>담당자</th><th>명의 사업자</th><th>통신사</th><th>개통</th><th></th></tr></thead><tbody>{phones.map(p => <tr key={p.id}><td><b>{p.phone_no}</b></td><td>{p.device}</td><td>{nm(p.owner_id)}</td><td>{bz(p.business_id)}</td><td>{p.carrier}</td><td>{p.opened_at}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEdit(p)}>편집</button> <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={async () => { if (confirm('삭제할까요?')) { const x = await deactivateRow('assets_phones', p.id, paths); notify(x.msg); r.refresh(); } }}>삭제</button></td></tr>)}{phones.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>없음</td></tr>}</tbody></table></div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? '편집' : '업무폰 추가'}</h3>
          <form key={edit?.id ?? 'new'} action={async fd => { const x = await upsertRow('assets_phones', fd, ['business_id'], paths); notify(x.msg); if (x.ok) { setEdit(null); r.refresh(); } }} style={{ display: 'grid', gap: 8 }}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input name="phone_no" placeholder="번호" defaultValue={edit?.phone_no ?? ''} required /><input name="device" placeholder="기기" defaultValue={edit?.device ?? ''} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><select name="owner_id" defaultValue={edit?.owner_id ?? ''}><option value="">담당자</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select name="business_id" defaultValue={edit?.business_id ?? ''}><option value="">명의 사업자</option>{biz.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input name="carrier" placeholder="통신사" defaultValue={edit?.carrier ?? ''} /><input type="date" name="opened_at" defaultValue={edit?.opened_at ?? ''} /></div>
            <input name="note" placeholder="비고" defaultValue={edit?.note ?? ''} />
            <div style={{ display: 'flex', gap: 8 }}><button className="btn">{edit ? '저장' : '추가'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>취소</button>}</div>
          </form></div></div>}
      {tab === 'biz' && <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
        <div className="card"><table><thead><tr><th>법인/상호</th><th>등록번호</th><th>대표</th><th>용도</th><th></th></tr></thead><tbody>{biz.map(b => <tr key={b.id}><td><b>{b.name}</b></td><td>{b.reg_no}</td><td>{b.ceo}</td><td>{b.purpose}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setEdit(b)}>편집</button> <button className="btn ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={async () => { if (confirm('삭제할까요?')) { const x = await deactivateRow('assets_businesses', b.id, paths); notify(x.msg); r.refresh(); } }}>삭제</button></td></tr>)}{biz.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>없음</td></tr>}</tbody></table></div>
        <div className="card"><h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{edit ? '편집' : '사업자 추가'}</h3>
          <form key={edit?.id ?? 'new'} action={async fd => { const x = await upsertRow('assets_businesses', fd, [], paths); notify(x.msg); if (x.ok) { setEdit(null); r.refresh(); } }} style={{ display: 'grid', gap: 8 }}>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <input name="name" placeholder="법인/상호" defaultValue={edit?.name ?? ''} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input name="reg_no" placeholder="등록번호" defaultValue={edit?.reg_no ?? ''} /><input name="ceo" placeholder="대표자" defaultValue={edit?.ceo ?? ''} /></div>
            <input name="purpose" placeholder="용도" defaultValue={edit?.purpose ?? ''} /><input name="note" placeholder="비고" defaultValue={edit?.note ?? ''} />
            <div style={{ display: 'flex', gap: 8 }}><button className="btn">{edit ? '저장' : '추가'}</button>{edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>취소</button>}</div>
          </form></div></div>}
    </div>
  );
}
