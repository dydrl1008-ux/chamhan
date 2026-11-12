// 제안서 v3 — 키워드·업체 데이터 만들기, 워커(ai_tasks) 지시문, 결과 수거. 서버 전용
import { supabaseAdmin } from '@/lib/supabase/admin';
import { search } from '@/lib/nsc';
import { keywordVolumes, adConfigured } from '@/lib/naverAd';
import { computeKeyword, computeStore, fallbackKwAi, fallbackStoreAi, parseLoose, nounEnd, LEAK_LABEL, man, type KwData, type StoreData, type KwAi, type StoreAi } from '@/lib/proposalV3';

export const PV3_TITLE = '[제안서v3]';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
const sb = () => supabaseAdmin();

// ── 지식베이스에서 관련 지식 고르기 (태그·카테고리 매칭, 임베딩 없음) ──
const CAT_BY_LEAK: Record<string, string[]> = { exposure: ['shopping_rank', 'general'], trust: ['content', 'shopping_rank', 'general'], awareness: ['paid', 'influencer', 'brand', 'general'], defend: ['brand', 'shopping_rank', 'general'], conversion: ['content', 'brand', 'general'] };
async function pickKnowledge(keyword: string, leak: string, limit = 5) {
  const { data } = await sb().from('knowledge').select('id,title,summary,insights,tags,category').eq('status', 'done').limit(300);
  const cats = CAT_BY_LEAK[leak] ?? ['general']; const kwTok = keyword.replace(/\s+/g, '').toLowerCase();
  const scored = (data ?? []).map(k => { let s = 0; if (cats.includes(k.category)) s += cats.length - cats.indexOf(k.category); if ((k.tags ?? []).some((t: string) => kwTok.includes(t.toLowerCase()) || t.toLowerCase().includes(kwTok))) s += 3; return { ...k, s }; }).filter(k => k.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);
  const { data: pr } = await sb().from('principles').select('id,text,category').in('category', cats).order('weight', { ascending: false }).limit(8);
  const { data: st } = await sb().from('ai_settings').select('value').eq('key', 'style_ref').maybeSingle();
  return { knowledge: scored, principles: pr ?? [], style: st?.value ?? '' };
}

// ── 지시문 (짧게 — 상품명 때 교훈: 긴 규칙 X, 실데이터 + 출력 틀) ──
const RULES = `규칙
- 코드 실행·파일 작성 없이 글만. 순수 JSON 한 덩어리로만 답한다 (설명·코드펜스 금지). 값 안에 큰따옴표 금지.
- 모든 문장은 명사(체언)로 끝낸다. '~다/~습니다/~입니다/~요' 금지. 예: '리뷰는 쌓였는데 검색 초입에서 안 잡히는 상태'
- [실데이터]에 있는 숫자만 쓴다. 없는 값 추정·날조 금지. 평균값을 특정 경쟁사 수치처럼 쓰지 않는다.
- 매체명·슬롯명·작업 방식 세부 금지. 채널은 [무기] 이름 그대로만. 보장·단정·과장 금지 ('안전' 금지).
- AI 냄새 금지: 극대화·최적화·효과적으로·또한·뿐만 아니라·나아가·적극적으로. 짧은 문장과 긴 문장을 섞는다. 대표에게 보내는 컨설턴트 문어체.
- 리딩 무기·단계 배치는 [실데이터]의 plan 그대로. 바꾸지 말고 '왜 이 순서인지'만 이 상품 데이터로 쓴다.`;

