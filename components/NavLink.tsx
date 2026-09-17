'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname(); const on = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
  return <Link href={href} className={on ? 'nav on' : 'nav'} style={on ? { background: '#26308F', color: '#fff', fontWeight: 600, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' } : undefined}>{children}</Link>;
}
