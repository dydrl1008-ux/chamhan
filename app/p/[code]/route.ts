import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';

// 카톡·메신저 링크 미리보기 봇은 열람으로 세지 않음
const BOT = /bot|crawl|spider|scrap|preview|facebookexternalhit|kakaotalk-scrap|slack|telegram|discord|whatsapp|yeti|daum|naver|headless|curl|wget|python|go-http/i;

/** 공개 추적 링크 /p/코드 → 열람 기록 후 실제 제안서로 이동 (로그인·IP 제한 없음) */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = (params.code || '').slice(0, 16);
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(code)) return new NextResponse('잘못된 링크입니다.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const ua = req.headers.get('user-agent') ?? '';
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim();
  const sb = supabaseAdmin();
  let target: string | null = null;
  if (BOT.test(ua) || !ua) {
    const { data } = await sb.from('proposals').select('target_url').eq('code', code).maybeSingle();
    target = data?.target_url ?? null;
  } else {
    const ipHash = createHash('sha256').update(ip + '|' + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(-16)).digest('hex').slice(0, 32);
    const { data } = await sb.rpc('proposal_hit', { p_code: code, p_ip_hash: ipHash, p_ua: ua });
    target = (data as string | null) ?? null;
  }
  if (!target || !/^https:\/\//.test(target)) return new NextResponse('링크를 찾을 수 없습니다.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return NextResponse.redirect(target, { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
