// 키워드 발굴 — 아직 수집 안 된 키워드를 검색광고 API 연관 키워드에서 찾아 mail_kw_pool 에 쌓는다. 수동(화면)·자동(cron) 공용
import { supabaseAdmin } from '@/lib/supabase/admin';
import { keywordVolumes, adConfigured } from '@/lib/naverAd';
import { parseLoose } from '@/lib/proposalV3';
type Sb = ReturnType<typeof supabaseAdmin>;
export const kwNorm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
export const KW_AI_TITLE = '[키워드 발굴] 씨앗 키워드 제안';

export async function haveKeywords(sb: Sb): Promise<{ set: Set<string>; list: string[] }> {
  const { data } = await sb.rpc('mail_keywords_json'); const list = ((data ?? []) as { keyword: string }[]).map(k => k.keyword);
  return { set: new Set(list.map(kwNorm)), list };
}
/** 상품이 아닌 검색어(맛집·레시피·관광·정보성) 거르기 — 검색광고 연관 키워드는 이런 말로 쉽게 샌다 */
const NOT_PRODUCT = /맛집|식당|밥집|술집|카페$|뷔페|레시피|만들기|만드는|담그는|끓이는|하는법|방법$|가볼만한|여행|관광|축제|시장$|마트$|근처|주변|메뉴|추천$|순위$|효능|부작용|칼로리|제철|보관법|뜻$|차이$|후기$|가격$|시세|날씨|영화|드라마|노래|가사|주가|주식|로또|운세|조회|고객센터|채용|알바|병원|의원|약국|학원|학교|호텔|펜션|숙소|리조트|예약|배달|역$|공항|터미널|휴게소|국밥|찌개|탕$|전골|무국|볶음$|조림$|구이$|무침$|겉절이|정식$|국$|해장|철$/;
export const looksProduct = (kw: string) => !NOT_PRODUCT.test(kw.replace(/\s+/g, ''));
const shuffle = <T,>(a: T[]) => { const p = [...a]; for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };

/** 쌓는 기준: 검색량 min 이상 · 경쟁도 높음(광고주가 돈 쓰는 키워드 = 파는 상품) · 맛집·레시피 등 제외. 씨앗(최대 25개, 없으면 수집된 키워드 중 무작위)을 5개씩 묶어 검색광고 API 호출 → 미수집·미후보만 쌓기 */
export async function discoverCore(sb: Sb, seedsIn: string[], minVol: number): Promise<{ ok: boolean; msg: string; added: number; seen: number; seeds: string[] }> {
  if (!adConfigured()) return { ok: false, msg: '검색광고 API 환경변수가 없습니다 (NAVER_AD_CUSTOMER_ID / NAVER_AD_API_KEY / NAVER_AD_SECRET)', added: 0, seen: 0, seeds: [] };
  const { set: have, list } = await haveKeywords(sb); const min = Math.max(0, Math.round(Number(minVol) || 0));
  let seeds = Array.from(new Set(seedsIn.map(s => s.trim()).filter(Boolean))).slice(0, 25); if (!seeds.length) seeds = shuffle(list).slice(0, 25);
  if (!seeds.length) return { ok: false, msg: '씨앗 키워드가 없습니다', added: 0, seen: 0, seeds };
  const found = new Map<string, { keyword: string; vol: number; seed: string }>(); let seen = 0; const errs: string[] = [];
  for (let i = 0; i < seeds.length; i += 5) {
    const g = seeds.slice(i, i + 5);
    try { for (const k of await keywordVolumes(g)) { seen++; const kw = k.keyword.trim(); const key = kwNorm(kw); if (!kw || kw.length > 20 || k.total < min || k.comp !== '높음' || !looksProduct(kw) || have.has(key) || found.has(key)) continue; found.set(key, { keyword: kw, vol: k.total, seed: g[0] }); } }
    catch (e: any) { errs.push(String(e?.message ?? e).slice(0, 80)); }
    await new Promise(r => setTimeout(r, 400));
  }
  if (!found.size) return errs.length ? { ok: false, msg: '검색광고 API 오류: ' + errs[0], added: 0, seen, seeds } : { ok: true, msg: `새 키워드 없음 (연관 ${seen}개 확인 — 이미 있거나 검색량 ${min} 미만·상품 아님)`, added: 0, seen, seeds };
  const rows = [...found.values()]; let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await sb.from('mail_kw_pool').upsert(rows.slice(i, i + 500), { onConflict: 'keyword', ignoreDuplicates: true }).select('keyword');
    if (error) return { ok: false, msg: /mail_kw_pool/.test(error.message) ? '0085 SQL(mail_kw_pool 표)을 먼저 실행해 주세요' : error.message, added, seen, seeds }; added += data?.length ?? 0;
  }
  return { ok: true, msg: `새 키워드 ${added}개 추가 (연관 ${seen}개 확인${errs.length ? ` · 일부 실패 ${errs.length}` : ''})`, added, seen, seeds };
}

