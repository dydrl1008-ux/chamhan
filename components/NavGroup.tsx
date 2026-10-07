'use client';
import { usePathname } from 'next/navigation';
/** 사이드바 묶음: 현재 화면이 속한 묶음만 펼침, 나머지는 제목만 (클릭하면 펼침) */
export default function NavGroup({ title, hrefs, children }: { title: string; hrefs: string[]; children: React.ReactNode }) {
  const path = usePathname(); const on = hrefs.some(h => path === h || path.startsWith(h + '/'));
  return <details open={on} className="navgroup"><summary className="group">{title}</summary>{children}</details>;
}
