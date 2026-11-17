// 제안서 PDF 저장용 — 네이버 상품 이미지를 같은 출처로 중계 (브라우저가 다른 사이트 이미지를 캔버스에 못 그리는 제한 때문). 로그인한 직원만, 네이버 이미지 주소만
import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth/session';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const me = await getProfile(); if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  let u: URL; try { u = new URL(new URL(req.url).searchParams.get('u') ?? ''); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (u.protocol !== 'https:' || !/(^|\.)(pstatic\.net|naver\.net|naver\.com)$/i.test(u.hostname)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const r = await fetch(u.toString(), { signal: AbortSignal.timeout(8000), redirect: 'error', headers: { 'user-agent': 'Mozilla/5.0' } });
    const type = r.headers.get('content-type') ?? ''; if (!r.ok || !type.startsWith('image/')) return NextResponse.json({ ok: false }, { status: 502 });
    const buf = await r.arrayBuffer(); if (buf.byteLength > 5_000_000) return NextResponse.json({ ok: false }, { status: 413 });
    return new NextResponse(buf, { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' } });
  } catch { return NextResponse.json({ ok: false }, { status: 502 }); }
}
