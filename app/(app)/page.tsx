import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
export default async function Home() {
  const p = (await getProfile())!;
  // RLS 확인용: 내 권한에서 보이는 인원 수 (1-A 종료 점검 항목)
  const { count } = await supabaseServer().from('profiles').select('id', { count: 'exact', head: true });
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, margin: '0 0 6px' }}>{p.name}님, 로그인되었습니다</h1>
      <p style={{ color: 'var(--muted)', margin: 0 }}>1-A 단계: 인증 · IP · 사용자 관리만 열려 있습니다.</p>
      <p style={{ marginTop: 14 }}>이 계정에서 보이는 인원: <b>{count ?? 0}명</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>(admin/head=전체, manager=본인 팀, staff=1)</span></p>
    </div>
  );
}
