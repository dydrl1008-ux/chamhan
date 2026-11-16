'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { canBrief, canBriefEdit, fixBuckets, toBrief, summarize, type BriefRow, type Buckets, type BriefKw, type BriefSummary } from '@/lib/brief';

type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
const KEY = 'brief_buckets';
async function loadBuckets(): Promise<Buckets> {
  const { data } = await supabaseAdmin().from('app_settings').select('value').eq('key', KEY).maybeSingle();
  try { return fixBuckets(typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value); } catch { return fixBuckets(null); }
}

/** 화면용 데이터 — 구간으로 바꾼 것만 내려보낸다 (원본 슬롯 수·순위는 서버에만) */
export async function getBrief(): Promise<R<{ list: BriefKw[]; buckets: Buckets; at: string | null; n: number; summary: BriefSummary | null; refs: BriefRef[] }>> {
  const me = await getProfile(); if (!me || !canBrief(me)) return { ok: false, msg: '권한 없음' };
  const sb = supabaseAdmin(); const buckets = await loadBuckets();
  const { data, error } = await sb.from('sales_brief').select('rows,n,uploaded_at').order('uploaded_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return { ok: false, msg: /sales_brief/.test(error.message) ? '0081 SQL(sales_brief 표)을 먼저 실행해 주세요' : error.message };
  const rows = (data?.rows ?? []) as BriefRow[];
  // 내 레퍼런스(직접 적은 건)는 본인 것만 — 키워드 브리핑에는 셀팜 건과 똑같이 구간으로 섞여 나오고, 전체 비율 계산에는 넣지 않는다
  const { data: rf } = await sb.from('brief_refs').select('id,keyword,vol,slots,rank_now,up').eq('owner_id', me.id).order('id', { ascending: false }).limit(500);
  const refs = (rf ?? []) as BriefRef[];
  const mine: BriefRow[] = refs.map(r => ({ k: r.keyword, v: r.vol, s: r.slots, r: r.rank_now, b: null, d: r.up ?? 0 }));
  return { ok: true, msg: '', refs, list: toBrief([...mine, ...rows], buckets), buckets, at: data?.uploaded_at ?? null, n: data?.n ?? 0, summary: rows.length ? summarize(rows, buckets) : null };
}

/** 셀팜 화면에서 읽은 행 저장 (최신 1건이 쓰이고, 14일 지난 것은 지움) */
export async function saveBrief(rows: BriefRow[]): Promise<R> {
  const me = await getProfile(); if (!me || !canBriefEdit(me)) return { ok: false, msg: '권한 없음' };
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : null);
  const clean = (Array.isArray(rows) ? rows : []).slice(0, 20000).map(r => ({ k: String(r?.k ?? '').trim().slice(0, 60), v: num(r?.v), s: num(r?.s), r: num(r?.r), b: num(r?.b), d: num(r?.d), p: num(r?.p) })).filter(r => r.k);
  if (!clean.length) return { ok: false, msg: '읽힌 행이 없습니다 — 셀팜 「슬롯 운영」 화면 전체를 복사했는지 확인해 주세요' };
  const sb = supabaseAdmin();
  const { error } = await sb.from('sales_brief').insert({ rows: clean, n: clean.length, uploaded_by: me.id });
  if (error) return { ok: false, msg: /sales_brief/.test(error.message) ? '0081 SQL(sales_brief 표)을 먼저 실행해 주세요' : error.message };
  await sb.from('sales_brief').delete().lt('uploaded_at', new Date(Date.now() - 14 * 86400e3).toISOString());
  revalidatePath('/brief');
  return { ok: true, msg: '진행 현황 반영됨' };
}

export type BriefRef = { id: number; keyword: string; vol: number | null; slots: number | null; rank_now: number | null; up: number | null };
export async function addRef(i: { keyword: string; vol?: number | null; slots?: number | null; rank?: number | null; up?: number | null }): Promise<R> {
  const me = await getProfile(); if (!me || !canBrief(me)) return { ok: false, msg: '권한 없음' };
  const kw = String(i.keyword ?? '').trim().replace(/\s+/g, ' ').slice(0, 60); if (!kw) return { ok: false, msg: '키워드를 적어 주세요' };
  const n = (x: unknown) => { const v = Math.round(Number(x)); return Number.isFinite(v) && v > 0 ? v : null; };
  if (!n(i.rank)) return { ok: false, msg: '현재 순위를 적어 주세요' };
  const { error } = await supabaseAdmin().from('brief_refs').insert({ owner_id: me.id, keyword: kw, vol: n(i.vol), slots: n(i.slots), rank_now: n(i.rank), up: n(i.up) });
  if (error) return { ok: false, msg: /brief_refs/.test(error.message) ? '0082 SQL(brief_refs 표)을 먼저 실행해 주세요' : error.message };
  revalidatePath('/brief'); return { ok: true, msg: '레퍼런스 추가됨' };
}
export async function delRef(id: number): Promise<R> {
  const me = await getProfile(); if (!me || !canBrief(me)) return { ok: false, msg: '권한 없음' };
  const { error } = await supabaseAdmin().from('brief_refs').delete().eq('id', id).eq('owner_id', me.id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/brief'); return { ok: true, msg: '삭제됨' };
}

export async function saveBuckets(b: Buckets): Promise<R> {
  const me = await getProfile(); if (!me || !canBriefEdit(me)) return { ok: false, msg: '권한 없음' };
  const v = fixBuckets(b);
  const { error } = await supabaseAdmin().from('app_settings').upsert({ key: KEY, value: JSON.stringify(v), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/brief'); return { ok: true, msg: '구간 저장됨' };
}
