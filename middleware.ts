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
  // DB 가 응답을 못 하면(재시작·과부하) 목록을 '빈 것'으로 기억하지 않는다 — 예전엔 그 1분 동안 등록된 사무실 IP 까지 전부 차단 화면이 떴다.
  // 실패하면 마지막으로 읽은 목록을 그대로 쓰고(10초 뒤 다시 시도), 한 번도 못 읽은 상태면 이번 요청만 차단한다
  const get = (path: string) => fetch(`${url}/rest/v1/${path}`, { headers: h, cache: 'no-store', signal: AbortSignal.timeout(4000) }).then(r => r.ok ? r.json() : null).catch(() => null);
  const [ips, st] = await Promise.all([get('allowed_ips?select=cidr&is_active=eq.true'), get('app_settings?select=value&key=eq.admin_bypass_ip')]);
  if (!Array.isArray(ips)) { if (cache) { cache.at = Date.now() - 50_000; return cache; } return { at: 0, rows: [] as IpRow[], bypass: false }; }
  cache = { at: Date.now(), rows: ips as IpRow[], bypass: Array.isArray(st) ? (st?.[0]?.value ?? 'false') === 'true' : (cache?.bypass ?? false) };
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
  req.headers.set('x-wh-path', pathname);   // 화면 쪽에서 현재 주소를 알 수 있게 (메타팀 접근 제한 등)
  // 0) 수신거부 전용 주소(이름에 unsub·optout 이 든 도메인, 또는 UNSUB_HOSTS) — 수신거부 페이지만 보여 주고 워크허브 화면은 전부 없는 페이지로
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  if (/unsub|optout/.test(host) || (process.env.UNSUB_HOSTS ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).includes(host)) {
    if (pathname === '/') { const u = req.nextUrl.clone(); u.pathname = '/unsub'; return NextResponse.rewrite(u); }
    return new NextResponse('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });
  }
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
  // 미들웨어는 '로그인 여부'만 보면 되므로 쿠키 세션으로 판단 (네트워크 왕복 없음). 실제 사용자 검증은 페이지의 getProfile(getUser) 에서 수행.
  const { data: { session } } = await sb.auth.getSession(); const user = session?.user ?? null;

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

// p/ = 고객에게 보내는 제안서 추적 링크 (로그인·IP 제한 없이 열려야 함)
// unsub = 공개 수신거부 페이지 (받는 사람이 자기 이메일을 직접 적음)
// api/pv3·api/mail/pull·pv3/view = 워커 PC·SNS_Manager 가 토큰/키로 호출 (세션·IP 차단 없이, 각 라우트가 자체 검증)
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron|api/meta/intake|api/mail/agent-callback|api/mail/pull|api/pv3|pv3/view|p/|unsub$|.*\\.(?:png|jpg|svg|ico)$).*)'] };
