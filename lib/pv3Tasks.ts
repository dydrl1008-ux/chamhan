// 제안서 v3 — 키워드·업체 데이터 만들기, 워커(ai_tasks) 지시문, 결과 수거. 서버 전용
import { supabaseAdmin } from '@/lib/supabase/admin';
import { search } from '@/lib/nsc';
import { keywordVolumes, adConfigured } from '@/lib/naverAd';
import { computeKeyword, computeStore, matchProduct, fallbackKwAi, fallbackStoreAi, fallbackStages, parseLoose, nounEnd, hasPages, LEAK_LABEL, AXIS_LABEL, PV3_AI_VER, PV3_DATA_VER, PV3_STORE_PAGES, PV3_COMMON_PAGES, type KwData, type StoreData, type KwAi, type StoreAi } from '@/lib/proposalV3';
import type { Product } from '@/lib/nsc';

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

// ── 지시문 (짧게 — 긴 규칙 X, 실데이터 + 출력 틀) ──
const RULES = `규칙
- 코드 실행·파일 작성 없이 글만. 순수 JSON 한 덩어리로만 답한다 (설명·코드펜스 금지). 값 안에 큰따옴표 금지.
- 문체 두 가지를 구분한다. ① 제목류(틀에 '명사 끝'이라고 적힌 칸)는 명사로 끝낸다 — 예: '리뷰는 쌓였는데 검색 초입에서 안 잡히는 상태'. ② 설명류(틀에 '존댓말'이라고 적힌 칸)는 '~습니다/~입니다'로 끝나는 정중한 문장으로 쓴다. 반말·'~다' 평서체 금지.
- [실데이터]에 있는 숫자만 쓴다. 없는 값 추정·날조 금지. 평균값을 특정 경쟁 상품의 수치처럼 쓰지 않는다. 매출 금액은 쓰지 않는다(시스템이 따로 표시).
- 매체명·상품(슬롯)명·작업 수량·작업 방식 세부 금지. 광고 채널은 [실데이터]에 적힌 이름 그대로만 쓴다. 보장·단정·과장 금지 ('무조건' '확실' '100%' '안전' 금지). 수수료·대행 비용 언급 금지.
- AI 말투 금지: 극대화·최적화·효과적으로·또한·뿐만 아니라·나아가·적극적으로. 짧은 문장과 긴 문장을 섞는다. 셀러(스토어 대표)가 읽고 바로 이해하는 쉬운 말로 쓴다. 업계 은어(구동·슬롯·트래픽·어뷰징) 금지.
- 어법: 조사(은/는·이/가·을/를·과/와·으로/로)는 앞말의 받침에 맞춘다. 문장마다 주어와 서술어가 맞는지 확인한다. 한 문장에는 한 가지 내용만 담고 쉼표는 2개까지. 번역투(~에 있어서, ~을 통해, ~함에 따라, ~로 인해, ~것으로 보입니다) 금지. 명사를 4개 이상 잇달아 붙이지 않는다. 같은 어미로 끝나는 문장을 3번 연달아 쓰지 않는다. 다 쓴 뒤 소리 내어 읽듯 한 번 더 읽고 어색한 문장을 고친다.`;

