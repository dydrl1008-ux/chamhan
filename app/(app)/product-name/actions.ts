'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { search } from '@/lib/nsc';
import { keywordVolumes, adConfigured, type KwVol } from '@/lib/naverAd';
import { todayKST } from '@/lib/date/kst';
import { TITLE_PREFIX, MAX_LEN, EFFECT_WORDS } from './shared';

type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
const DAILY = { staff: 5, manager: 20, head: 50, admin: 50 } as Record<string, number>;

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const tokens = (s: string) => s.replace(/[\[\]()（）,·/|+★☆※"'“”‘’]/g, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2 && !/^\d+(개|개입|입|g|ml|mg|kg|%)?$/i.test(t) && !/^x\d/i.test(t));
const isEffect = (w: string) => EFFECT_WORDS.some(e => norm(w).includes(e));

/** 상위 100 상품명 단어 빈도 (상위10 / 상위30 / 전체) */
function wordStats(titles: string[]) {
  const c: Record<string, { t10: number; t30: number; all: number }> = {};
  titles.forEach((t, i) => { const seen = new Set(tokens(t).map(x => x.toLowerCase())); seen.forEach(w => { const e = (c[w] ??= { t10: 0, t30: 0, all: 0 }); e.all++; if (i < 30) e.t30++; if (i < 10) e.t10++; }); });
  return c;
}

type Cand = { word: string; score: number; vol: number; t10: number; src: string; effect: boolean };

/** 단어 풀 만들기 — 필수 > 후보 > 상위10 단어 > 검색량 서브 키워드에서 메인 키워드 뺀 나머지 */
const CLAIM = new Set(['효과', '개선', '완화', '예방', '치료', '효능', '도움', '케어', '종합']);
const STOP = new Set(['추천', '인기', '베스트', '공식', '정품', '즉시배송', '무료배송', '당일배송', '세트', '증정', '사은품', '할인', '특가', '묶음', '본사', '공식몰', '직영', '정식', '국내산', '최저가', '신상', '신제품']);
const stem = (w: string) => norm(w).replace(/[\d%.]+/g, '');   // 순도90% → 순도 (같은 스펙 다른 숫자 충돌 방지)
function candidates(main: string, brand: string, must: string[], optional: string[], vols: KwVol[], ws: ReturnType<typeof wordStats>, malls: string[]) {
  const base = new Set([...tokens(main), ...tokens(brand)].map(norm));
  const mallWords = new Set(malls.flatMap(m => tokens(m)).map(norm));   // 다른 몰·브랜드 이름 제외
  const fixedStems = new Set([...tokens(brand), ...must].map(stem).filter(Boolean));
  const pool: Record<string, Cand> = {};
  const add = (word: string, src: string, bonus = 0) => {
    const k = norm(word); if (!k || base.has(k) || [...base].some(b => k.includes(b) || b.includes(k))) return;   // 메인·브랜드와 겹치면 제외
    const st0 = ws[word.toLowerCase()] ?? ws[k] ?? { t10: 0, t30: 0, all: 0 };
    if (src !== '필수' && src !== '후보') {
      if (STOP.has(k) || mallWords.has(k) || k.includes('%') || (/\d/.test(k) && fixedStems.has(stem(k)))) return;   // 남의 스펙(순도80%)·몰 이름·의미 없는 단어
      if (CLAIM.has(k)) return;                                     // 효과·개선 같은 표현어는 자동으로 안 넣음
      if (isEffect(word) && st0.t10 < 3) return;                     // 효능·부위 단어는 상위10 중 3개 이상 쓸 때만
    }
    const st = ws[word.toLowerCase()] ?? ws[k] ?? { t10: 0, t30: 0, all: 0 };
    const v = vols.find(x => norm(x.keyword) === norm(main) + k || norm(x.keyword) === k + norm(main));   // "강아지오메가3영양제" → 영양제 검색량
    const vol = v?.total ?? 0;
    const score = bonus + st.t10 * 300 + st.t30 * 60 + st.all * 5 + Math.round(vol / 20);
    if (!pool[k] || pool[k].score < score) pool[k] = { word, score, vol, t10: st.t10, src: pool[k]?.src ?? src, effect: isEffect(word) };
  };
  must.forEach(w => add(w, '필수', 100000));
  optional.forEach(w => add(w, '후보', 500));
  Object.entries(ws).filter(([, c]) => c.t10 >= 2 || c.t30 >= 5).forEach(([w]) => add(w, '상위권'));
  vols.forEach(v => { const rest = norm(v.keyword).replace(norm(main), ''); if (rest.length >= 2 && rest.length <= 8 && norm(v.keyword).length > norm(main).length) add(rest, '검색량'); });
  return Object.values(pool).sort((a, b) => b.score - a.score);
}

/** 단어를 순서대로 붙여 50자 안으로 조립. 포함 관계 중복 제거 */
function assemble(head: string[], rest: Cand[], maxLen = MAX_LEN) {
  const parts: string[] = [...head]; const used = parts.map(norm);
  let eff = head.filter(isEffect).length;
  for (const c of rest) {
    const k = norm(c.word); if (used.some(u => u === k || u.includes(k) || k.includes(u))) continue;
    if (c.effect && c.src !== '필수') { if (eff >= 3) continue; eff++; }
    const next = [...parts, c.word].join(' '); if (next.length > maxLen) continue;
    parts.push(c.word); used.push(k);
  }
  return parts.join(' ');
}

export type NameReq = { brand: string; main: string; must: string; optional: string; note: string };
export type Draft = { label: string; name: string; len: number; warn: string[] };

/** 코드로 3안 즉시 조립 + AI 검토 지시(짧게) 접수 */
export async function requestName(req: NameReq): Promise<R<{ id: number; drafts: Draft[] }>> {
  const me = await getProfile(); if (!me || !me.is_active) return { ok: false, msg: '로그인 필요' };
  const brand = req.brand.trim().slice(0, 40), main = req.main.trim().slice(0, 40);
  if (!brand || !main) return { ok: false, msg: '브랜드와 메인 키워드는 필수입니다.' };
  const must = req.must.trim().split(/[\s,]+/).filter(Boolean).slice(0, 10), optional = req.optional.trim().split(/[\s,]+/).filter(Boolean).slice(0, 15), note = req.note.trim().slice(0, 300);
  const sb = supabaseAdmin();
  const start = new Date(`${todayKST()}T00:00:00+09:00`).toISOString();
  const { count } = await sb.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('requested_by_id', me.id).like('title', `${TITLE_PREFIX}%`).gte('created_at', start);
  const max = DAILY[me.role] ?? 5; if ((count ?? 0) >= max) return { ok: false, msg: `오늘 상품명 요청 한도(${max}건)를 다 썼습니다.` };

  // 1) 검색광고 월 검색수
  let vols: KwVol[] = []; let volNote = '';
  if (adConfigured()) {
    try { const all = await keywordVolumes([main, main.replace(/\s+/g, '')]); const core = tokens(main).map(norm); vols = all.filter(k => core.every(t => norm(k.keyword).includes(t))).slice(0, 40); if (vols.length < 10) vols = all.filter(k => core.some(t => norm(k.keyword).includes(t))).slice(0, 40); }
    catch (e: any) { volNote = `검색광고 API 실패: ${e.message}`; }
  } else volNote = '검색광고 API 미설정';
  // 2) 시크릿 지수 상위 100 상품명
  let titles: string[] = []; let malls: string[] = []; let nscNote = '';
  try { const r = await search(main, me.id); titles = r.products.map(p => p.productTitle); malls = r.products.map(p => p.mallName).filter(Boolean); } catch (e: any) { nscNote = `시크릿 지수 실패: ${e.message}`; }
  const ws = wordStats(titles);
  // 메인 키워드 띄어쓰기: 상위 100에서 더 많이 쓰는 쪽
  const joined = norm(main); const spaced = main.replace(/\s+/g, ' ');
  const cntJoin = titles.filter(t => t.replace(/\s+/g, '').toLowerCase().includes(joined) && t.toLowerCase().includes(joined)).length;
  const cntSpace = titles.filter(t => t.toLowerCase().includes(spaced.toLowerCase())).length;
  const mainForm = spaced.includes(' ') && cntJoin > cntSpace ? joined : spaced;

  const cands = candidates(main, brand, must, optional, vols, ws, malls);
  const mustC = cands.filter(c => c.src === '필수'); const others = cands.filter(c => c.src !== '필수');
  const byVol = [...others].sort((a, b) => b.vol - a.vol || b.score - a.score);
  const mk = (label: string, head: string[], rest: Cand[]): Draft => { const name = assemble(head, [...mustC, ...rest]); const used = tokens(name).filter(isEffect); return { label, name, len: name.length, warn: used.length ? [`효능·부위 단어 ${used.join(' ')} — 심의 위험 ${used.every(w => (ws[w.toLowerCase()]?.t10 ?? 0) >= 3) ? '낮음(상위10 흔히 사용)' : '있음'}`] : [] }; };
  const drafts: Draft[] = [
    mk('① 메인 키워드 앞', [mainForm, brand], others),
    mk('② 브랜드 앞', [brand, mainForm], others),
    mk('③ 검색량 우선', [mainForm, brand], byVol),
  ];

  // AI 검토 지시 — 짧게. 초안 + 단어표 핵심만
  const L: string[] = [];
  L.push(`스마트스토어 상품명 초안 3개를 검토해 주세요. 코드 실행·파일 작성 없이 글로만, 전체 500자 이내. (요청: ${me.name})`);
  L.push(''); L.push('[초안]'); drafts.forEach(d => L.push(`${d.label}: ${d.name} (${d.len}자)`));
  L.push(''); L.push(`브랜드 ${brand} · 메인 키워드 ${main}${must.length ? ' · 꼭 들어갈 단어 ' + must.join(' ') : ''}${note ? ' · 메모: ' + note : ''}`);
  L.push(''); L.push('할 일');
  L.push('- 상품과 관련 없거나 중복·어색한 단어만 빼거나 순서를 고친다. 브랜드·메인 키워드·꼭 들어갈 단어는 유지, 새 단어 추가는 아래 표에 있는 것만');
  L.push('- 공백 포함 50자 이내 유지. 효능·부위 단어가 있으면 한 줄로 심의 위험만 적는다');
  L.push('- 답 형식: 안별로 "①: 상품명 (NN자)" 한 줄 + 고친 이유 한 줄. 마지막에 추천 1안과 태그 후보 10개');
  L.push(''); L.push(`[단어 후보 — 단어 / 상위10 중 사용 / 월 검색수(메인+단어)]${volNote ? ' ' + volNote : ''}${nscNote ? ' ' + nscNote : ''}`);
  cands.slice(0, 25).forEach(c => L.push(`${c.word}\t${c.t10}\t${c.vol || '-'}\t${c.src}`));
  L.push(''); L.push('[상위 5 상품명]'); titles.slice(0, 5).forEach((t, i) => L.push(`${i + 1}. ${t}`));
  const instruction = L.join('\n').slice(0, 6000);

  const { data, error } = await sb.from('ai_tasks')
    .insert({ kind: 'order', agent: 'chief', title: `${TITLE_PREFIX} ${brand} ${main}`.slice(0, 80), instruction, source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' })
    .select('id').single();
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/product-name');
  return { ok: true, msg: `초안 3개 완성 · AI 검토 #${data.id} 접수`, id: data.id, drafts };
}

/** 결과 고쳐 달라고 하기 (끝난 요청만) */
export async function reviseName(id: number, feedback: string): Promise<R<{ id: number }>> {
  const me = await getProfile(); if (!me || !me.is_active) return { ok: false, msg: '로그인 필요' };
  const text = feedback.trim().slice(0, 1000); if (!id || !text) return { ok: false, msg: '고칠 내용을 입력하세요.' };
  const sb = supabaseAdmin();
  const { data: base } = await sb.from('ai_tasks').select('id,title,status,requested_by_id').eq('id', id).maybeSingle();
  if (!base || !String(base.title).startsWith(TITLE_PREFIX)) return { ok: false, msg: '상품명 요청이 아닙니다.' };
  if (base.requested_by_id !== me.id && !['admin', 'head'].includes(me.role)) return { ok: false, msg: '내 요청만 고칠 수 있습니다.' };
  if (!['done', 'rejected', 'failed'].includes(base.status)) return { ok: false, msg: '끝난 요청에만 가능합니다.' };
  const { data, error } = await sb.from('ai_tasks')
    .insert({ kind: 'order', agent: 'chief', title: `${TITLE_PREFIX} 수정 #${id}: ${String(base.title).replace(TITLE_PREFIX, '').trim().slice(0, 50)}`, instruction: JSON.stringify({ revise_of: id, feedback: text }), source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' })
    .select('id').single();
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/product-name');
  return { ok: true, msg: `수정 요청 #${data.id} 접수`, id: data.id };
}

/** 요청 삭제 — 내 것(총괄·대표는 전부). 진행 중이면 취소 후 삭제 */
export async function removeName(id: number): Promise<R> {
  const me = await getProfile(); if (!me || !me.is_active) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin();
  const { data: base } = await sb.from('ai_tasks').select('id,title,requested_by_id').eq('id', id).maybeSingle();
  if (!base || !String(base.title).startsWith(TITLE_PREFIX)) return { ok: false, msg: '상품명 요청이 아닙니다.' };
  if (base.requested_by_id !== me.id && !['admin', 'head'].includes(me.role)) return { ok: false, msg: '내 요청만 지울 수 있습니다.' };
  await sb.from('ai_tasks').delete().eq('parent_id', id);
  const { error } = await sb.from('ai_tasks').delete().eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/product-name');
  return { ok: true, msg: `#${id} 삭제됨` };
}