export function kwInstruction(k: KwData, s: StoreData, kn: { knowledge: any[]; principles: any[]; style: string }, who: string) {
  const real = { keyword: k.keyword, volume: k.volume, top10: k.top10.map(t => ({ rank: t.rank, reviews: t.reviews, price: t.price, click: t.click })), stats: k.stats, contentMarket: k.contentMarket, revenue: { aov: k.revenue.aov, lossMonthly: Math.round(k.revenue.loss) }, sampleStore: { rank: s.rank, reviews: s.reviews, price: s.price, leak: LEAK_LABEL[s.leak], why: s.why, lead: s.lead, plan: s.plan, skip: s.skip } };
  const L: string[] = [];
  L.push(`「${k.keyword}」 광고 제안서의 키워드 공통 글을 JSON으로 써 주세요. (요청: ${who})`); L.push('');
  L.push(RULES); L.push('');
  L.push('[무기] 쇼핑 상위노출 · 자동완성·연관검색어 · 쇼핑검색광고(CPC) · 파워링크(CPC) · 쿠팡 유입 세팅 · 상품명·상세페이지 개선 · 맘카페 보장형 · 카페 배포 · 블로그 체험단·기자단 · 지식인 · 인스타 체험단·인플루언서 · 스레드 · 당근 · 유튜브 · 메타 광고 · AI 영상·숏폼 · 광고 소재 제작 · 상세페이지 카피'); L.push('');
  if (kn.knowledge.length) { L.push('[참고 지식 — 이 키워드에 실제로 해당되는 것만 논리로 녹이고, 안 맞으면 무시]'); kn.knowledge.forEach((x, i) => L.push(`${i + 1}. ${x.title}: ${x.summary} ${(x.insights ?? []).slice(0, 3).map((t: string) => '· ' + t).join(' ')}`)); L.push(''); }
  if (kn.principles.length) { L.push('[원칙]'); kn.principles.forEach(p => L.push('- ' + p.text)); L.push(''); }
  if (kn.style) { L.push('[문체 레퍼런스 — 이 톤을 따른다]'); L.push(kn.style.slice(0, 1200)); L.push(''); }
  L.push('[실데이터]'); L.push(JSON.stringify(real)); L.push('');
  L.push('[출력 JSON — 이 틀 그대로, 글자수는 안내]');
  L.push(JSON.stringify({ buyer: { who: '검색하는 사람·상황 (20자)', truth: '속으로 느끼는 욕구·불안 (45자)', moment: '구매를 결정짓는 순간 (40자)' }, reframe: { weak: '이 키워드 시장에서 흔한 약점 한 줄 (35자)', flip: '그 약점을 무기로 뒤집는 한 줄 (40자)' }, narrative: { diagnosis: '현황+그러나 (30자)', insight: '구매자 진실 (30자)', strategy: '그래서 가는 길 (30자)' }, stages: ['1단계 왜 이 무기부터인지 (60자)', '2단계 (60자)', '3단계 (60자)'], contents: [{ fmt: '형식 (카페 체험기/블로그 비교글/숏폼/당근 동네생활/상세페이지 카피/인스타 카드뉴스/지식인 Q&A 중 서로 다르게 5개)', idea: '이 키워드 상품만의 앵글 (40자)' }], skipWhy: ['안 쓰는 무기 1 이유 (40자)', '안 쓰는 무기 2 이유 (40자)'] }));
  return L.join('\n').slice(0, 9000);
}

export function storeBatchInstruction(k: KwData, rows: { id: number; s: StoreData }[], who: string) {
  const L: string[] = [];
  L.push(`「${k.keyword}」 제안서의 업체별 도입부 ${rows.length}개를 JSON 배열로 써 주세요. (요청: ${who})`); L.push('');
  L.push(RULES); L.push('- 업체마다 다른 문장. 업체명·순위·리뷰·가격을 인용해 다른 업체에 붙이면 말이 안 되는 문장으로. 업체명은 store 값 그대로.'); L.push('');
  L.push(`[키워드 공통] 월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 · 상위 10 평균가 ${k.stats.avgPrice10.toLocaleString('ko-KR')}원 · 상위 10 리뷰 중앙값 ${k.stats.medianReview10.toLocaleString('ko-KR')}개 · 상위 10 클릭지수 평균 ${k.stats.avgClick10}`); L.push('');
  L.push('[업체 실데이터]');
  rows.forEach(r => L.push(JSON.stringify({ id: r.id, store: r.s.store, rank: r.s.rank, reviews: r.s.reviews, price: r.s.price, leak: LEAK_LABEL[r.s.leak], why: r.s.why, lead: r.s.lead, gainMonthly: man(r.s.revenue.gain) })));
  L.push('');
  L.push('[출력 JSON — 배열, 업체 id 순서대로 전부]');
  L.push(JSON.stringify({ items: [{ id: 0, headline: '업체명 포함, 강점 인정 뒤 그러나로 꺾는 헤드라인 (40자, 명사 끝)', thesis: '제안서를 관통하는 한 줄 (32자, 명사 끝)', have: ['가진 것 1 (25자)', '가진 것 2', '가진 것 3'], leak: ['새는 곳 1 (25자)', '새는 곳 2', '새는 곳 3'] }] }));
  return L.join('\n').slice(0, 14000);
}

