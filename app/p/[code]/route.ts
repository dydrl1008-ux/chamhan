import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';

// 카톡·메신저 링크 미리보기 봇은 열람으로 세지 않음
const BOT = /bot|crawl|spider|scrap|preview|facebookexternalhit|kakaotalk-scrap|slack|telegram|discord|whatsapp|yeti|daum|naver|headless|curl|wget|python|go-http/i;

/** 공개 추적 링크 /p/코드 → 열람 기록 후 제안서를 이 주소 안에 끼워서 표시 (goat-app 주소 노출 안 함). 로그인·IP 제한 없음 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = (params.code || '').slice(0, 16);
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(code)) return new NextResponse('잘못된 링크입니다.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const ua = req.headers.get('user-agent') ?? '';
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim();
  const sb = supabaseAdmin();
  let target: string | null = null; let title = '제안서';
  if (BOT.test(ua) || !ua) {
    const { data } = await sb.from('proposals').select('target_url,title').eq('code', code).maybeSingle();
    target = data?.target_url ?? null; title = data?.title || title;
  } else {
    const { data: pr } = await sb.from('proposals').select('title').eq('code', code).maybeSingle(); title = pr?.title || title;
    const ipHash = createHash('sha256').update(ip + '|' + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(-16)).digest('hex').slice(0, 32);
    const { data } = await sb.rpc('proposal_hit', { p_code: code, p_ip_hash: ipHash, p_ua: ua });
    target = (data as string | null) ?? null;
  }
  if (!target || !/^https:\/\//.test(target)) return new NextResponse('링크를 찾을 수 없습니다.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe src="${esc(target)}" referrerpolicy="no-referrer" allow="fullscreen" title="${esc(title)}"></iframe></body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
