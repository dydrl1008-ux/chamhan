'use server';
import { randomBytes } from 'crypto';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { search } from '@/lib/nsc';
import { buildDoc, BRAND, type Doc, type Target, type Brand } from '@/lib/proposalDoc';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
/** 생성 기록 (실패해도 무시) */
export async function logProposal(action: 'make' | 'pdf' | 'png' | 'link', keyword: string, target: string | null, code: string | null = null): Promise<void> {
  const me = await getProfile(); if (!me) return;
  await supabaseServer().from('proposal_logs').insert({ user_id: me.id, keyword, target, action, code });
}


/** 키워드 조회(nsc, 캐시 우선) → 제안서 데이터 + 대상 후보 목록 */
export async function loadKeyword(keyword: string): Promise<R<{ doc: Doc; candidates: Target[]; cached: boolean }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try {
    const r = await search(keyword, me.id, false);
    const { data: link } = await supabaseServer().from('reward_watch_links').select('phone').eq('user_id', me.id).maybeSingle();
    const brand: Brand = { ...BRAND, owner: me.name, phone: link?.phone || '' };
    const doc = buildDoc(r, brand, null);
    await supabaseServer().from('proposal_logs').insert({ user_id: me.id, keyword: r.keyword, target: null, action: 'make' });
    const candidates: Target[] = r.products.filter(p => p.rank > 0).sort((a, b) => a.rank - b.rank).map(p => ({ rank: p.rank, mallName: p.mallName, title: p.productTitle, price: p.lowPrice, reviews: p.reviewCount, image: p.imageUrl ?? null, link: p.link, hit: p.hitStarScore || undefined, sale: p.saleStarScore || undefined, quality: p.qualityStarScore || undefined }));
    return { ok: true, msg: r.cached ? '캐시된 결과 (조회 한도 안 씀)' : '새로 조회함', doc, candidates, cached: r.cached };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
/** 대상 업체를 넣어 문서 다시 계산 (조회 없음 — 캐시에서) */
export async function withTarget(keyword: string, target: Target | null, owner: string, phone: string, offer: { basic: string; rec: string } = { basic: '', rec: '' }): Promise<R<{ doc: Doc }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try { const r = await search(keyword, me.id, false); return { ok: true, msg: '', doc: buildDoc(r, { ...BRAND, owner: owner.trim() || me.name, phone: phone.trim() }, target, { basic: offer.basic.trim().slice(0, 40), rec: offer.rec.trim().slice(0, 40) }) }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
/** /p/코드 — 워크허브 안에서 그려지는 제안서 링크 (goat 주소 없음) */
export async function makeNativeLink(doc: Doc, leadId: number | null = null): Promise<R<{ code: string; url: string }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const code = randomBytes(6).toString('base64url').slice(0, 8);
  const title = `${doc.target?.mallName?.trim() ? doc.target.mallName.trim() + ' · ' : ''}${doc.keyword} 상위노출 제안서`;
  const { error } = await supabaseServer().from('proposals').insert({ code, lead_id: leadId, title, target_url: '', kind: 'native', data: doc, owner_id: me.id });
  if (error) return { ok: false, msg: error.message };
  await supabaseServer().from('proposal_logs').insert({ user_id: me.id, keyword: doc.keyword, target: doc.target?.mallName ?? null, action: 'link', code });
  const base = (process.env.NEXT_PUBLIC_PROPOSAL_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://chamhan.vercel.app').replace(/\/$/, '');   // 제안서 링크 전용 도메인(중립) 우선
  return { ok: true, msg: '링크 생성 — 열람하면 알림이 옵니다', code, url: `${base}/p/${code}` };
}