/** 키워드 공통 글 (시장·사는 사람·콘텐츠) — 특정 업체 얘기는 넣지 않는다 */
export function kwInstruction(k: KwData, kn: { knowledge: any[]; principles: any[]; style: string }, who: string) {
  const real = { keyword: k.keyword, monthlySearch: k.volume.group, mainSearch: k.volume.main, related: k.volume.related, adCompetition: k.volume.comp || undefined, top10: k.top10.map(t => ({ rank: t.rank, title: t.title.slice(0, 44), reviews: t.reviews, price: t.price, click: t.click, ad: t.ad || undefined })), top10Avg: { price: k.stats.avgPrice10, medianReview: k.stats.medianReview10, click: k.stats.avgClick10 }, rank11to40AvgClick: k.stats.avgClickMid, newIn90daysPct: k.stats.newRate, contentMarket: k.contentMarket };
  const L: string[] = [];
  L.push(`네이버쇼핑 키워드 「${k.keyword}」 광고 제안서에 들어갈 '키워드 공통' 글을 JSON으로 써 주세요. 이 키워드를 파는 여러 스토어에 공통으로 보여 줄 내용이라, 특정 업체 이야기는 넣지 않습니다. (요청: ${who})`); L.push('');
  L.push(RULES); L.push('- 상위 10개 상품명(title)에서 이 상품군의 특징(소재·용량·용도·타깃)을 읽고, 그 상품을 사는 사람의 실제 상황으로 구체적으로 쓴다. 어느 키워드에나 붙일 수 있는 말(예: 좋은 상품을 찾는 고객)은 실패.'); L.push('');
  if (kn.knowledge.length) { L.push('[참고 지식 — 이 키워드에 실제로 해당되는 것만 논리로 녹이고, 안 맞으면 무시]'); kn.knowledge.forEach((x, i) => L.push(`${i + 1}. ${x.title}: ${x.summary} ${(x.insights ?? []).slice(0, 3).map((t: string) => '· ' + t).join(' ')}`)); L.push(''); }
  if (kn.principles.length) { L.push('[원칙]'); kn.principles.forEach(p => L.push('- ' + p.text)); L.push(''); }
  if (kn.style) { L.push('[문체 레퍼런스 — 이 톤을 따른다]'); L.push(kn.style.slice(0, 1200)); L.push(''); }
  L.push('[실데이터]'); L.push(JSON.stringify(real)); L.push('');
  L.push('[출력 JSON — 이 틀 그대로. 괄호 안은 안내이니 지우고 내용을 쓴다]');
  L.push(JSON.stringify({
    marketRead: '이 키워드 시장을 읽은 2문장 (존댓말, 130자 내, 실데이터 숫자 1~2개 인용. 예: 리뷰 수와 순위가 일치하지 않는다는 점, 가격대, 신규 진입 정도)',
    buyer: { who: '이 키워드를 검색하는 사람과 그 상황 (26자 내, 명사 끝)', truth: '그 사람이 속으로 걱정하거나 바라는 것 (40자 내, 명사 끝)', moment: '구매를 결정하는 순간 (36자 내, 명사 끝)' },
    reframe: { weak: '이 시장에서 파는 쪽이 겪는 어려움 한 줄 (36자 내, 명사 끝)', flip: '그 어려움을 기회로 뒤집어 본 한 줄 (40자 내, 명사 끝)' },
    narrative: { diagnosis: '시장 현황 한 줄 (28자 내, 명사 끝)', insight: '구매자에 대한 발견 한 줄 (28자 내, 명사 끝)', strategy: '그래서 필요한 광고 방향 한 줄 (28자 내, 명사 끝)' },
    contents: [{ fmt: '형식 — 카페 체험기/블로그 비교글/숏폼/당근 동네생활/상세페이지 카피/인스타 카드뉴스/지식인 Q&A 중 서로 다른 5개', idea: '이 상품군에서만 나오는 콘텐츠 앵글 (36자 내, 명사 끝)', why: '이 콘텐츠가 받는 구매 단계 (20자 내, 명사 끝)' }],
  }));
  return L.join('\n').slice(0, 9000);
}

