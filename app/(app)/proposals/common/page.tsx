// 맞춤 제안서 공용판 — 업체 이름 없이 키워드 한 통을 여러 업체에 보낼 때 (9장 · 브라우저에서 바로 이미지 저장)
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ensureKeyword, requestKwAi, ingestAi } from '@/lib/pv3Tasks';
import { fallbackKwAi, type KwAi } from '@/lib/proposalV3';
import { BRAND } from '@/lib/proposalDoc';
import CommonClient from './CommonClient';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;

export default async function Page({ searchParams }: { searchParams: { kw?: string } }) {
  const me = await getProfile(); if (!me) redirect('/login');
  const kw = String(searchParams.kw ?? '').trim().replace(/\s+/g, ' ');
  if (!kw) return <div className="card" style={{ padding: 20 }}>키워드가 없습니다 — 「키워드 제안서」 화면에서 키워드를 조회한 뒤 「맞춤 제안서 공용판」을 눌러 주세요.</div>;
  const ek = await ensureKeyword(kw, me);
  if (!ek.ok || !ek.k) return <div className="card" style={{ padding: 20 }}>「{kw}」 제안서를 만들지 못했습니다 — {ek.msg}</div>;
  await requestKwAi(kw, ek.k, me, ek.fresh);   // 시장·구매자 글은 워커가 쓰고, 그 전에는 기본 문장으로 보여 준다
  try { await ingestAi(); } catch { /* 수거 실패는 무시 — 기본 문장으로 표시 */ }
  const { data: kd } = await supabaseAdmin().from('pv3_keywords').select('ai,ai_status').eq('keyword', kw).maybeSingle();
  const worker = kd?.ai_status === 'done' && !!kd.ai;
  const ka = (worker ? kd!.ai : fallbackKwAi(ek.k)) as KwAi;
  return <CommonClient k={ek.k} ka={ka} worker={worker} brand={{ name: BRAND.name, email: BRAND.email, kakao: '' }} />;
}
