import Link from 'next/link';
import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import Toast from '@/components/Toast';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const p = await getProfile();
  if (!p) redirect('/login');
  if (!p.is_active) redirect('/login?inactive=1');
  const roleName = { admin: '어드민', head: '총책임자', manager: '팀장', staff: '직원' }[p.role];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr' }}>
      <aside className="side">
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, padding: '4px 12px 18px' }}>워크허브</div>
        <Link href="/">메인</Link>
        <Link href="/issues">금일 이슈</Link>
        <Link href="/attendance">출퇴근</Link>
        <Link href="/leave">근태</Link>
        <div style={{ fontSize: 11, color: '#5C6890', padding: '14px 12px 4px' }}>영업</div>
        {p.role !== 'head' && <Link href="/kpi">일간 KPI 보고</Link>}
        {p.role === 'head' && <Link href="/kpi">일간 KPI 현황</Link>}
        <Link href="/margin">영업 마진</Link>
        {p.role !== 'staff' && <Link href="/weekly">팀장 주간보고</Link>}
        <Link href="/plans">계획 캘린더</Link>
        <Link href="/reports">보고서</Link>
        <Link href="/products">상품 안내·접수</Link>
        <div style={{ fontSize: 11, color: '#5C6890', padding: '14px 12px 4px' }}>기준·내 정보</div>
        <Link href="/criteria">진급·인센티브 기준</Link>
        <Link href="/me">마이페이지</Link>
        {p.role === 'admin' && (<>
          <div style={{ fontSize: 11, color: '#5C6890', padding: '14px 12px 4px' }}>어드민</div>
          <Link href="/admin/users">사용자 · 팀</Link>
          <Link href="/admin/ips">허용 IP</Link>
          <Link href="/admin/targets">월 목표 마진</Link>
          <Link href="/admin/promotion">진급 도달 현황</Link>
          <Link href="/admin/criteria">기준 관리</Link>
          <Link href="/admin/forms">보고서 양식</Link>
          <Link href="/admin/products">상품 관리</Link>
          <Link href="/admin/promotions">프로모션</Link>
          <Link href="/admin/duties">관리팀 담당업무</Link>
          <Link href="/admin/pnl">영업이익 월별</Link>
          <Link href="/admin/assets">자산·계정</Link>
        </>)}
        <div style={{ marginTop: 30, padding: 12, background: 'rgba(255,255,255,.05)', borderRadius: 12, fontSize: 12.5 }}>
          <div style={{ color: '#fff', fontWeight: 600 }}>{p.name}</div>
          <div>{roleName}{p.position ? ` · ${p.position}` : ''}</div>
          <LogoutButton />
        </div>
      </aside>
      <main style={{ padding: 28 }}>{children}</main>
      <Toast />
    </div>
  );
}
