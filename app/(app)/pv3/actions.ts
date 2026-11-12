'use server';
// 제안서 v3 관리 — 키워드 만들기(계산+업체+워커 요청), 결과 수거, 렌더 요청, 설정, 지식베이스. 총괄·대표
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { settings, eligible, type Candidate } from '@/lib/mailSend';
import { ensureKeyword, ensureStores, requestKwAi, ingestAi, queueRender } from '@/lib/pv3Tasks';
import { computeStore, parseLoose, type KwData, type StoreData } from '@/lib/proposalV3';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
const lead = (me: { role: string }) => me.role === 'admin' || me.role === 'head';

export type KwRow = { keyword: string; updated_at: string; ai_status: string; ai_task_id: number | null; images: any[]; stores: number; storesAi: number; storesImg: number; volume: number; leak: string };
export async function listKw(): Promise<R<{ rows: KwRow[] }>> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const sb = supabaseAdmin();
  const { data: ks } = await sb.from('pv3_keywords').select('keyword,updated_at,ai_status,ai_task_id,images,data').order('updated_at', { ascending: false }).limit(100);
  const { data: ss } = await sb.from('pv3_stores').select('keyword,ai,images');
  const rows: KwRow[] = (ks ?? []).map(k => { const st = (ss ?? []).filter(s => s.keyword === k.keyword); const d = k.data as KwData; return { keyword: k.keyword, updated_at: k.updated_at, ai_status: k.ai_status, ai_task_id: k.ai_task_id, images: k.images ?? [], stores: st.length, storesAi: st.filter(s => s.ai).length, storesImg: st.filter(s => (s.images ?? []).length >= 4).length, volume: d?.volume?.group ?? 0, leak: d?.kwLeak ?? '' }; });
  return { ok: true, msg: '', rows };
}

/** 키워드 1개: 지수·검색량 계산 → 메일 대상 중 보낼 수 있는 업체 n곳 계산·저장 → 워커에 키워드 글 + 업체 묶음 요청 */
export async function buildKeyword(keyword: string, n: number, force = false): Promise<R<{ stores: number }>> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const kw = keyword.trim(); if (!kw) return { ok: false, msg: '키워드' };
  const ek = await ensureKeyword(kw, me, force); if (!ek.ok || !ek.k) return { ok: false, msg: ek.msg };
  const k = ek.k; const sb = supabaseAdmin(); const { days } = await settings();
  const { data: cand, error } = await sb.rpc('mail_candidates_json', { p_keyword: kw, p_days: days }); if (error) return { ok: false, msg: error.message };
  const picks = ((cand ?? []) as Candidate[]).filter(eligible).slice(0, Math.max(0, Math.min(300, n)));
  // 상위 100 안에 있으면 지수 데이터에서 리뷰·가격·클릭 보강
  const { data: nsc } = await sb.from('nsc_searches').select('data').eq('keyword', kw).maybeSingle();
  const prods: any[] = (nsc?.data as any)?.products ?? [];
  const targets = picks.map(c => { const p = c.rank_now ? prods.find(x => Number(x.rank) === c.rank_now) : null; return { target_id: c.id, store: c.store_name || '귀사', rank: c.rank_now, reviews: c.review_cnt ?? (p ? Number(p.reviewCount) : null), price: p ? Number(p.lowPrice) || null : null, link: c.store_url }; });
  const es = targets.length ? await ensureStores(kw, k, targets, me) : { ok: true, msg: '업체 없음', ids: [] as number[], queued: 0 };
  const sample = targets.length ? computeStore(k, { store: targets[0].store, rank: targets[0].rank, reviews: targets[0].reviews, price: targets[0].price }) : computeStore(k, { store: '귀사', rank: null, reviews: null, price: null });
  const ra = await requestKwAi(kw, k, sample, me, force || ek.fresh);
  revalidatePath('/pv3');
  return { ok: true, msg: `「${kw}」 ${ek.msg} · ${es.msg} · 키워드 글 ${ra.msg}`, stores: es.ids?.length ?? 0 };
}

