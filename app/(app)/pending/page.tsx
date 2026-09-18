import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { fmtKST, won } from '@/lib/date/kst';
import AutoRefresh from './AutoRefresh';
import CheckNow from './CheckNow';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export default async function PendingPage() {
  const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) redirect('/');
  const sb = supabaseServer();
  const [{ data: open }, { data: done }] = await Promise.all([
    sb.from('settlement_pending').select('*').is('resolved_at', null).order('first_seen', { ascending: false }),
    sb.from('settlement_pending').select('*').not('resolved_at', 'is', null).order('resolved_at', { ascending: false }).limit(30),
  ]);
  const base = process.env.SETTLE_BASE_URL || 'http://lchkgy.com';
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <AutoRefresh seconds={60} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><h1 style={{ fontSize: 20, margin: 0 }}>정산 승인 대기</h1><span className="pill" style={(open ?? []).length ? { background: 'var(--bad-soft)', color: 'var(--bad)' } : { background: 'var(--ok-soft)', color: 'var(--ok)' }}>{(open ?? []).length}건</span><CheckNow /><span style={{ fontSize: 12, color: 'var(--muted)' }}>2분마다 정산 사이트 확인 · 화면 1분마다 자동 새로고침 · 승인/반려는 <a href={base} target="_blank" rel="noreferrer">정산 사이트</a>에서 → 처리되면 여기서 자동으로 빠짐</span></div>
      <div className="card"><div style={{ overflowX: 'auto' }}><table><thead><tr><th>정산번호</th><th>들어온 시각</th><th>요청일</th><th>담당자</th><th>고객</th><th>상품</th><th>구분</th><th style={{ textAlign: 'right' }}>영업이익</th><th>상태</th></tr></thead><tbody>
        {(open ?? []).map(p => <tr key={p.item_key}><td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12.5 }}>{p.settle_no}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtKST(p.first_seen)}</td><td>{p.req_date}</td><td><b>{p.empl_name}</b> <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.empl_id}</span></td><td>{p.cust_name}</td><td>{p.prod_name}</td><td>{p.req_gubun}</td><td style={{ textAlign: 'right', color: p.amount < 0 ? 'var(--bad)' : 'inherit' }}>{won(p.amount)}</td><td><span className="pill" style={{ background: '#FDF1DD', color: '#D97706' }}>{p.status}</span></td></tr>)}
        {(open ?? []).length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>대기 중인 승인요청 없음</td></tr>}</tbody></table></div></div>
      <div className="card"><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>최근 처리됨 <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>30건</span></h3><div style={{ overflowX: 'auto' }}><table><thead><tr><th>정산번호</th><th>요청일</th><th>처리 시각</th><th>담당자</th><th>고객</th><th>상품</th><th>구분</th><th style={{ textAlign: 'right' }}>영업이익</th><th>결과</th></tr></thead><tbody>
        {(done ?? []).map(p => <tr key={p.item_key}><td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12.5 }}>{p.settle_no}</td><td>{p.req_date}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtKST(p.resolved_at)}</td><td>{p.empl_name}</td><td>{p.cust_name}</td><td>{p.prod_name}</td><td>{p.req_gubun}</td><td style={{ textAlign: 'right', color: p.amount < 0 ? 'var(--bad)' : 'inherit' }}>{won(p.amount)}</td><td><span className="pill" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>{p.resolved_status}</span></td></tr>)}
        {(done ?? []).length === 0 && <tr><td colSpan={9} style={{ color: 'var(--muted)' }}>없음</td></tr>}</tbody></table></div></div>
    </div>
  );
}