// ── 키워드 데이터 준비 (nsc 캐시 + 검색광고 API) + 워커 요청 ──
export async function ensureKeyword(keyword: string, me: { id: string; name: string }, force = false): Promise<R<{ k: KwData; fresh: boolean }>> {
  const kw = keyword.trim().replace(/\s+/g, ' '); if (!kw) return { ok: false, msg: '키워드 없음' };
  const db = sb();
  const { data: ex } = await db.from('pv3_keywords').select('keyword,data,ai,ai_status,updated_at').eq('keyword', kw).maybeSingle();
  const stale = !ex || force || Date.now() - new Date(ex.updated_at).getTime() > 24 * 3600e3;
  if (!stale) return { ok: true, msg: '캐시', k: ex!.data as KwData, fresh: false };
  let r; try { r = await search(kw, me.id); } catch (e: any) { return { ok: false, msg: `지수 조회 실패: ${e.message}` }; }
  let vols: any[] = []; if (adConfigured()) { try { vols = await keywordVolumes([kw]); } catch { /* 검색량 없이 진행 */ } }
  const k = computeKeyword(r, vols);
  await db.from('pv3_keywords').upsert({ keyword: kw, data: k, ai_status: ex?.ai ? ex.ai_status : 'none', updated_at: new Date().toISOString(), created_by: me.id }, { onConflict: 'keyword' });
  return { ok: true, msg: '계산', k, fresh: true };
}

