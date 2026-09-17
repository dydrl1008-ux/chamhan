import { requireRole } from '@/lib/auth/session';
import AppLayout from '@/app/(app)/layout';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['admin']);            // 직원이 /admin/* 직접 치면 여기서 / 로 튕김 (+ RLS로 데이터도 안 보임)
  return <AppLayout>{children}</AppLayout>;
}
