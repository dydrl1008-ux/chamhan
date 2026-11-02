// 공개 추적 링크 /p/코드 — 열람 기록 후 (native) 워크허브가 그린 제안서 / (link) 외부 제안서 iframe. 로그인·IP 제한 없음(middleware 제외)
import { headers } from 'next/headers';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import ProposalDoc, { PD_CSS, docPageCount } from '@/components/ProposalDoc';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
const BOT = /bot|crawl|spider|scrap|preview|facebookexternalhit|kakaotalk-scrap|slack|telegram|discord|whatsapp|yeti|daum|naver|headless|curl|wget|python|go-http/i;

export default async function PublicProposal({ params, searchParams }: { params: { code: string }; searchParams: { unsub?: string } }) {
  const code = (params.code || '').slice(0, 16);
  const msg = (t: string, sub = '') => <div style={{ fontFamily: 'Pretendard, sans-serif', maxWidth: 480, margin: '80px auto', background: '#fff', padding: 32, borderRadius: 12, textAlign: 'center' }}><b style={{ fontSize: 18 }}>{t}</b>{sub && <p style={{ color: '#64748B', fontSize: 14 }}>{sub}</p>}</div>;
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(code)) return msg('잘못된 링크입니다.');
  const sb = supabaseAdmin();
  const { data: pr } = await sb.from('proposals').select('title,kind,data,target_url,email').eq('code', code).maybeSingle();
  if (!pr) return msg('링크를 찾을 수 없습니다.');
  if (searchParams.unsub === '1') {
    if (pr.email) await sb.from('email_optouts').upsert({ email: pr.email.toLowerCase(), code }, { onConflict: 'email' });
    return msg('수신거부 처리되었습니다', '앞으로 이 주소로 안내 메일을 보내지 않습니다.');
  }
  const h = headers(); const ua = h.get('user-agent') ?? ''; const ip = (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || '').trim();
  if (!(BOT.test(ua) || !ua)) {
    const ipHash = createHash('sha256').update(ip + '|' + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(-16)).digest('hex').slice(0, 32);
    await sb.rpc('proposal_hit', { p_code: code, p_ip_hash: ipHash, p_ua: ua });
  }
  if (pr.kind === 'native' && pr.data) {
    const d = pr.data as any;
    return <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      <style dangerouslySetInnerHTML={{ __html: 'html,body{margin:0;background:#E9ECF3}' + PD_CSS + '@media(max-width:860px){.pd{zoom:.45}}' }} />
      <title>{pr.title || '제안서'}</title>
      <div style={{ padding: '18px 8px' }}><ProposalDoc d={d} total={docPageCount(d)} /></div>
    </>;
  }
  const target = pr.target_url;
  if (!target || !/^https:\/\//.test(target)) return msg('링크를 찾을 수 없습니다.');
  return <><title>{pr.title || '제안서'}</title><style dangerouslySetInnerHTML={{ __html: 'html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100vw;height:100vh;display:block}' }} /><iframe src={target} referrerPolicy="no-referrer" allow="fullscreen" title={pr.title || '제안서'} /></>;
}
