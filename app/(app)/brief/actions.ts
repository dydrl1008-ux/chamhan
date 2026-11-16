'use server';
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { canBrief, fixBuckets, toBrief, summarize, type BriefRow, type Buckets, type BriefKw, type BriefSummary } from '@/lib/brief';

type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
const KEY = 'brief_buckets';
async function loadBuckets(): Promise<Buckets> {
  const { data } = await supabaseAdmin().from('app_settings').select('value').eq('key', KEY).maybeSingle();
  try { return fixBuckets(typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value); } catch { return fixBuckets(null); }
}

/** 화면용 데이터 — 구간으로 바꾼 것만 내려보낸다 (원본 슬롯 수·순위는 서버에만) */
export async function getBrief(): Promise<R<{ list: BriefKw[]; buckets: Buckets; at: string | null; n: number; summary: BriefSummary | null }>> {
  const me = await getProfile(); if (!me || !canBrief(me)) return { ok: false, msg: '권한 없음' };
  const sb = supabaseAdmin(); const buckets = await loadBuckets();
  const { data, error } = await sb.from('sales_brief').select('rows,n,uploaded_at').order('uploaded_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return { ok: false, msg: /sales_brief/.test(error.message) ? '0081 SQL(sales_brief 표)을 먼저 실행해 주세요' : error.message };
  const rows = (data?.rows ?? []) as BriefRow[];
  return { ok: true, msg: '', list: toBrief(rows, buckets), buckets, at: data?.uploaded_at ?? null, n: data?.n ?? 0, summary: rows.length ? summarize(rows, buckets) : null };
}

/** 셀팜 화면에서 읽은 행 저장 (최신 1건이 쓰이고, 14일 지난 것은 지움) */
export async function saveBrief(rows: BriefRow[]): Promise<R> {
  const me = await getProfile(); if (!me || !canBrief(me)) return { ok: false, msg: '권한 없음' };
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : null);
  const clean = (Array.isArray(rows) ? rows : []).slice(0, 20000).map(r => ({ k: String(r?.k ?? '').trim().slice(0, 60), v: num(r?.v), s: num(r?.s), r: num(r?.r), b: num(r?.b), d: num(r?.d), p: num(r?.p) })).filter(r => r.k);
  if (!clean.length) return { ok: false, msg: '읽힌 행이 없습니다 — 셀팜 「슬롯 운영」 화면 전체를 복사했는지 확인해 주세요' };
  const sb = supabaseAdmin();
  const { error } = await sb.from('sales_brief').insert({ rows: clean, n: clean.length, uploaded_by: me.id });
  if (error) return { ok: false, msg: /sales_brief/.test(error.message) ? '0081 SQL(sales_brief 표)을 먼저 실행해 주세요' : error.message };
  await sb.from('sales_brief').delete().lt('uploaded_at', new Date(Date.now() - 14 * 86400e3).toISOString());
  revalidatePath('/brief');
  return { ok: true, msg: `${clean.length}건 · 키워드 ${new Set(clean.map(r => r.k)).size}개 반영` };
}

export async function saveBuckets(b: Buckets): Promise<R> {
  const me = await getProfile(); if (!me || !canBrief(me)) return { ok: false, msg: '권한 없음' };
  const v = fixBuckets(b);
  const { error } = await supabaseAdmin().from('app_settings').upsert({ key: KEY, value: JSON.stringify(v), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/brief'); return { ok: true, msg: '구간 저장됨' };
}
