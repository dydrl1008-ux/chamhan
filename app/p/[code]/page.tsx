// 공개 추적 링크 /p/코드 — 열람 기록 후 (native) 워크허브가 그린 제안서 / (link) 외부 제안서 iframe. 로그인·IP 제한 없음(middleware 제외)
import { headers } from 'next/headers';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import ProposalDoc, { PD_CSS, docPageCount } from '@/components/ProposalDoc';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
const BOT = /bot|crawl|spider|scrap|preview|facebookexternalhit|kakaotalk-scrap|slack|telegram|discord|whatsapp|yeti|daum|naver|headless|curl|wget|python|go-http/i;

export default async function PublicProposal({ params, searchParams }: { params: { code: string }; searchParams: { unsub?: string; m?: string } }) {
  const code = (params.code || '').slice(0, 16);
  const msg = (t: string, sub = '') => <div style={{ fontFamily: 'Pretendard, sans-serif', maxWidth: 480, margin: '80px auto', background: '#fff', padding: 32, borderRadius: 12, textAlign: 'center' }}><b style={{ fontSize: 18 }}>{t}</b>{sub && <p style={{ color: '#64748B', fontSize: 14 }}>{sub}</p>}</div>;
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(code)) return msg('잘못된 링크입니다.');
  const sb = supabaseAdmin();
  const { data: pr } = await sb.from('proposals').select('title,kind,data,target_url,email').eq('code', code).maybeSingle();
  if (!pr) return msg('링크를 찾을 수 없습니다.');
  // 메일 발송 건(?m=큐번호): 수신자별 열람·수신거부
  const mId = /^\d{1,12}$/.test(searchParams.m ?? '') ? Number(searchParams.m) : null;
  const mq = mId ? (await sb.from('mail_queue').select('id,to_email,proposal_code,opened_at,open_cnt').eq('id', mId).maybeSingle()).data : null;
  if (searchParams.unsub === '1') {
    const em = (mq?.to_email || pr.email || '').toLowerCase();
    if (em) await sb.from('email_optouts').upsert({ email: em, code }, { onConflict: 'email' });
    return msg('수신거부 처리되었습니다', '앞으로 이 주소로 안내 메일을 보내지 않습니다.');
  }
  const h = headers(); const ua = h.get('user-agent') ?? ''; const ip = (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || '').trim();
  if (!(BOT.test(ua) || !ua)) {
    const ipHash = createHash('sha256').update(ip + '|' + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').slice(-16)).digest('hex').slice(0, 32);
    await sb.rpc('proposal_hit', { p_code: code, p_ip_hash: ipHash, p_ua: ua });
    if (mq && mq.proposal_code === code) await sb.from('mail_queue').update({ opened_at: mq.opened_at ?? new Date().toISOString(), open_cnt: (mq.open_cnt ?? 0) + 1 }).eq('id', mq.id);
  }
  if (pr.kind === 'native' && pr.data) {
    const d = pr.data as any;
    return <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      <style dangerouslySetInnerHTML={{ __html: 'html,body{margin:0;background:#E9ECF3;-webkit-text-size-adjust:100%;text-size-adjust:100%}' + PD_CSS + '#pdo{padding:18px 0;overflow:hidden}#pdw{width:827px;transform-origin:top left}' }} />
      <title>{pr.title || '제안서'}</title>
      {/* 폰: zoom 대신 transform scale — iOS 가 zoom 된 글자를 키워(text-size-adjust) 페이지 밖으로 밀어내던 문제 */}
      <div id="pdo"><div id="pdw"><ProposalDoc d={d} total={docPageCount(d)} /></div></div>
      <script dangerouslySetInnerHTML={{ __html: "(function(){function f(){var w=document.getElementById('pdw'),o=document.getElementById('pdo');if(!w||!o)return;var s=Math.min(1,(window.innerWidth-16)/827);w.style.transform='scale('+s+')';w.style.marginLeft=Math.max(0,(window.innerWidth-827*s)/2)+'px';o.style.height=(w.offsetHeight*s+36)+'px';}f();window.addEventListener('resize',f);window.addEventListener('orientationchange',function(){setTimeout(f,100)});})();" }} />
    </>;
  }
  const target = pr.target_url;
  if (!target || !/^https:\/\//.test(target)) return msg('링크를 찾을 수 없습니다.');
  return <><title>{pr.title || '제안서'}</title><style dangerouslySetInnerHTML={{ __html: 'html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100vw;height:100vh;display:block}' }} /><iframe src={target} referrerPolicy="no-referrer" allow="fullscreen" title={pr.title || '제안서'} /></>;
}