/** 업체별 글 묶음 — 헤드라인·한 줄·진단 문단·가진 것/새는 것·단계별 이유 */
export function storeBatchInstruction(k: KwData, rows: { id: number; s: StoreData }[], who: string) {
  const L: string[] = [];
  L.push(`네이버쇼핑 키워드 「${k.keyword}」 광고 제안서의 '업체별' 글 ${rows.length}개를 JSON으로 써 주세요. 각 스토어 대표가 자기 상품 얘기라고 느끼게 쓰는 것이 목표입니다. (요청: ${who})`); L.push('');
  L.push(RULES);
  L.push('- 업체마다 완전히 다른 문장. 그 업체의 숫자(순위·리뷰·가격·지수)와 상품명(title)에서 읽히는 특징(소재·용량·구성·타깃)을 반드시 인용한다. 다른 업체에 그대로 붙여도 말이 되는 문장은 실패. 없는 특징은 지어내지 않는다.');
  L.push('- leak(먼저 풀 구간)·lead(가장 먼저 할 광고)·plan(단계)·facts(가진 것 good / 비어 있는 것 bad)는 시스템 판정이다. 뒤집지 말고, 그 업체 데이터로 왜 그런지 풀어 쓴다. good 에 있는 것을 약점처럼, bad 에 있는 것을 강점처럼 쓰지 않는다.');
  L.push("- leak 이 '방어·확장'인 업체(이미 1페이지 상단)는 '새는/묻힌/막힌' 표현 금지 — 지키기·넓히기 관점으로 쓴다.");
  L.push('- stages 는 plan 의 1·2·3단계를 왜 그 순서로 하는지, 각 단계 1~2문장. 그 단계의 광고 이름을 1개 이상 넣는다.'); L.push('');
  L.push(`[키워드 공통] 월 검색 ${k.volume.group.toLocaleString('ko-KR')}회 · 상위 10 평균가 ${k.stats.avgPrice10.toLocaleString('ko-KR')}원 · 상위 10 리뷰 중앙값 ${k.stats.medianReview10.toLocaleString('ko-KR')}개 · 상위 10 지수 평균(5점 만점) 클릭지수 ${k.axes10.hit} / 판매지수 ${k.axes10.sale} / 적합도 ${k.axes10.quality} / 리뷰지수 ${k.axes10.review}${k.volume.related.length ? ` · 연관 키워드 ${k.volume.related.map(r => r.keyword).join(', ')}` : ''}`); L.push('');
  L.push('[업체 실데이터]');
  rows.forEach(r => L.push(JSON.stringify({ id: r.id, store: r.s.store, title: r.s.title || undefined, rank: r.s.rank ?? `상위 ${k.n}개 안에 없음`, band: r.s.band, reviews: r.s.reviews ?? undefined, price: r.s.price ?? undefined, ad: r.s.ad || undefined, axes: r.s.axes ? Object.fromEntries((['hit', 'sale', 'quality', 'review'] as (keyof typeof AXIS_LABEL)[]).map(a => [AXIS_LABEL[a], r.s.axes![a]])) : undefined, keepCnt: r.s.keepCnt ?? undefined, openDays: r.s.openDays ?? undefined, leak: LEAK_LABEL[r.s.leak], facts: { good: r.s.good, bad: r.s.bad }, lead: r.s.lead, targetRank: r.s.target, plan: r.s.plan.map(p => `${p.phase}단계 ${p.title}(${p.when}): ${p.weapons.join(', ')}`) })));
  L.push('');
  L.push('[출력 JSON — items 배열에 위 업체 id 를 빠짐없이. 괄호 안은 안내이니 지우고 내용을 쓴다]');
  L.push(JSON.stringify({ items: [{ id: 0,
    headline: '업체명 포함 헤드라인. 가진 것을 인정한 뒤 문제를 짚는 한 줄 (44자 내, 명사 끝)',
    thesis: '이 제안을 관통하는 한 줄 (30자 내, 명사 끝)',
    summary: '진단 2~3문장 (존댓말, 140자 내). 이 업체 숫자와 상품명 특징을 인용해 지금 상태와 가장 큰 문제를 설명',
    have: ['이미 가진 것 — facts.good 을 이 상품 말로 다시 쓴 것. 근거 숫자 포함 (30자 내, 명사 끝)', '둘', '셋'],
    leak: ['비어 있는 것 — facts.bad 를 이 상품 말로 다시 쓴 것. 근거 숫자 포함 (30자 내, 명사 끝)', '둘', '셋'],
    stages: ['1단계를 왜 가장 먼저 하는지 (존댓말 1~2문장, 90자 내)', '2단계를 왜 그 다음에 하는지 (존댓말, 90자 내)', '3단계에서 무엇이 쌓이는지 (존댓말, 90자 내)'] }] }));
  L.push('');
  L.push('[형식 참고 — 문장을 따라 쓰지 말 것, 길이·말투만 참고] {"id":1,"headline":"리뷰 7,240개를 쌓고도 「토퍼」 23위에 묻힌 슬립랩","thesis":"상품은 준비된 상태, 부족한 건 노출 한 칸","summary":"슬립랩 7cm 메모리폼 토퍼는 리뷰가 7,240개이고, 판매지수도 상위 10개 수준입니다. 그런데 순위가 23위라, 「토퍼」를 검색한 사람 대부분이 이 상품을 보지 못하고 있습니다.","have":["리뷰 7,240개 — 상위 10 중앙값 이상","59,000원 — 상위 10 평균보다 낮은 가격","판매지수 3.6 — 상위 10 평균 이상"],"leak":["23위 — 클릭이 거의 닿지 않는 자리","클릭지수 1.5 — 상위 10 평균 3.5의 절반 이하","3단 접이식이라는 장점이 검색에서 안 보이는 상태"],"stages":["리뷰와 가격은 이미 갖췄으니, 쇼핑 상위노출로 5위권 자리부터 만듭니다. 보이기만 하면 비교에서 밀리지 않는 상품입니다.","순위가 자리 잡으면 맘카페 보장형과 카페 배포로 후기를 더합니다. 올라간 자리에서 생긴 클릭이 구매로 이어지게 하는 단계입니다.","스레드와 인스타 콘텐츠로 슬립랩이라는 이름을 기억하게 만들어, 다시 검색하고 다시 구매하는 고객을 쌓습니다."]}');
  return L.join('\n').slice(0, 15000);
}

