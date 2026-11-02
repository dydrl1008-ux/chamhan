'use server';
import { randomBytes } from 'crypto';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { search, searchFresh } from '@/lib/nsc';
import { buildDoc, BRAND, type Doc, type Target, type Brand } from '@/lib/proposalDoc';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
/** 내 연락처: profiles.phone 우선, 없으면 리포트 화면에서 저장한 번호 */
async function myPhone(uid: string): Promise<string> {
  const sb = supabaseServer();
  const [{ data: p }, { data: l }] = await Promise.all([sb.from('profiles').select('phone').eq('id', uid).maybeSingle(), sb.from('reward_watch_links').select('phone').eq('user_id', uid).maybeSingle()]);
  return (p as any)?.phone || l?.phone || '';
}
/** 제안서 화면에서 내 연락처 저장 */
export async function saveMyPhone(phone: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { error } = await supabaseServer().rpc('set_my_phone', { p_phone: phone.trim() });
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '연락처 저장' };
}
/** 생성 기록 (실패해도 무시) */
export async function logProposal(action: 'make' | 'pdf' | 'png' | 'link', keyword: string, target: string | null, code: string | null = null): Promise<void> {
  const me = await getProfile(); if (!me) return;
  await supabaseServer().from('proposal_logs').insert({ user_id: me.id, keyword, target, action, code });
}


/** 키워드 조회(nsc, 캐시 우선) → 제안서 데이터 + 대상 후보 목록 */
export async function loadKeyword(keyword: string): Promise<R<{ doc: Doc; candidates: Target[]; cached: boolean }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  try {
    const r = await searchFresh(keyword, me.id);
    const brand: Brand = { ...BRAND, owner: me.name, phone: await myPhone(me.id) };
    const doc = buildDoc(r, brand, null);
    await supabaseServer().from('proposal_logs').insert({ user_id: me.id, keyword: r.keyword, target: null, action: 'make' });
    const candidates: Target[] = r.products.filter(p => p.rank > 0).sort((a, b) => a.rank - b.rank).map(p => ({ rank: p.rank, mallName: p.mallName, title: p.productTitle, price: p.lowPrice, reviews: p.reviewCount, image: p.imageUrl ?? null, link: p.link, hit: p.hitStarScore || undefined, sale: p.saleStarScore || undefined, quality: p.qualityStarScore || undefined }));
    return { ok: true, msg: r.cached ? '오늘 조회한 결과 사용 (한도 안 씀)' : '새로 조회함 (오늘 순위·지수)', doc, candidates, cached: r.cached };
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

/** 콜 리스트에서 원클릭: 리드의 키워드·업체명·순위로 제안서 링크 바로 생성 (화면 안 거침) */
export async function quickLeadLink(leadId: number): Promise<R<{ code: string; url: string }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseServer();
  const { data: lead } = await sb.from('leads').select('id,store_name,keyword,rank_now,product_url').eq('id', leadId).maybeSingle();
  if (!lead) return { ok: false, msg: '리드를 찾을 수 없음' };
  if (!lead.keyword?.trim()) return { ok: false, msg: '키워드가 없는 리드' };
  try {
    const [r, phone] = await Promise.all([searchFresh(lead.keyword, me.id), myPhone(me.id)]);
    // 정확히 같은 상품만: 리드 상품 URL의 상품번호 == 시크릿 지수 nvmid / 링크의 상품번호
    const ids = (u: string | null | undefined) => { const out = new Set<string>(); for (const m of String(u || '').matchAll(/(?:products\/|nvMid=|nv_mid=|\/catalog\/|\/products\/)(\d{6,})/g)) out.add(m[1]); return out; };
    const want = ids(lead.product_url); const ps = r.products.filter(p => p.rank > 0);
    const hit = want.size ? ps.find(p => (p.nvmid && want.has(String(p.nvmid))) || [...ids(p.link)].some(x => want.has(x))) : undefined;
    const target: Target = hit ? { rank: hit.rank, mallName: hit.mallName, title: hit.productTitle, price: hit.lowPrice, reviews: hit.reviewCount, image: hit.imageUrl ?? null, link: hit.link, hit: hit.hitStarScore || undefined, sale: hit.saleStarScore || undefined, quality: hit.qualityStarScore || undefined }
      : { rank: lead.rank_now && lead.rank_now > 0 ? lead.rank_now : 101, mallName: lead.store_name, title: lead.store_name, price: 0, reviews: 0, image: null };
    if (!target.mallName?.trim()) target.mallName = lead.store_name;
    const doc = buildDoc(r, { ...BRAND, owner: me.name, phone }, target);
    const x = await makeNativeLink(doc, leadId);
    if (!x.ok) return x;
    return { ...x, msg: `${lead.store_name} 제안서 링크 생성${hit ? ` (${hit.rank}위 동일 상품 확인)` : ' (상위 100위 목록에 같은 상품 없음 — 업체명·순위만 반영)'} — 복사됨` };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