// ── 자동 ──────────────────────────────────────────────────────────────
const getS = async (sb: Sb, keys: string[]) => { const { data } = await sb.from('ai_settings').select('key,value').in('key', keys); const m = new Map<string, string>(); for (const r of (data ?? []) as { key: string; value: string }[]) m.set(r.key, r.value); return m; };
const setS = (sb: Sb, key: string, value: string) => sb.from('ai_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
export type KwAuto = { on: boolean; minVol: number; lastAt: string; lastMsg: string; aiSeeds: number; aiTask: number | null };
export async function kwAutoState(sb: Sb): Promise<KwAuto> {
  const s = await getS(sb, ['kw_auto', 'kw_min_vol', 'kw_auto_last', 'kw_auto_msg', 'kw_ai_seeds', 'kw_ai_task']);
  let n = 0; try { n = (JSON.parse(s.get('kw_ai_seeds') || '[]') as string[]).length; } catch {}
  return { on: s.get('kw_auto') !== 'off', minVol: Number(s.get('kw_min_vol') || 1000) || 1000, lastAt: s.get('kw_auto_last') || '', lastMsg: s.get('kw_auto_msg') || '', aiSeeds: n, aiTask: Number(s.get('kw_ai_task')) || null };
}
export async function kwAutoSet(sb: Sb, v: { on?: boolean; minVol?: number }) {
  if (typeof v.on === 'boolean') await setS(sb, 'kw_auto', v.on ? 'on' : 'off');
  if (v.minVol != null) await setS(sb, 'kw_min_vol', String(Math.max(0, Math.round(Number(v.minVol) || 0))));
}
/** cron 이 2분마다 부른다 — 15분에 한 번만 실제로 돈다. 후보가 3,000개 넘게 쌓여 있으면 쉼. AI 워커 씨앗이 있으면 그것부터 쓴다 */
export async function autoDiscover(): Promise<string> {
  const sb = supabaseAdmin(); const s = await getS(sb, ['kw_auto', 'kw_auto_next', 'kw_min_vol', 'kw_ai_seeds', 'kw_ai_task', 'kw_ai_last']);
  if (s.get('kw_auto') === 'off') return 'off';
  if (s.get('kw_auto_next') && new Date(s.get('kw_auto_next')!).getTime() > Date.now()) return 'wait';
  await setS(sb, 'kw_auto_next', new Date(Date.now() + 15 * 60e3).toISOString());   // 먼저 찍어 두어 겹쳐 돌지 않게
  const { count, error } = await sb.from('mail_kw_pool').select('keyword', { count: 'exact', head: true }).is('taken_at', null);
  if (error) return 'no-table';
  // 1) AI 워커 결과 수거 → 씨앗 큐
  let seedsQ: string[] = []; try { seedsQ = JSON.parse(s.get('kw_ai_seeds') || '[]'); } catch {}
  let taskId = Number(s.get('kw_ai_task')) || 0;
  if (taskId) {
    const { data: t } = await sb.from('ai_tasks').select('status,result').eq('id', taskId).maybeSingle();
    if (!t || ['rejected', 'failed', 'cancelled'].includes(t.status)) { taskId = 0; await setS(sb, 'kw_ai_task', ''); }
    else if (t.status === 'done') {
      const j = parseLoose(t.result); const arr: unknown[] = Array.isArray(j) ? j : Array.isArray(j?.keywords) ? j.keywords : String(t.result ?? '').split(/[\n,]+/);
      const got = Array.from(new Set(arr.map(x => String(x ?? '').replace(/^[\s\-\d.)"'\[]+|["'\],\s]+$/g, '').trim()).filter(x => x && x.length <= 20 && !/[{}:]/.test(x) && looksProduct(x)))).slice(0, 300);
      seedsQ = [...seedsQ, ...got]; taskId = 0; await setS(sb, 'kw_ai_task', '');
    }
  }
  if ((count ?? 0) >= 3000) { await setS(sb, 'kw_ai_seeds', JSON.stringify(seedsQ)); await setS(sb, 'kw_auto_msg', '후보가 3,000개 이상 쌓여 있어 쉬는 중'); return 'full'; }
  // 2) 한 번 찾기
  const use = seedsQ.slice(0, 25); const r = await discoverCore(sb, use, Number(s.get('kw_min_vol') || 1000) || 1000);
  seedsQ = seedsQ.slice(use.length); await setS(sb, 'kw_ai_seeds', JSON.stringify(seedsQ));
  await setS(sb, 'kw_auto_last', new Date().toISOString()); await setS(sb, 'kw_auto_msg', `${use.length ? 'AI 씨앗' : '기존 키워드 씨앗'} · ${r.msg}`.slice(0, 200));
  // 3) 씨앗이 떨어졌고 대기 중인 작업이 없으면 6시간에 한 번 AI 워커에 요청
  if (!seedsQ.length && !taskId && (!s.get('kw_ai_last') || Date.now() - new Date(s.get('kw_ai_last')!).getTime() > 6 * 3600e3)) {
    const { list } = await haveKeywords(sb); const sample = shuffle(list).slice(0, 80).join(', ');
    const instruction = `네이버 쇼핑에서 판매자(스마트스토어)가 상품을 파는 "상품 키워드"를 150개 제안해 주세요.\n\n조건\n- 실제로 사람들이 네이버 쇼핑에서 검색하는 일반 상품명 (예: 전기장판, 김장김치, 캠핑의자). 브랜드명·상호·인물·지역 맛집·서비스·정보성 검색어는 제외\n- 지금 계절과 앞으로 두 달 안의 시즌 수요, 그리고 식품·생활·주방·가전·패션·뷰티·유아·반려동물·스포츠·자동차용품·문구·취미·건강 등 카테고리를 고르게\n- 아래 "이미 가진 키워드"와 겹치지 않는 것 위주로 (같은 계열의 다른 상품은 좋음)\n- 한 키워드는 띄어쓰기 없이 2~12자\n\n이미 가진 키워드 일부: ${sample}\n\n출력은 설명 없이 JSON 배열 하나만: ["키워드1","키워드2", ...]`;
    const { data: ins } = await sb.from('ai_tasks').insert({ kind: 'order', agent: 'chief', title: KW_AI_TITLE, instruction, source: 'workhub', requested_by: '키워드 발굴(자동)', status: 'queued' }).select('id').single();
    if (ins?.id) { await setS(sb, 'kw_ai_task', String(ins.id)); await setS(sb, 'kw_ai_last', new Date().toISOString()); }
  }
  return r.msg;
}
