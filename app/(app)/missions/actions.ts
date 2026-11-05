'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { searchFresh } from '@/lib/nsc';
import { addWatch, ykrReady } from '@/lib/ykreward';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;

const norm = (s: string) => s.toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
const tokens = (s: string) => [...new Set(s.toLowerCase().split(/[^가-힣a-z0-9]+/).filter(t => t.length >= 2))];

/** 시크릿 지수로 미션 상품 매칭 — 키워드 상위 100개 제목과 OCR 상품명 토큰 겹침으로 */
export async function matchMission(id: number): Promise<R<{ mall: string; rank: number | null }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin();
  const { data: m } = await sb.from('competitor_missions').select('id,keyword,product,kind,rank_first').eq('id', id).maybeSingle();
  if (!m) return { ok: false, msg: '없음' }; if (m.kind !== 'nshop') return { ok: false, msg: '쇼핑 미션만 매칭' };
  try {
    const r = await searchFresh(m.keyword, me.id);
    const toks = tokens(m.product); const pn = norm(m.product);
    let best: any = null, bestScore = 0;
    for (const p of r.products) {
      if (!(p.rank > 0)) continue;
      const tn = norm(p.productTitle);
      let sc = toks.filter(t => tn.includes(norm(t))).length;
      if (pn && (tn.includes(pn.slice(0, 12)) || pn.includes(tn.slice(0, 12)))) sc += 3;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    const need = Math.max(2, Math.ceil(toks.length * 0.4));
    if (!best || bestScore < need) { await sb.from('competitor_missions').update({ matched_at: new Date().toISOString(), match_score: bestScore, note: '상위 100개에 없음' }).eq('id', id); revalidatePath('/missions'); return { ok: true, msg: `'${m.keyword}' 상위 100개에 비슷한 상품 없음 (100위 밖)`, mall: '', rank: null }; }
    await sb.from('competitor_missions').update({ matched_at: new Date().toISOString(), mall_name: best.mallName || '', product_title: best.productTitle || '', product_url: best.link || '', nvmid: String(best.nvmid ?? ''), rank_first: m.rank_first ?? best.rank, rank_now: best.rank, rank_at: new Date().toISOString(), match_score: bestScore, note: '' }).eq('id', id);
    revalidatePath('/missions');
    return { ok: true, msg: `${best.mallName} · ${best.rank}위`, mall: best.mallName, rank: best.rank };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}

/** 미매칭 쇼핑 미션 n개 일괄 매칭 (시크릿 지수 조회 한도 안에서) */
export async function matchMany(n = 20): Promise<R<{ done: number }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data: rows } = await supabaseAdmin().from('competitor_missions').select('id').eq('kind', 'nshop').is('matched_at', null).order('last_seen', { ascending: false }).limit(Math.min(50, n));
  let done = 0; for (const r of rows ?? []) { const x = await matchMission(r.id); if (!x.ok) return { ok: false, msg: `${done}개 후 중단: ${x.msg}`, done }; done++; }
  revalidatePath('/missions'); return { ok: true, msg: `${done}개 매칭`, done };
}

/** 순위 체크(ykreward rank_watch)에 등록 — 그룹명 = 스토어명 */
export async function watchMission(id: number): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseServer();
  const { data: m } = await supabaseAdmin().from('competitor_missions').select('keyword,mall_name,product_url').eq('id', id).maybeSingle();
  if (!m?.product_url) return { ok: false, msg: '먼저 매칭해서 상품 URL을 잡아야 함' };
  const { data: link } = await sb.from('reward_watch_links').select('login_id').eq('user_id', me.id).maybeSingle();
  if (!link?.login_id) return { ok: false, msg: '순위 체크 메뉴에서 내 ykreward 계정을 먼저 연결하세요' };
  if (!ykrReady()) return { ok: false, msg: 'ykreward 연동 설정이 없습니다' };
  const group = `[경쟁] ${m.mall_name || m.keyword}`;
  const r = await addWatch({ ownerLogin: link.login_id, url: m.product_url, keywords: [m.keyword], group, memo: '경쟁사 미션' });
  if (!r.ok) return { ok: false, msg: r.msg };
  await sb.from('reward_watch_groups').upsert({ user_id: me.id, name: group, memo: '경쟁사 리워드 미션' }, { onConflict: 'user_id,name' });
  return { ok: true, msg: `순위 체크 「${group}」 등록` };
}
