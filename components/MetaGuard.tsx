'use client';
// 메타팀이 영업사원용 주소로 들어오면 홈으로 돌려보낸다 (메뉴는 이미 숨김 — 화면 안 링크로 넘어오는 경우까지 막기)
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
export default function MetaGuard({ block }: { block: string[] }) {
  const path = usePathname(); const r = useRouter();
  useEffect(() => { if (block.some(b => path === b || path.startsWith(b + '/'))) r.replace('/meta-db'); }, [path, block, r]);
  return null;
}