// ── 키워드 데이터 준비 (nsc 캐시 + 검색광고 API) + 워커 요청 ──
export async function ensureKeyword(keyword: string, me: { id: string; name: string }, force = false): Promise<R<{ k: KwData; fresh: boolean }>> {
  const kw = keyword.trim().replace(/\s+/g, ' '); if (!kw) return { ok: false, msg: '키워드 없음' };
  const db = sb();
  const { data: ex } = await db.from('pv3_keywords').select('keyword,data,ai,ai_status,updated_at').eq('keyword', kw).maybeSingle();
  const stale = !ex || force || (ex.data as KwData | null)?.dv !== PV3_DATA_VER || Date.now() - new Date(ex.updated_at).getTime() > 24 * 3600e3;
  if (!stale) return { ok: true, msg: '캐시', k: ex!.data as KwData, fresh: false };
  let r; try { r = await search(kw, me.id); } catch (e: any) { return { ok: false, msg: `지수 조회 실패: ${e.message}` }; }
  let vols: any[] = []; if (adConfigured()) { try { vols = await keywordVolumes([kw]); } catch { /* 검색량 없이 진행 */ } }
  const k = computeKeyword(r, vols);
  await db.from('pv3_keywords').upsert({ keyword: kw, data: k, ai_status: ex?.ai ? ex.ai_status : 'none', updated_at: new Date().toISOString(), created_by: me.id }, { onConflict: 'keyword' });
  return { ok: true, msg: '계산', k, fresh: true };
}

