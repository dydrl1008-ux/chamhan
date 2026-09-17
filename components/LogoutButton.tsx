'use client';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
export default function LogoutButton() {
  const r = useRouter();
  return <button className="btn ghost" style={{ marginTop: 10, width: '100%', padding: '6px 10px', fontSize: 12 }} onClick={async () => { await supabaseBrowser().auth.signOut(); r.replace('/login'); r.refresh(); }}>로그아웃</button>;
}
