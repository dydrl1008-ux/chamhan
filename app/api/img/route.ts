// 상품 썸네일 프록시 — 리포트 PNG 저장 때 외부 이미지(CORS) 때문에 빈칸 되는 것 방지. 네이버 이미지 호스트만 허용. 로그인 세션 필요(middleware)
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const OK = /(^|\.)(pstatic\.net|naver\.net|naver\.com)$/i;
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') ?? '';
  let url: URL; try { url = new URL(u); } catch { return new NextResponse('bad url', { status: 400 }); }
  if (url.protocol !== 'https:' || !OK.test(url.hostname)) return new NextResponse('host not allowed', { status: 403 });
  try {
    const r = await fetch(url.toString(), { headers: { Referer: 'https://search.shopping.naver.com/' } });
    if (!r.ok) return new NextResponse('fetch fail', { status: 502 });
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, { headers: { 'Content-Type': r.headers.get('content-type') ?? 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
  } catch { return new NextResponse('fetch error', { status: 502 }); }
}
