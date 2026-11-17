// 제안서 v3 한 장 — 워커 PC 캡처용·직원 미리보기. ?kind=keyword|store&ref=키워드|업체id&page=1..8&t=CRON_SECRET (또는 로그인)
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getProfile } from '@/lib/auth/session';
import Pv3Doc, { PV3_CSS, PV3_FONT, PV3_PAGES, PV3_COMMON_PAGES } from '@/components/Pv3Doc';
import { computeStore, fallbackKwAi, fallbackStoreAi, PV3_DATA_VER, type KwData, type KwAi, type StoreData, type StoreAi } from '@/lib/proposalV3';
import { BRAND } from '@/lib/proposalDoc';
export const dynamic = 'force-dynamic';

// 키워드 데이터(상위 100 통째)는 크다 — 렌더 PC 가 업체마다 7장씩 열 때마다 DB 에서 새로 꺼내면 DB 가 버티지 못한다(2026-11-17 522 장애).
// 작은 '버전' 조회만 매번 하고, 버전이 같으면 3분간 메모리의 것을 쓴다. 데이터·AI 가 바뀌면 버전(ai_status·updated_at·ai_task_id)이 달라져 바로 새로 읽는다
type KwEnt = { ver: string; at: number; data: unknown; ai: unknown };
const G = globalThis as unknown as { __pv3Kw?: Map<string, KwEnt>; __pv3Kakao?: { at: number; v: string } };
const kwCache = (G.__pv3Kw ??= new Map<string, KwEnt>());
async function loadKw(sb: ReturnType<typeof supabaseAdmin>, keyword: string): Promise<{ data: unknown; ai: unknown } | null> {
  const { data: v } = await sb.from('pv3_keywords').select('ai_status,updated_at,ai_task_id').eq('keyword', keyword).maybeSingle(); if (!v) return null;
  const ver = `${v.ai_status}|${v.updated_at}|${v.ai_task_id}`; const hit = kwCache.get(keyword);
  if (hit && hit.ver === ver && Date.now() - hit.at < 180_000) return hit;
  const { data: kd } = await sb.from('pv3_keywords').select('data,ai').eq('keyword', keyword).maybeSingle(); if (!kd) return null;
  if (kwCache.size > 40) kwCache.clear();
  const ent = { ver, at: Date.now(), data: kd.data, ai: kd.ai }; kwCache.set(keyword, ent); return ent;
}
async function loadKakao(sb: ReturnType<typeof supabaseAdmin>): Promise<string> {
  if (G.__pv3Kakao && Date.now() - G.__pv3Kakao.at < 300_000) return G.__pv3Kakao.v;
  const { data: kk } = await sb.from('ai_settings').select('value').eq('key', 'kakao_open').maybeSingle();
  const v = String(kk?.value || ''); G.__pv3Kakao = { at: Date.now(), v }; return v;
}

export default async function Pv3View({ searchParams }: { searchParams: { kind?: string; ref?: string; page?: string; t?: string } }) {
  const okToken = !!process.env.CRON_SECRET && searchParams.t === process.env.CRON_SECRET;
  if (!okToken) { const me = await getProfile(); if (!me) return <div style={{ padding: 40 }}>권한 없음</div>; }
  const all = searchParams.page === 'all';   // 사람이 보는 미리보기 — 전체 장을 이어서
  const page = Math.min(PV3_PAGES, Math.max(1, Number(searchParams.page ?? 1) || 1)); const sb = supabaseAdmin();
  let k: KwData | null = null, ka: KwAi | null = null, s: StoreData | null = null, sa: StoreAi | null = null;
  if (searchParams.kind === 'store') {
    const { data: st } = await sb.from('pv3_stores').select('keyword,data,ai').eq('id', Number(searchParams.ref)).maybeSingle(); if (!st) return <div style={{ padding: 40 }}>업체 없음</div>;
    const kd = await loadKw(sb, st.keyword); if (!kd) return <div style={{ padding: 40 }}>키워드 없음</div>;
    k = kd.data as KwData; s = st.data as StoreData; ka = (kd.ai as KwAi) ?? fallbackKwAi(k, s); sa = (st.ai as StoreAi) ?? fallbackStoreAi(k, s);
  } else {
    const kd = await loadKw(sb, String(searchParams.ref ?? '')); if (!kd) return <div style={{ padding: 40 }}>키워드 없음</div>;
    k = kd.data as KwData; s = computeStore(k, { store: '귀사', rank: null, reviews: null, price: null }); ka = (kd.ai as KwAi) ?? fallbackKwAi(k, s); sa = fallbackStoreAi(k, s);
  }
  if (k.dv !== PV3_DATA_VER || (searchParams.kind === 'store' && s.dv !== PV3_DATA_VER)) return <div style={{ padding: 40 }}>예전 구조의 데이터입니다 — 제안서 화면에서 「다시 계산」 후 확인하세요. (키워드 {String(k.dv)} · 업체 {String(s.dv)} · 기준 {PV3_DATA_VER} · {searchParams.kind}/{String(searchParams.ref)} · 배포 {(process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)})</div>;
  const kakao = await loadKakao(sb);
  const brand = { name: BRAND.name, email: BRAND.email, kakao: kakao || 'https://open.kakao.com/o/saz4cuKi' };
  return <html lang="ko"><head><meta charSet="utf-8" />
    <link rel="stylesheet" href={PV3_FONT} />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap" />
    <style dangerouslySetInnerHTML={{ __html: PV3_CSS + `\nhtml,body{margin:0;background:#E9ECF3}#pv3-page{width:720px;margin:0 auto}` }} /></head>
    <body><div id="pv3-page">{all ? (searchParams.kind === 'store' ? Array.from({ length: PV3_PAGES }, (_, i) => i + 1) : PV3_COMMON_PAGES).map(n => <div key={n} style={{ marginBottom: 2 }}><Pv3Doc k={k!} ka={ka!} s={s!} sa={sa!} brand={brand} page={n} /></div>) : <Pv3Doc k={k} ka={ka} s={s} sa={sa} brand={brand} page={page} />}</div></body></html>;
}