/** 키워드 공통 글 워커 요청 (없거나 force 일 때). sample = 대표 업체 1곳(퍼널 판정 예시) */
export async function requestKwAi(kw: string, k: KwData, sample: StoreData, me: { id: string; name: string }, force = false): Promise<R<{ taskId?: number }>> {
  const db = sb();
  const { data: ex } = await db.from('pv3_keywords').select('ai_status,ai_task_id').eq('keyword', kw).maybeSingle();
  if (ex && !force && (ex.ai_status === 'queued' || ex.ai_status === 'done')) return { ok: true, msg: '이미 요청됨', taskId: ex.ai_task_id ?? undefined };
  const kn = await pickKnowledge(kw, sample.leak);
  const instruction = kwInstruction(k, sample, kn, me.name);
  const { data, error } = await db.from('ai_tasks').insert({ kind: 'order', agent: 'chief', title: `${PV3_TITLE} ${kw}`.slice(0, 80), instruction, source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' }).select('id').single();
  if (error) return { ok: false, msg: error.message };
  await db.from('pv3_keywords').update({ ai_task_id: data.id, ai_status: 'queued' }).eq('keyword', kw);
  return { ok: true, msg: `AI 작업 #${data.id}`, taskId: data.id };
}

/** 업체들 계산·저장 + 묶음 워커 요청 (40개씩) */
export async function ensureStores(kw: string, k: KwData, targets: { target_id: number | null; store: string; rank: number | null; reviews: number | null; price: number | null; link?: string }[], me: { id: string; name: string }): Promise<R<{ ids: number[]; queued: number }>> {
  const db = sb(); const ids: number[] = []; const fresh: { id: number; s: StoreData }[] = [];
  for (const t of targets) {
    const s = computeStore(k, { store: t.store, rank: t.rank, reviews: t.reviews, price: t.price, link: t.link });
    if (t.target_id) {
      const { data: ex } = await db.from('pv3_stores').select('id,ai,created_at').eq('keyword', kw).eq('target_id', t.target_id).maybeSingle();
      if (ex && Date.now() - new Date(ex.created_at).getTime() < 7 * 86400e3) { await db.from('pv3_stores').update({ data: s }).eq('id', ex.id); ids.push(ex.id); if (!ex.ai) fresh.push({ id: ex.id, s }); continue; }
      if (ex) await db.from('pv3_stores').delete().eq('id', ex.id);
    }
    const { data: ins } = await db.from('pv3_stores').insert({ keyword: kw, target_id: t.target_id, store_name: t.store, data: s }).select('id').single();
    if (ins) { ids.push(ins.id); fresh.push({ id: ins.id, s }); }
  }
  let queued = 0;
  for (let i = 0; i < fresh.length; i += 40) {
    const batch = fresh.slice(i, i + 40);
    const { data, error } = await db.from('ai_tasks').insert({ kind: 'order', agent: 'chief', title: `${PV3_TITLE} ${kw} 업체 ${batch.length}곳`.slice(0, 80), instruction: storeBatchInstruction(k, batch, me.name), source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' }).select('id').single();
    if (!error && data) { await db.from('pv3_stores').update({ ai_task_id: data.id }).in('id', batch.map(b => b.id)); queued += batch.length; }
  }
  return { ok: true, msg: `업체 ${ids.length}곳 · AI 요청 ${queued}곳`, ids, queued };
}

// ── 워커 결과 수거 (화면 열 때·크론에서 호출) ──
const fixNoun = (s: string) => String(s || '').trim().replace(/[.。]\s*$/, '');   // 끝 마침표만 정리 (명사 종결은 워커 규칙·폴백으로)
export async function ingestAi(): Promise<{ kw: number; stores: number }> {
  const db = sb(); let kwN = 0, stN = 0;
  const { data: ks } = await db.from('pv3_keywords').select('keyword,data,ai_task_id').eq('ai_status', 'queued').not('ai_task_id', 'is', null).limit(50);
  for (const k of ks ?? []) {
    const { data: t } = await db.from('ai_tasks').select('status,result').eq('id', k.ai_task_id).maybeSingle(); if (!t) continue;
    if (t.status === 'done') {
      const j = parseLoose(t.result);
      if (j?.buyer && j?.stages) { const ai: KwAi = { buyer: j.buyer, reframe: j.reframe ?? { weak: '', flip: '' }, narrative: j.narrative ?? { diagnosis: '', insight: '', strategy: '' }, stages: (j.stages ?? []).map(fixNoun), contents: (j.contents ?? []).slice(0, 5), skipWhy: j.skipWhy ?? [] }; await db.from('pv3_keywords').update({ ai, ai_status: 'done' }).eq('keyword', k.keyword); kwN++; }
      else { await db.from('pv3_keywords').update({ ai: fallbackKwAi(k.data as KwData), ai_status: 'fallback' }).eq('keyword', k.keyword); kwN++; }
    } else if (['failed', 'rejected', 'cancelled'].includes(t.status)) { await db.from('pv3_keywords').update({ ai: fallbackKwAi(k.data as KwData), ai_status: 'fallback' }).eq('keyword', k.keyword); kwN++; }
  }
  const { data: ss } = await db.from('pv3_stores').select('id,keyword,data,ai_task_id').is('ai', null).not('ai_task_id', 'is', null).limit(400);
  const byTask = new Map<number, any[]>(); (ss ?? []).forEach(s => { const a = byTask.get(s.ai_task_id) ?? []; a.push(s); byTask.set(s.ai_task_id, a); });
  for (const [taskId, rows] of byTask) {
    const { data: t } = await db.from('ai_tasks').select('status,result').eq('id', taskId).maybeSingle(); if (!t) continue;
    const { data: kd } = await db.from('pv3_keywords').select('data').eq('keyword', rows[0].keyword).maybeSingle(); const k = kd?.data as KwData | undefined; if (!k) continue;
    let items: any[] | null = null;
    if (t.status === 'done') { const j = parseLoose(t.result); items = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : null; }
    else if (!['failed', 'rejected', 'cancelled'].includes(t.status)) continue;
    for (const s of rows) {
      const it = items?.find(x => Number(x.id) === s.id);
      const ai: StoreAi = it?.headline ? { headline: fixNoun(it.headline), thesis: fixNoun(it.thesis ?? ''), have: (it.have ?? []).slice(0, 3), leak: (it.leak ?? []).slice(0, 3) } : fallbackStoreAi(k, s.data as StoreData);
      await db.from('pv3_stores').update({ ai }).eq('id', s.id); stN++;
    }
  }
  return { kw: kwN, stores: stN };
}

/** 렌더 작업 등록 (키워드 공통 7장 / 업체 2장) */
export async function queueRender(kind: 'keyword' | 'store', ref: string) {
  const db = sb();
  const { data: ex } = await db.from('pv3_render_jobs').select('id').eq('kind', kind).eq('ref', ref).in('status', ['queued', 'running']).maybeSingle();
  if (ex) return ex.id;
  const { data } = await db.from('pv3_render_jobs').insert({ kind, ref }).select('id').single(); return data?.id;
}
export { nounEnd };
