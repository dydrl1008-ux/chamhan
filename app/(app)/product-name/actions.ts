'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { search } from '@/lib/nsc';
import { keywordVolumes, adConfigured, type KwVol } from '@/lib/naverAd';
import { todayKST } from '@/lib/date/kst';

type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
import { TITLE_PREFIX } from './shared';
const DAILY = { staff: 5, manager: 20, head: 50, admin: 50 } as Record<string, number>;

const tokens = (s: string) => s.replace(/[\[\]()（）,·/|+★☆※"'“”‘’]/g, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2 && !/^\d+(개|개입|입|g|ml|mg|kg|%)?$/i.test(t) && !/^x\d/i.test(t));

/** 상위 100 상품명 단어 빈도 (상위10 / 상위30 / 전체) */
function wordStats(titles: string[]) {
  const c: Record<string, { t10: number; t30: number; all: number }> = {};
  titles.forEach((t, i) => { const seen = new Set(tokens(t).map(x => x.toLowerCase())); seen.forEach(w => { const e = (c[w] ??= { t10: 0, t30: 0, all: 0 }); e.all++; if (i < 30) e.t30++; if (i < 10) e.t10++; }); });
  return Object.entries(c).sort((a, b) => b[1].t10 - a[1].t10 || b[1].t30 - a[1].t30 || b[1].all - a[1].all).slice(0, 40);
}

export type NameReq = { brand: string; main: string; must: string; optional: string; note: string };

/** 데이터 모아서 AI팀 지시로 넣기 — 직원도 가능 (이 화면 한정, 하루 한도) */
export async function requestName(req: NameReq): Promise<R<{ id: number }>> {
  const me = await getProfile(); if (!me || !me.is_active) return { ok: false, msg: '로그인 필요' };
  const brand = req.brand.trim().slice(0, 40), main = req.main.trim().slice(0, 40);
  if (!brand || !main) return { ok: false, msg: '브랜드와 메인 키워드는 필수입니다.' };
  const must = req.must.trim().slice(0, 200), optional = req.optional.trim().slice(0, 200), note = req.note.trim().slice(0, 500);
  const sb = supabaseAdmin();
  const start = new Date(`${todayKST()}T00:00:00+09:00`).toISOString();
  const { count } = await sb.from('ai_tasks').select('id', { count: 'exact', head: true }).eq('requested_by_id', me.id).like('title', `${TITLE_PREFIX}%`).gte('created_at', start);
  const max = DAILY[me.role] ?? 5; if ((count ?? 0) >= max) return { ok: false, msg: `오늘 상품명 요청 한도(${max}건)를 다 썼습니다.` };

  // 1) 검색광고 월 검색수 — 메인 키워드 + 메인 키워드 단어들 관련만
  let vols: KwVol[] = []; let volNote = '';
  if (adConfigured()) {
    try {
      const all = await keywordVolumes([main, main.replace(/\s+/g, '')]);
      const core = tokens(main).map(t => t.toLowerCase());
      vols = all.filter(k => core.every(t => k.keyword.toLowerCase().includes(t.replace(/\s+/g, ''))) || k.keyword.replace(/\s+/g, '') === main.replace(/\s+/g, '')).slice(0, 30);
      if (vols.length < 10) vols = all.filter(k => core.some(t => k.keyword.toLowerCase().includes(t.replace(/\s+/g, '')))).slice(0, 30);
    } catch (e: any) { volNote = `검색광고 API 실패: ${e.message}`; }
  } else volNote = '검색광고 API 미설정 (Vercel 환경변수 NAVER_AD_*)';

  // 2) 시크릿 지수 상위 100 상품명 (24h 캐시 우선)
  let titles: string[] = []; let bar = ''; let nscNote = '';
  try { const r = await search(main, me.id); titles = r.products.map(p => p.productTitle); const eb = r.entry_bar; if (eb) bar = JSON.stringify(eb).slice(0, 600); }
  catch (e: any) { nscNote = `시크릿 지수 실패: ${e.message}`; }
  const ws = wordStats(titles);

  const lines: string[] = [];
  lines.push(`네이버 스마트스토어 상품명 3안을 만들어 주세요. (요청: ${me.name})`);
  lines.push('');
  lines.push(`브랜드: ${brand}`); lines.push(`메인 키워드: ${main}`);
  if (must) lines.push(`꼭 들어갈 단어: ${must}`);
  if (optional) lines.push(`넣을지 판단할 단어(후보): ${optional}`);
  if (note) lines.push(`요청 메모: ${note}`);
  lines.push('');
  lines.push('규칙');
  lines.push('- 공백 포함 50자 이내. 각 안마다 글자수를 파이썬 len()으로 실제로 세서 "(NN자)"로 표기할 것. 머리로 세지 말 것');
  lines.push('- 같은 단어 두 번 금지(예: 캡슐 2회). 특수문자·괄호·쉼표 없이 띄어쓰기만');
  lines.push('- 메인 키워드와 브랜드는 반드시 포함. 메인 키워드는 상위 100 상품명에서 많이 쓰는 띄어쓰기 형태로');
  lines.push('- 질병·부위·효능 단어(관절 피부 심장 신장 눈물 백내장 등)는 넣더라도 안별로 "심의 위험" 한 줄 경고. 상위 10이 흔히 쓰는 단어는 위험 낮음으로 표시');
  lines.push('- 남는 글자는 검색량 있는 서브 키워드·수량·용량·대상(소형견 등)으로 채우되, 상품과 관련 없는 단어는 금지');
  lines.push('- 3안 구성: ① 메인 키워드 맨 앞 ② 브랜드 맨 앞 ③ 검색량 최대로 채운 안. 각 안 아래에 포함 단어별 월 검색수(아래 표 기준)와 상위10 사용 개수 한 줄');
  lines.push('- 마지막에 추천 1안과 이유 두 줄. 태그로 뺄 단어 10개 제안');
  lines.push('');
  lines.push(`[검색광고 월 검색수 (PC+모바일), 메인 키워드 관련 ${vols.length}개]${volNote ? ' ' + volNote : ''}`);
  vols.forEach(v => lines.push(`${v.keyword}\t${v.total.toLocaleString()} (PC ${v.pc.toLocaleString()} / M ${v.mobile.toLocaleString()})`));
  lines.push('');
  lines.push(`[시크릿 지수 「${main}」 상위 100 상품명 단어 빈도 — 단어 / 상위10 중 / 상위30 중 / 100 중]${nscNote ? ' ' + nscNote : ''}`);
  ws.forEach(([w, c]) => lines.push(`${w}\t${c.t10}\t${c.t30}\t${c.all}`));
  if (bar) { lines.push(''); lines.push(`[진입 기준선] ${bar}`); }
  lines.push('');
  lines.push('[상위 10 상품명]');
  titles.slice(0, 10).forEach((t, i) => lines.push(`${i + 1}. ${t}`));

  const instruction = lines.join('\n').slice(0, 12000);
  const { data, error } = await sb.from('ai_tasks')
    .insert({ kind: 'order', agent: 'chief', title: `${TITLE_PREFIX} ${brand} ${main}`.slice(0, 80), instruction, source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' })
    .select('id').single();
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/product-name');
  return { ok: true, msg: `요청 #${data.id} 접수 — 보통 1~3분 안에 결과가 뜹니다.`, id: data.id };
}

/** 결과 고쳐 달라고 하기 (끝난 요청만) */
export async function reviseName(id: number, feedback: string): Promise<R<{ id: number }>> {
  const me = await getProfile(); if (!me || !me.is_active) return { ok: false, msg: '로그인 필요' };
  const text = feedback.trim().slice(0, 1000); if (!id || !text) return { ok: false, msg: '고칠 내용을 입력하세요.' };
  const sb = supabaseAdmin();
  const { data: base } = await sb.from('ai_tasks').select('id,title,status,requested_by_id').eq('id', id).maybeSingle();
  if (!base || !String(base.title).startsWith(TITLE_PREFIX)) return { ok: false, msg: '상품명 요청이 아닙니다.' };
  if (base.requested_by_id !== me.id && !['admin', 'head'].includes(me.role)) return { ok: false, msg: '내 요청만 고칠 수 있습니다.' };
  if (!['done', 'rejected'].includes(base.status)) return { ok: false, msg: '끝난 요청에만 가능합니다.' };
  const { data, error } = await sb.from('ai_tasks')
    .insert({ kind: 'order', agent: 'chief', title: `${TITLE_PREFIX} 수정 #${id}: ${String(base.title).replace(TITLE_PREFIX, '').trim().slice(0, 50)}`, instruction: JSON.stringify({ revise_of: id, feedback: text }), source: 'workhub', requested_by: me.name, requested_by_id: me.id, status: 'queued' })
    .select('id').single();
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/product-name');
  return { ok: true, msg: `수정 요청 #${data.id} 접수`, id: data.id };
}