/** 키워드 공통 글 워커 요청 (없거나, 글 구조 버전이 바뀌었거나, force 일 때) */
export async function requestKwAi(kw: string, k: KwData, me: { id: string; name: string }, force = false): Promise<R<{ taskId?: number }>> {
  const db = sb();
  const { data: ex } = await db.from('pv3_keywords').select('ai,ai_status,ai_task_id').eq('keyword', kw).maybeSingle();
  const cur = (ex?.ai as KwAi | null)?._v === PV3_AI_VER;
  if (ex && !force && (ex.ai_status === 'queued' || (ex.ai_status === 'done' && cur) || (ex.ai_status === 'fallback' && cur && ex.ai_task_id))) return { ok: true, msg: '이미 요청됨', taskId: ex.ai_task_id ?? undefined };
  const kn = await pickKnowledge(kw, k.kwLeak);
  const { data, error } = await db.from('ai_tasks').insert({ kind: 'order', agent: 'chief', title: `${PV3_TITLE} ${kw}`.slice(0, 80), instruction: kwInstruction(k, kn, me.name), source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' }).select('id').single();
  if (error) return { ok: false, msg: error.message };
  await db.from('pv3_keywords').update({ ai_task_id: data.id, ai_status: 'queued' }).eq('keyword', kw);
  return { ok: true, msg: `AI 작업 #${data.id}`, taskId: data.id };
}

const BATCH = 12;   // 업체 묶음 크기 — 워커 1건이 2~3분 안에 끝나는 크기
/** 업체들 계산·저장 + 묶음 워커 요청. 이미 있고 판정이 그대로면 건드리지 않음(글 속 숫자와 데이터가 어긋나지 않게) */
export async function ensureStores(kw: string, k: KwData, targets: { target_id: number | null; store: string; rank: number | null; reviews: number | null; price: number | null; link?: string; productUrl?: string | null }[], me: { id: string; name: string }): Promise<R<{ ids: number[]; queued: number }>> {
  const db = sb(); const ids: number[] = []; const fresh: { id: number; s: StoreData }[] = [];
  const { data: nsc } = await db.from('nsc_searches').select('data').eq('keyword', kw).maybeSingle(); const prods: Product[] = ((nsc?.data as any)?.products ?? []) as Product[];
  const tids = targets.map(t => t.target_id).filter((x): x is number => !!x);
  const { data: exRows } = tids.length ? await db.from('pv3_stores').select('id,target_id,ai,ai_task_id,data,created_at').eq('keyword', kw).in('target_id', tids) : { data: [] as any[] };
  const exBy = new Map<number, any>((exRows ?? []).map((r: any) => [r.target_id, r]));
  const toInsert: { keyword: string; target_id: number | null; store_name: string; data: StoreData }[] = [];
  for (const t of targets) {
    const product = matchProduct(prods, { store: t.store, productUrl: t.productUrl, rank: t.rank });
    const s = computeStore(k, { store: t.store, rank: t.rank, reviews: t.reviews, price: t.price, link: t.link, product });
    const ex = t.target_id ? exBy.get(t.target_id) : null;
    if (!ex) { toInsert.push({ keyword: kw, target_id: t.target_id, store_name: t.store, data: s }); continue; }
    const ai = ex.ai as StoreAi | null; const od = ex.data as StoreData | null; const old = Date.now() - new Date(ex.created_at).getTime() > 7 * 86400e3;
    const changed = !od || od.dv !== PV3_DATA_VER || od.leak !== s.leak || od.lead !== s.lead || JSON.stringify(od.plan) !== JSON.stringify(s.plan) || Math.abs((od.rank ?? 999) - (s.rank ?? 999)) >= 5 || (!od.title && !!s.title);
    const waiting = !ai && !!ex.ai_task_id && !changed && !old;   // 워커 글을 기다리는 중 — 다시 요청하지 않는다 (호출될 때마다 작업이 새로 쌓이던 문제)
    if (!waiting && (!ai || ai._v !== PV3_AI_VER || changed || old)) {   // 글 구조가 예전 것 · 판정/순위가 크게 바뀜 · 7일 지남 → 데이터·글·이미지 새로
      await db.from('pv3_stores').update({ store_name: t.store, data: s, ai: null, ai_task_id: null, images: [], created_at: new Date().toISOString() }).eq('id', ex.id); fresh.push({ id: ex.id, s });
    }
    ids.push(ex.id);
  }
  if (toInsert.length) {
    const { data: ins, error } = await db.from('pv3_stores').insert(toInsert).select('id,target_id,data');
    if (error) return { ok: false, msg: '업체 저장 실패: ' + error.message };
    (ins ?? []).forEach((r: any) => { ids.push(r.id); fresh.push({ id: r.id, s: r.data as StoreData }); });
  }
  let queued = 0;
  for (let i = 0; i < fresh.length; i += BATCH) {
    const batch = fresh.slice(i, i + BATCH);
    const { data, error } = await db.from('ai_tasks').insert({ kind: 'order', agent: 'chief', title: `${PV3_TITLE} ${kw} 업체 ${batch.length}곳`.slice(0, 80), instruction: storeBatchInstruction(k, batch, me.name), source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' }).select('id').single();
    if (!error && data) { await db.from('pv3_stores').update({ ai_task_id: data.id }).in('id', batch.map(b => b.id)); queued += batch.length; }
  }
  return { ok: true, msg: `업체 ${ids.length}곳 · AI 요청 ${queued}곳`, ids, queued };
}

// ── 워커 결과 수거 (발송 준비·화면·렌더 스크립트의 주기 호출) ──
const BAD = /수수료|대행\s*비용|무조건|확실히|100\s*%|안전하/;                 // 들어가면 안 되는 표현 → 그 업체는 기본 문장으로
const str = (v: unknown, max: number) => String(v ?? '').replace(/["“”]/g, "'").replace(/\s+/g, ' ').trim().slice(0, max);
const noDot = (t: string) => t.replace(/[.。]\s*$/, '');
const arr = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : []).map(x => noDot(str(x, max))).filter(Boolean).slice(0, n);
const DONE_BAD = ['failed', 'rejected', 'cancelled'];
function toKwAi(j: any, k: KwData): KwAi | null {
  if (!j?.buyer?.who || !Array.isArray(j?.contents) || j.contents.length < 3) return null;
  const fb = fallbackKwAi(k);
  const ai: KwAi = {
    marketRead: str(j.marketRead, 220) || fb.marketRead,
    buyer: { who: noDot(str(j.buyer.who, 60)), truth: noDot(str(j.buyer.truth, 80)) || fb.buyer.truth, moment: noDot(str(j.buyer.moment, 80)) || fb.buyer.moment },
    reframe: { weak: noDot(str(j.reframe?.weak, 80)) || fb.reframe.weak, flip: noDot(str(j.reframe?.flip, 90)) || fb.reframe.flip },
    narrative: { diagnosis: noDot(str(j.narrative?.diagnosis, 60)) || fb.narrative.diagnosis, insight: noDot(str(j.narrative?.insight, 60)) || fb.narrative.insight, strategy: noDot(str(j.narrative?.strategy, 60)) || fb.narrative.strategy },
    contents: j.contents.slice(0, 5).map((c: any) => ({ fmt: noDot(str(c?.fmt, 14)), idea: noDot(str(c?.idea, 70)), why: noDot(str(c?.why, 40)) || undefined })).filter((c: any) => c.fmt && c.idea),
    _src: 'worker', _v: PV3_AI_VER,
  };
  return BAD.test(JSON.stringify(ai)) ? null : ai;
}
function toStoreAi(it: any, k: KwData, s: StoreData): StoreAi | null {
  if (!it?.headline) return null;
  const fb = fallbackStoreAi(k, s); const st = (Array.isArray(it.stages) ? it.stages : []).map((x: unknown) => str(x, 200)).filter(Boolean);
  const headline = noDot(str(it.headline, 70));
  const ai: StoreAi = {
    headline: headline.length >= 8 && headline.length <= 64 ? headline : fb.headline, thesis: noDot(str(it.thesis, 50)) || fb.thesis, summary: str(it.summary, 260) || fb.summary,
    have: (() => { const a = arr(it.have, 3, 60); return a.length ? a : fb.have; })(), leak: (() => { const a = arr(it.leak, 3, 60); return a.length ? a : fb.leak; })(),
    stages: st.length >= 3 ? st.slice(0, 3) : fallbackStages(k, s), first: fb.first, skipWhy: fb.skipWhy, _src: 'worker', _v: PV3_AI_VER,
  };
  return BAD.test(JSON.stringify({ ...ai, first: '', skipWhy: [] })) ? null : ai;
}
export async function ingestAi(): Promise<{ kw: number; stores: number; err?: string; dbg?: string }> {
  const db = sb(); let kwN = 0, stN = 0; let err = ''; const dbg: string[] = [];
  const chk = (r: { error: { message: string } | null }, where: string) => { if (r.error && !err) err = `${where}: ${r.error.message}`.slice(0, 300); return !r.error; };
  // 키워드: 워커 대기 중(queued) 또는 기본 문장으로 먼저 나간 것(fallback + 작업 번호 남아 있음)
  const { data: ks } = await db.from('pv3_keywords').select('keyword,data,ai,ai_status,ai_task_id').in('ai_status', ['queued', 'fallback']).not('ai_task_id', 'is', null).limit(80);
  for (const k of ks ?? []) {
    const { data: t } = await db.from('ai_tasks').select('status,result').eq('id', k.ai_task_id).maybeSingle(); if (!t) continue;
    if (t.status !== 'done' && !DONE_BAD.includes(t.status)) continue;   // 아직 작업 중
    const ai = t.status === 'done' ? toKwAi(parseLoose(t.result), k.data as KwData) : null;
    if (ai) { await db.from('pv3_keywords').update({ ai, ai_status: 'done', images: [] }).eq('keyword', k.keyword); kwN++; }   // 기본 문장으로 렌더된 이미지는 비움 → 다시 렌더
    else { const had = k.ai_status === 'fallback' && k.ai; await db.from('pv3_keywords').update(had ? { ai_task_id: null } : { ai: { ...fallbackKwAi(k.data as KwData), _src: 'final', _v: PV3_AI_VER }, ai_status: 'fallback', ai_task_id: null }).eq('keyword', k.keyword); if (!had) kwN++; }
  }
  // 업체: 글이 아직 없거나, 기본 문장으로 먼저 나간 것
  const { data: ss } = await db.from('pv3_stores').select('id,keyword,data,ai,ai_task_id').not('ai_task_id', 'is', null).or('ai.is.null,ai->>_src.eq.fallback').limit(600);
  const byTask = new Map<number, any[]>(); (ss ?? []).forEach(s => { const a = byTask.get(s.ai_task_id) ?? []; a.push(s); byTask.set(s.ai_task_id, a); });
  const kCache = new Map<string, KwData | null>();
  for (const [taskId, rows] of byTask) {
    const { data: t } = await db.from('ai_tasks').select('status,result').eq('id', taskId).maybeSingle(); if (!t) { dbg.push(`#${taskId} 작업없음 ${rows.length}곳`); continue; }
    if (t.status !== 'done' && !DONE_BAD.includes(t.status)) { dbg.push(`#${taskId} ${t.status} ${rows.length}곳`); continue; }
    const kwName = rows[0].keyword as string;
    if (!kCache.has(kwName)) { const { data: kd } = await db.from('pv3_keywords').select('data').eq('keyword', kwName).maybeSingle(); kCache.set(kwName, (kd?.data as KwData) ?? null); }
    const k = kCache.get(kwName); if (!k) continue;
    const j = t.status === 'done' ? parseLoose(t.result) : null; const items: any[] | null = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : null;
    dbg.push(`#${taskId} ${t.status} ${kwName} ${rows.length}곳(id ${rows.map(r => r.id).slice(0, 4).join(',')}) 결과 ${String(t.result ?? '').length}자 items ${items ? items.length : '파싱실패'}`);
    for (const s of rows) {
      const ai = toStoreAi(items?.find(x => Number(x?.id) === s.id), k, s.data as StoreData);
      let r;
      if (ai) r = await db.from('pv3_stores').update({ ai, ...(s.ai ? { images: [] } : {}) }).eq('id', s.id);                               // 기본 문장 → 워커 글로 교체 시 다시 렌더
      else if (!s.ai) r = await db.from('pv3_stores').update({ ai: { ...fallbackStoreAi(k, s.data as StoreData), _src: 'final', _v: PV3_AI_VER } }).eq('id', s.id);
      else r = await db.from('pv3_stores').update({ ai: { ...(s.ai as StoreAi), _src: 'final' } }).eq('id', s.id);                           // 워커 실패 — 기본 문장 확정
      if (chk(r, `업체 ${s.id} 글 저장`)) stN++;
    }
  }
  return { kw: kwN, stores: stN, ...(err ? { err } : {}), dbg: dbg.join(' / ').slice(0, 900) };
}

/** 렌더 작업 등록 (키워드 공통 장 / 업체별 장) */
export async function queueRender(kind: 'keyword' | 'store', ref: string) {
  const db = sb();
  const { data: ex } = await db.from('pv3_render_jobs').select('id').eq('kind', kind).eq('ref', ref).in('status', ['queued', 'running']).maybeSingle();
  if (ex) return ex.id;
  const { data } = await db.from('pv3_render_jobs').insert({ kind, ref }).select('id').single(); return data?.id;
}
/** 글이 준비된 키워드·업체 중 현재 디자인 이미지가 없는 것을 렌더 큐에 (최근 14일 안에 만든 것만) */
export async function queueMissingRenders(onlyKeyword?: string): Promise<number> {
  const db = sb(); let n = 0; const since = new Date(Date.now() - 14 * 86400e3).toISOString();
  let kq = db.from('pv3_keywords').select('keyword,images,data').in('ai_status', ['done', 'fallback']).gte('updated_at', since); if (onlyKeyword) kq = kq.eq('keyword', onlyKeyword);
  const { data: ks } = await kq.limit(300);
  for (const k of ks ?? []) {
    if ((k.data as KwData | null)?.dv !== PV3_DATA_VER) continue;   // 예전 구조 — 다시 계산(발송·만들기)되면 그때 렌더
    if (!hasPages(k.images, PV3_COMMON_PAGES)) { await queueRender('keyword', k.keyword); n++; }
    const { data: ss } = await db.from('pv3_stores').select('id,images,data').eq('keyword', k.keyword).not('ai', 'is', null).gte('created_at', since).limit(500);
    for (const s of ss ?? []) if ((s.data as StoreData | null)?.dv === PV3_DATA_VER && !hasPages(s.images, PV3_STORE_PAGES)) { await queueRender('store', String(s.id)); n++; }
  }
  return n;
}
export { nounEnd };

/** 발송 쪽에서 호출: 키워드·업체 v3 데이터가 없으면 자동으로 계산 + 워커 요청 + (글 있으면) 렌더 큐. 반환 = 지금 보낼 수 있는지 */
export async function autoPrepareV3(kw: string, me: { id: string; name: string }, picks: { target_id: number; store: string; rank: number | null; reviews: number | null; link?: string }[], quick = false): Promise<{ ready: boolean; msg: string }> {
  const ek = await ensureKeyword(kw, me); if (!ek.ok || !ek.k) return { ready: false, msg: ek.msg };
  const k = ek.k; const db = sb();
  const { data: mt } = picks.length ? await db.from('mail_targets').select('id,product_url').in('id', picks.map(c => c.target_id)) : { data: [] as any[] };
  const purl = new Map((mt ?? []).map((x: any) => [x.id, x.product_url as string | null]));
  const targets = picks.map(c => ({ target_id: c.target_id, store: c.store || '귀사', rank: c.rank, reviews: c.reviews, price: null as number | null, link: c.link, productUrl: purl.get(c.target_id) ?? null }));
  const es = targets.length ? await ensureStores(kw, k, targets, me) : { msg: '', queued: 0, ids: [] as number[] };
  await requestKwAi(kw, k, me, ek.fresh);
  await ingestAi();
  if (quick) {   // 빠른 모드: 워커를 기다리지 않고 기본 문장으로 먼저 렌더. 워커 글이 나오면 자동으로 교체·다시 렌더
    const { data: k0 } = await db.from('pv3_keywords').select('ai,ai_status').eq('keyword', kw).maybeSingle();
    if (k0 && k0.ai_status !== 'done' && !(k0.ai_status === 'fallback' && (k0.ai as KwAi | null)?._v === PV3_AI_VER)) await db.from('pv3_keywords').update({ ai: { ...fallbackKwAi(k), _src: 'fallback', _v: PV3_AI_VER }, ai_status: 'fallback' }).eq('keyword', kw);
    const { data: s0 } = await db.from('pv3_stores').select('id,data').eq('keyword', kw).is('ai', null).in('id', es.ids ?? []);
    for (const st of s0 ?? []) await db.from('pv3_stores').update({ ai: { ...fallbackStoreAi(k, st.data as StoreData), _src: 'fallback', _v: PV3_AI_VER } }).eq('id', st.id);
  }
  await queueMissingRenders(kw);
  const { data: kr } = await db.from('pv3_keywords').select('images').eq('keyword', kw).maybeSingle();
  const { data: ss } = await db.from('pv3_stores').select('id,images').eq('keyword', kw).in('id', es.ids ?? []);
  const ready = !!kr && hasPages(kr.images, PV3_COMMON_PAGES) && (ss ?? []).some(s => hasPages(s.images, PV3_STORE_PAGES));
  return { ready, msg: ready ? '준비됨' : `'${kw}' 제안서 준비 중 — 글·이미지 생성 요청함 (${quick ? '빠른 모드 1~3분' : '보통 5~10분'}, 워커 PC 켜져 있어야 함)` };
}

/** 메일 화면용 진행 상태 */
export async function v3Status(kw: string): Promise<{ kwData: boolean; kwAi: string; kwTask: number | null; kwTaskStatus: string; kwReady: boolean; stores: number; storesAi: number; storesWorker: number; storesImg: number; renderLast: string | null; renderQueue: number }> {
  const db = sb();
  const { data: k } = await db.from('pv3_keywords').select('ai_status,ai_task_id,images').eq('keyword', kw).maybeSingle();
  let kwTaskStatus = '';
  if (k?.ai_task_id) { const { data: t } = await db.from('ai_tasks').select('status').eq('id', k.ai_task_id).maybeSingle(); kwTaskStatus = t?.status ?? ''; }
  const { data: ss } = await db.from('pv3_stores').select('ai,images').eq('keyword', kw);
  const { data: rl } = await db.from('ai_settings').select('value').eq('key', 'pv3_render_last').maybeSingle();
  const { count } = await db.from('pv3_render_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'running']);
  return { kwData: !!k, kwAi: k?.ai_status ?? 'none', kwTask: k?.ai_task_id ?? null, kwTaskStatus, kwReady: !!k && hasPages(k.images, PV3_COMMON_PAGES), stores: ss?.length ?? 0, storesAi: (ss ?? []).filter(s => s.ai).length, storesWorker: (ss ?? []).filter(s => (s.ai as StoreAi | null)?._src === 'worker').length, storesImg: (ss ?? []).filter(s => hasPages(s.images, PV3_STORE_PAGES)).length, renderLast: rl?.value ?? null, renderQueue: count ?? 0 };
}