/** 워커 결과 수거 + 글 끝난 것 렌더 큐에 */
export async function collect(): Promise<R<{ kw: number; stores: number; renders: number }>> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const r = await ingestAi(); const sb = supabaseAdmin(); let renders = 0;
  const { data: ks } = await sb.from('pv3_keywords').select('keyword,ai_status,images').in('ai_status', ['done', 'fallback']);
  for (const k of ks ?? []) {
    if ((k.images ?? []).length < 4) { await queueRender('keyword', k.keyword); renders++; }
    const { data: ss } = await sb.from('pv3_stores').select('id,images').eq('keyword', k.keyword).not('ai', 'is', null);
    for (const s of ss ?? []) if ((s.images ?? []).length < 4) { await queueRender('store', String(s.id)); renders++; }
  }
  revalidatePath('/pv3');
  return { ok: true, msg: `수거 — 키워드 글 ${r.kw} · 업체 글 ${r.stores} · 렌더 요청 ${renders}`, ...r, renders };
}
/** 강제 다시 렌더 (글 고친 뒤) */
export async function rerender(keyword: string): Promise<R> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const sb = supabaseAdmin(); await sb.from('pv3_keywords').update({ images: [] }).eq('keyword', keyword); await queueRender('keyword', keyword);
  const { data: ss } = await sb.from('pv3_stores').select('id').eq('keyword', keyword); for (const s of ss ?? []) { await sb.from('pv3_stores').update({ images: [] }).eq('id', s.id); await queueRender('store', String(s.id)); }
  revalidatePath('/pv3'); return { ok: true, msg: `렌더 다시 요청 — 키워드 + 업체 ${ss?.length ?? 0}곳` };
}
export async function storesOf(keyword: string): Promise<R<{ rows: { id: number; store_name: string; leak: string; rank: number | null; ai: boolean; images: number; headline: string }[] }>> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const { data } = await supabaseAdmin().from('pv3_stores').select('id,store_name,data,ai,images').eq('keyword', keyword).order('id').limit(300);
  return { ok: true, msg: '', rows: (data ?? []).map(s => ({ id: s.id, store_name: s.store_name, leak: (s.data as StoreData)?.leak ?? '', rank: (s.data as StoreData)?.rank ?? null, ai: !!s.ai, images: (s.images ?? []).length, headline: (s.ai as any)?.headline ?? '' })) };
}
export async function removeKw(keyword: string): Promise<R> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const { error } = await supabaseAdmin().from('pv3_keywords').delete().eq('keyword', keyword); revalidatePath('/pv3');
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '삭제' };
}

// ── 설정 (오픈채팅 · 문체 레퍼런스) ──
export async function getSettings(): Promise<R<{ kakao: string; style: string }>> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const { data } = await supabaseAdmin().from('ai_settings').select('key,value').in('key', ['kakao_open', 'style_ref']);
  const g = (k: string) => (data ?? []).find(x => x.key === k)?.value ?? '';
  return { ok: true, msg: '', kakao: g('kakao_open'), style: g('style_ref') };
}
export async function saveSetting(key: 'kakao_open' | 'style_ref', value: string): Promise<R> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const { error } = await supabaseAdmin().from('ai_settings').upsert({ key, value: value.slice(0, 4000), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '저장' };
}

