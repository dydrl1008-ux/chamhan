import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
type CookieToSet = { name: string; value: string; options?: CookieOptions };

// ---------- IP 검사 (허용 IP는 60초 캐시) ----------
type IpRow = { cidr: string };
let cache: { at: number; rows: IpRow[]; bypass: boolean } | null = null;

async function loadAllowed() {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const [ips, st] = await Promise.all([
    fetch(`${url}/rest/v1/allowed_ips?select=cidr&is_active=eq.true`, { headers: h, cache: 'no-store' }).then(r => r.ok ? r.json() : []),
    fetch(`${url}/rest/v1/app_settings?select=value&key=eq.admin_bypass_ip`, { headers: h, cache: 'no-store' }).then(r => r.ok ? r.json() : []),
  ]);
  cache = { at: Date.now(), rows: ips as IpRow[], bypass: (st?.[0]?.value ?? 'false') === 'true' };
  return cache;
}
function ipToInt(ip: string) { const p = ip.split('.').map(Number); return p.length === 4 && p.every(n => n >= 0 && n <= 255) ? ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3] : null; }
function inCidr(ip: string, cidr: string) {
  const [base, bitsStr] = cidr.split('/'); const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  const a = ipToInt(ip), b = ipToInt(base);
  if (a === null || b === null) return ip === base;                 // IPv6 등은 정확히 일치만
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}
export function clientIp(req: NextRequest) {
  const xff = req.headers.get('x-forwarded-for');
  return (xff?.split(',')[0] || req.headers.get('x-real-ip') || req.ip || '').trim();
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = clientIp(req);

  // 1) IP 차단 — 로그인 전 단계에서 먼저. /blocked 자체와 정적파일은 제외
  const { rows, bypass } = await loadAllowed();
  const allowed = rows.some(r => inCidr(ip, r.cidr));

  // 2) 세션 갱신 (Supabase SSR 표준)
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: CookieToSet[]) => { list.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); },
    },
  });
  const { data: { user } } = await sb.auth.getUser();

  if (!allowed) {
    // admin 우회 옵션이 켜져 있고 로그인된 admin이면 통과
    let isAdmin = false;
    if (bypass && user) {
      const { data } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
      isAdmin = data?.role === 'admin';
    }
    if (!isAdmin && pathname !== '/blocked') {
      const u = req.nextUrl.clone(); u.pathname = '/blocked'; u.searchParams.set('ip', ip);
      return NextResponse.rewrite(u, { status: 403 });
    }
  }

  // 3) 로그인 강제
  const isPublic = pathname === '/login' || pathname === '/blocked';
  if (!user && !isPublic) { const u = req.nextUrl.clone(); u.pathname = '/login'; return NextResponse.redirect(u); }
  if (user && pathname === '/login') { const u = req.nextUrl.clone(); u.pathname = '/'; return NextResponse.redirect(u); }
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)'] };
