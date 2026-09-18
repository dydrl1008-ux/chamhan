import NavLink from '@/components/NavLink';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import Toast from '@/components/Toast';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const p = await getProfile();
  if (!p) redirect('/login');
  if (!p.is_active) redirect('/login?inactive=1');
  const roleName = { admin: '어드민', head: '총책임자', manager: '팀장', staff: '직원' }[p.role];
  let pendingCount = 0; if (p.role === 'admin' || p.role === 'head' || p.is_mgmt) { const { count } = await supabaseServer().from('settlement_pending').select('item_key', { count: 'exact', head: true }).is('resolved_at', null).is('dismissed_at', null); pendingCount = count ?? 0; }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr' }}>
      <aside className="side">
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, padding: '4px 12px 18px' }}>워크허브</div>
        <NavLink href="/">메인</NavLink>
        {p.role !== 'staff' && <NavLink href="/overview">직원 현황</NavLink>}
        <NavLink href="/issues">금일 이슈</NavLink>
        <NavLink href="/attendance">출퇴근</NavLink>
        <NavLink href="/leave">근태</NavLink>
        <div style={{ fontSize: 11, color: '#5C6890', padding: '14px 12px 4px' }}>영업</div>
        {p.role !== 'head' && <NavLink href="/kpi">일간 KPI 보고</NavLink>}
        {p.role === 'head' && <NavLink href="/kpi">일간 KPI 현황</NavLink>}
        <NavLink href="/margin">영업 마진</NavLink>
        <NavLink href="/settle-request">정산요청</NavLink>
        {p.role !== 'staff' && <NavLink href="/weekly">팀장 주간보고</NavLink>}
        {(p.role === 'admin' || p.role === 'head' || p.is_mgmt) && <NavLink href="/settlement">정산 연동</NavLink>}
        {(p.role === 'admin' || p.role === 'head' || p.is_mgmt) && <NavLink href="/settle-data">정산 데이터</NavLink>}
        {(p.role === 'admin' || p.role === 'head' || p.is_mgmt) && <NavLink href="/pending">정산 승인 대기{pendingCount ? <span style={{ marginLeft: 'auto', background: '#FF5A5F', color: '#fff', borderRadius: 10, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', float: 'right' }}>{pendingCount}</span> : null}</NavLink>}
        {(p.role === 'admin' || p.role === 'head') && <NavLink href="/users">사용자 · 팀</NavLink>}
        <NavLink href="/plans">계획 캘린더</NavLink>
        <NavLink href="/reports">보고서</NavLink>
        <NavLink href="/products">상품 안내·접수</NavLink>
        <div style={{ fontSize: 11, color: '#5C6890', padding: '14px 12px 4px' }}>기준·내 정보</div>
        <NavLink href="/criteria">진급·인센티브 기준</NavLink>
        <NavLink href="/me">마이페이지</NavLink>
        {p.role === 'admin' && (<>
          <div style={{ fontSize: 11, color: '#5C6890', padding: '14px 12px 4px' }}>어드민</div>
          <NavLink href="/admin/ips">허용 IP</NavLink>
          <NavLink href="/admin/targets">월 목표 마진</NavLink>
          <NavLink href="/admin/promotion">진급 도달 현황</NavLink>
          <NavLink href="/admin/criteria">기준 관리</NavLink>
          <NavLink href="/admin/forms">보고서 양식</NavLink>
          <NavLink href="/admin/products">상품 관리</NavLink>
          <NavLink href="/admin/promotions">프로모션</NavLink>
          <NavLink href="/admin/duties">관리팀 담당업무</NavLink>
          <NavLink href="/admin/pnl">영업이익 월별</NavLink>
          <NavLink href="/admin/assets">자산·계정</NavLink>
        </>)}
        <div style={{ marginTop: 30, padding: 12, background: 'rgba(255,255,255,.05)', borderRadius: 12, fontSize: 12.5 }}>
          <div style={{ color: '#fff', fontWeight: 600 }}>{p.name}</div>
          <div>{roleName}{p.position ? ` · ${p.position}` : ''}</div>
          <a href="/me" style={{ display: 'block', fontSize: 11.5, color: '#8590B3', marginTop: 8 }}>마이페이지 · 비밀번호 변경</a>
          <LogoutButton />
        </div>
      </aside>
      <main style={{ padding: 28 }}>{children}</main>
      <Toast />
    </div>
  );
}
