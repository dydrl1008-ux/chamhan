// 제안서 v3 한 장 — 워커 PC 캡처용·직원 미리보기. ?kind=keyword|store&ref=키워드|업체id&page=1..8&t=CRON_SECRET (또는 로그인)
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/auth/session';
import Pv3Doc, { PV3_CSS, PV3_PAGES } from '@/components/Pv3Doc';
import { computeStore, fallbackKwAi, fallbackStoreAi, type KwData, type KwAi, type StoreData, type StoreAi } from '@/lib/proposalV3';
import { BRAND } from '@/lib/proposalDoc';
export const dynamic = 'force-dynamic';

export default async function Pv3View({ searchParams }: { searchParams: { kind?: string; ref?: string; page?: string; t?: string } }) {
  const okToken = !!process.env.CRON_SECRET && searchParams.t === process.env.CRON_SECRET;
  if (!okToken) { const me = await getProfile(); if (!me) return <div style={{ padding: 40 }}>권한 없음</div>; }
  const page = Math.min(PV3_PAGES, Math.max(1, Number(searchParams.page ?? 1) || 1)); const sb = supabaseAdmin();
  let k: KwData | null = null, ka: KwAi | null = null, s: StoreData | null = null, sa: StoreAi | null = null, owner = '', phone = '';
  if (searchParams.kind === 'store') {
    const { data: st } = await sb.from('pv3_stores').select('keyword,data,ai').eq('id', Number(searchParams.ref)).maybeSingle(); if (!st) return <div style={{ padding: 40 }}>업체 없음</div>;
    const { data: kd } = await sb.from('pv3_keywords').select('data,ai,created_by').eq('keyword', st.keyword).maybeSingle(); if (!kd) return <div style={{ padding: 40 }}>키워드 없음</div>;
    k = kd.data as KwData; s = st.data as StoreData; ka = (kd.ai as KwAi) ?? fallbackKwAi(k, s); sa = (st.ai as StoreAi) ?? fallbackStoreAi(k, s);
    if (kd.created_by) { const { data: pr } = await sb.from('profiles').select('name,phone').eq('id', kd.created_by).maybeSingle(); owner = pr?.name ?? ''; phone = pr?.phone ?? ''; }
  } else {
    const { data: kd } = await sb.from('pv3_keywords').select('data,ai,created_by').eq('keyword', String(searchParams.ref ?? '')).maybeSingle(); if (!kd) return <div style={{ padding: 40 }}>키워드 없음</div>;
    k = kd.data as KwData; s = computeStore(k, { store: '귀사', rank: null, reviews: null, price: null }); ka = (kd.ai as KwAi) ?? fallbackKwAi(k, s); sa = fallbackStoreAi(k, s);
    if (kd.created_by) { const { data: pr } = await sb.from('profiles').select('name,phone').eq('id', kd.created_by).maybeSingle(); owner = pr?.name ?? ''; phone = pr?.phone ?? ''; }
  }
  const { data: kk } = await sb.from('ai_settings').select('value').eq('key', 'kakao_open').maybeSingle();
  const brand = { name: BRAND.name, owner: owner || '담당자', phone, email: BRAND.email, kakao: kk?.value || 'https://open.kakao.com/o/saz4cuKi' };
  return <html lang="ko"><head><meta charSet="utf-8" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@600;900&display=swap" />
    <style dangerouslySetInnerHTML={{ __html: PV3_CSS + `\nhtml,body{margin:0;background:#F4F1EA}` }} /></head>
    <body><div id="pv3-page"><Pv3Doc k={k} ka={ka} s={s} sa={sa} brand={brand} page={page} /></div></body></html>;
}