// ── 지식베이스 ──
export type KnRow = { id: number; title: string; source_url: string | null; summary: string; insights: string[]; tags: string[]; category: string; status: string; created_at: string };
export async function listKnowledge(): Promise<R<{ rows: KnRow[]; principles: { id: number; text: string; category: string }[] }>> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const sb = supabaseAdmin();
  const { data } = await sb.from('knowledge').select('id,title,source_url,summary,insights,tags,category,status,created_at').order('created_at', { ascending: false }).limit(200);
  const { data: pr } = await sb.from('principles').select('id,text,category').order('weight', { ascending: false }).limit(100);
  return { ok: true, msg: '', rows: (data ?? []) as KnRow[], principles: pr ?? [] };
}
/** 글 넣기 → 워커가 요약·인사이트·태그·카테고리 뽑음 */
export async function addKnowledge(title: string, url: string, raw: string): Promise<R<{ id: number }>> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const text = raw.trim(); if (text.length < 80) return { ok: false, msg: '본문을 80자 이상 붙여 넣으세요 (URL만으로는 워커가 못 읽음)' };
  const sb = supabaseAdmin();
  const { data: kn, error } = await sb.from('knowledge').insert({ title: title.trim().slice(0, 120) || text.slice(0, 40), source_url: url.trim() || null, raw: text.slice(0, 20000), created_by: me.id }).select('id').single();
  if (error || !kn) return { ok: false, msg: error?.message ?? '저장 실패' };
  const instruction = [`아래 마케팅 글을 제안서 작성에 쓸 지식으로 정리해 주세요. 코드 실행·파일 작성 없이 순수 JSON 한 덩어리로만. (요청: ${me.name})`, '',
    '출력: {"summary":"3문장 요약","insights":["실무에 바로 쓰는 인사이트 3~6개 (각 60자 내)"],"tags":["키워드·업종 태그 3~8개"],"category":"shopping_rank|content|influencer|paid|brand|general 중 1개"}', '',
    '[글]', text.slice(0, 9000)].join('\n');
  const { data: t } = await sb.from('ai_tasks').insert({ kind: 'order', agent: 'chief', title: `[지식] ${title.trim().slice(0, 60) || text.slice(0, 30)}`, instruction, source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' }).select('id').single();
  if (t) await sb.from('knowledge').update({ ai_task_id: t.id }).eq('id', kn.id);
  revalidatePath('/pv3'); return { ok: true, msg: `지식 #${kn.id} 등록 · 워커 정리 중`, id: kn.id };
}
export async function collectKnowledge(): Promise<R<{ n: number }>> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const sb = supabaseAdmin(); let n = 0;
  const { data: rows } = await sb.from('knowledge').select('id,ai_task_id').eq('status', 'queued').not('ai_task_id', 'is', null);
  for (const r of rows ?? []) {
    const { data: t } = await sb.from('ai_tasks').select('status,result').eq('id', r.ai_task_id).maybeSingle(); if (!t) continue;
    if (t.status === 'done') { const j = parseLoose(t.result); if (j?.summary) { await sb.from('knowledge').update({ summary: String(j.summary).slice(0, 1000), insights: (j.insights ?? []).slice(0, 8), tags: (j.tags ?? []).slice(0, 10).map((x: any) => String(x)), category: ['shopping_rank', 'content', 'influencer', 'paid', 'brand', 'general'].includes(j.category) ? j.category : 'general', status: 'done' }).eq('id', r.id); n++; } else { await sb.from('knowledge').update({ status: 'failed' }).eq('id', r.id); } }
    else if (['failed', 'rejected', 'cancelled'].includes(t.status)) await sb.from('knowledge').update({ status: 'failed' }).eq('id', r.id);
  }
  // 원칙 증류 결과 수거
  const { data: pt } = await sb.from('ai_settings').select('value').eq('key', 'principles_task').maybeSingle();
  if (pt?.value) { const { data: t } = await sb.from('ai_tasks').select('status,result').eq('id', Number(pt.value)).maybeSingle(); if (t?.status === 'done') { const j = parseLoose(t.result); const list: any[] = j?.principles ?? []; if (list.length) { await sb.from('principles').delete().gte('id', 0); await sb.from('principles').insert(list.slice(0, 40).map((p: any) => ({ text: String(p.text ?? p).slice(0, 300), category: ['shopping_rank', 'content', 'influencer', 'paid', 'brand', 'general'].includes(p.category) ? p.category : 'general', weight: Number(p.weight) || 1 }))); n += list.length; } await sb.from('ai_settings').delete().eq('key', 'principles_task'); } }
  revalidatePath('/pv3'); return { ok: true, msg: `정리 ${n}건 반영`, n };
}
export async function distillPrinciples(): Promise<R> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const sb = supabaseAdmin(); const { data } = await sb.from('knowledge').select('title,summary,insights,category').eq('status', 'done').limit(80);
  if (!data?.length) return { ok: false, msg: '정리된 지식이 없습니다' };
  const instruction = [`아래 지식 ${data.length}건에서 제안서 작성에 쓸 '원칙' 20~30개를 뽑아 주세요. 코드 실행 없이 순수 JSON. (요청: ${me.name})`, '', '출력: {"principles":[{"text":"원칙 한 줄 (80자 내, 명사 종결)","category":"shopping_rank|content|influencer|paid|brand|general","weight":1~5}]}', '', '[지식]', ...data.map((k, i) => `${i + 1}. [${k.category}] ${k.title}: ${k.summary} ${(k.insights ?? []).join(' · ')}`)].join('\n').slice(0, 14000);
  const { data: t, error } = await sb.from('ai_tasks').insert({ kind: 'order', agent: 'chief', title: '[지식] 원칙 증류', instruction, source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' }).select('id').single();
  if (error || !t) return { ok: false, msg: error?.message ?? '실패' };
  await sb.from('ai_settings').upsert({ key: 'principles_task', value: String(t.id), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return { ok: true, msg: `원칙 증류 요청 #${t.id} — 끝나면 「수거」` };
}
export async function removeKnowledge(id: number): Promise<R> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  await supabaseAdmin().from('knowledge').delete().eq('id', id); revalidatePath('/pv3'); return { ok: true, msg: '삭제' };
}

/** 메일 대상 있는 키워드 전부(이메일 업체 많은 순) × 업체 n곳 — 한 번에 워커 큐에. 전날 저녁에 눌러두면 아침엔 준비 끝 */
export async function prepareAll(n: number, maxKw = 60): Promise<R<{ kws: number; stores: number; skipped: string[] }>> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const sb = supabaseAdmin();
  const { data: kws, error } = await sb.rpc('mail_keywords_json'); if (error) return { ok: false, msg: error.message };
  const list = ((kws ?? []) as { keyword: string; n: number }[]).sort((a, b) => b.n - a.n).slice(0, Math.max(1, Math.min(200, maxKw)));
  let kwN = 0, stN = 0; const skipped: string[] = [];
  for (const k of list) {
    const { data: ex } = await sb.from('pv3_keywords').select('ai_status,images,updated_at').eq('keyword', k.keyword).maybeSingle();
    if (ex && ['queued', 'done', 'fallback'].includes(ex.ai_status) && Date.now() - new Date(ex.updated_at).getTime() < 24 * 3600e3) {
      // 키워드는 있음 → 업체만 보충
      const { count } = await sb.from('pv3_stores').select('id', { count: 'exact', head: true }).eq('keyword', k.keyword);
      if ((count ?? 0) >= n) continue;
    }
    const r = await buildKeyword(k.keyword, n); if (r.ok) { kwN++; stN += r.stores ?? 0; } else skipped.push(`${k.keyword}: ${r.msg}`);
  }
  revalidatePath('/pv3');
  return { ok: true, msg: `키워드 ${kwN}개 · 업체 ${stN}곳 워커 큐에 올림${skipped.length ? ` · 건너뜀 ${skipped.length}` : ''} — 워커·렌더는 자동, 수거는 렌더 스크립트가 2분마다`, kws: kwN, stores: stN, skipped };
}
