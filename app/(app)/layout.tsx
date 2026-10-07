import NavLink from '@/components/NavLink';
import NavGroup from '@/components/NavGroup';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
const g = globalThis as any; async function cachedPendingCount(): Promise<number> { const c = g.__pendingCnt as { at: number; v: number } | undefined; if (c && Date.now() - c.at < 30_000) return c.v; const { count } = await supabaseServer().from('settlement_pending').select('item_key', { count: 'exact', head: true }).is('resolved_at', null).is('dismissed_at', null); const v = count ?? 0; g.__pendingCnt = { at: Date.now(), v }; return v; }
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import Toast from '@/components/Toast';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const p = await getProfile();
  if (!p) redirect('/login');
  if (!p.is_active) redirect('/login?inactive=1');
  const roleName = { admin: '어드민', head: '총책임자', manager: '팀장', staff: p.is_mgmt ? '관리팀' : '직원' }[p.role];
  const lead = p.role === 'admin' || p.role === 'head'; const mgmt = lead || p.is_mgmt; const mgr = p.role === 'manager';
  let pendingCount = 0; if (mgmt) { pendingCount = await cachedPendingCount(); }
  const badge = pendingCount ? <span className="badge">{pendingCount}</span> : null;
  // 메뉴 6묶음: 홈 · 정산 · 직원/마진 · 근태/계획 · 보고/이슈 · 설정. 역할별로 보이는 항목만
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '232px 1fr', minHeight: '100vh' }}>
      <aside className="side">
        <div className="brand">워크허브<small>참한기획</small></div>
        <NavLink href="/">홈</NavLink>

        {mgmt && pendingCount > 0 && <NavLink href="/pending">정산 승인 대기{badge}</NavLink>}
        <NavGroup title="정산" hrefs={['/pending', '/settle-request', '/settle-refund', '/settle-customers', '/settle-data', '/settlement']}>
          {mgmt && <NavLink href="/pending">정산 승인 대기{badge}</NavLink>}
          <NavLink href="/settle-request">정산요청</NavLink>
          <NavLink href="/settle-refund">환불요청</NavLink>
          {mgmt && <NavLink href="/settle-customers">고객 등록 · 배정</NavLink>}
          {mgmt && <NavLink href="/settle-data">정산 데이터</NavLink>}
          {mgmt && <NavLink href="/settlement">정산 연동</NavLink>}
        </NavGroup>

        <NavGroup title="직원 · 마진" hrefs={['/overview', '/margin', '/kpi', '/users', '/criteria']}>
          {p.role !== 'staff' && <NavLink href="/overview">직원 현황</NavLink>}
          <NavLink href="/margin">영업 마진</NavLink>
          <NavLink href="/kpi">{p.role === 'head' ? '일간 KPI 현황' : '일간 KPI 보고'}</NavLink>
          {lead && <NavLink href="/users">사용자 · 팀</NavLink>}
          <NavLink href="/criteria">진급 · 인센티브 기준</NavLink>
        </NavGroup>

        <NavGroup title="근태 · 계획" hrefs={['/attendance', '/leave', '/plans']}>
          <NavLink href="/attendance">출퇴근</NavLink>
          <NavLink href="/leave">근태 신청 · 승인</NavLink>
          <NavLink href="/plans">계획 캘린더</NavLink>
        </NavGroup>

        <NavGroup title="보고 · 이슈" hrefs={['/weekly', '/reports', '/issues', '/products']}>
          {(mgr || lead) && <NavLink href="/weekly">팀장 주간보고</NavLink>}
          <NavLink href="/reports">보고서</NavLink>
          <NavLink href="/issues">금일 이슈</NavLink>
          <NavLink href="/products">상품 안내 · 접수</NavLink>
        </NavGroup>

        {p.role === 'admin' && (
          <NavGroup title="설정" hrefs={['/admin']}>
            <NavLink href="/admin/targets">월 목표 마진</NavLink>
            <NavLink href="/admin/criteria">기준 관리</NavLink>
            <NavLink href="/admin/promotion">진급 도달 현황</NavLink>
            <NavLink href="/admin/pnl">영업이익 월별</NavLink>
            <NavLink href="/admin/products">상품 관리</NavLink>
            <NavLink href="/admin/promotions">프로모션</NavLink>
            <NavLink href="/admin/forms">보고서 양식</NavLink>
            <NavLink href="/admin/duties">관리팀 담당업무</NavLink>
            <NavLink href="/admin/assets">자산 · 계정</NavLink>
            <NavLink href="/admin/ips">허용 IP</NavLink>
          </NavGroup>
        )}

        <div className="foot">
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{p.name}</div>
          <div>{roleName}{p.position ? ` · ${p.position}` : ''}</div>
          <a href="/me" style={{ display: 'block', fontSize: 12.5, color: '#8A95BC', marginTop: 6 }}>내 정보 · 정산 계정 · 비밀번호</a>
          <LogoutButton />
        </div>
      </aside>
      <main style={{ padding: '28px 32px', minWidth: 0 }}>{children}</main>
      <Toast />
    </div>
  );
}
