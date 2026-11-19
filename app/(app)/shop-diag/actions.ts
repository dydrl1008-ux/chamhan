'use server';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runDiag, type Diag } from '@/lib/shopDiag';
type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
export type Prices = { shop: number; place: number };
const DEF: Prices = { shop: 35000, place: 40000 };
const KEY = 'shop_diag_prices';
async function prices(): Promise<Prices> { const { data } = await supabaseAdmin().from('app_settings').select('value').eq('key', KEY).maybeSingle(); try { const j = JSON.parse(String(data?.value ?? '')); return { shop: Number(j.shop) || DEF.shop, place: Number(j.place) || DEF.place }; } catch { return DEF; } }

export async function sdRun(v: { url: string; keywords: string; name: string; honor: string }): Promise<R<{ diag: Diag }>> {
  const me = await getProfile(); if (!me || !me.is_active) return { ok: false, msg: '로그인 필요' };
  try { const diag = await runDiag({ url: v.url, keywords: String(v.keywords ?? '').split(/[,\n]+/), name: v.name, honor: v.honor }, me.id); return { ok: true, msg: `진단 완료${diag.lookups ? ` · 새 조회 ${diag.lookups}회` : ' · 캐시 사용'}`, diag }; }
  catch (e: any) { return { ok: false, msg: String(e?.message ?? e).slice(0, 200) }; }
}
export async function sdPrices(): Promise<Prices> { const me = await getProfile(); if (!me) return DEF; return prices(); }
export async function sdSavePrices(p: Prices): Promise<R> {
  const me = await getProfile(); if (!me || me.role !== 'head') return { ok: false, msg: '총괄만' };
  const v = { shop: Math.max(0, Math.round(Number(p.shop) || 0)), place: Math.max(0, Math.round(Number(p.place) || 0)) }; if (!v.shop || !v.place) return { ok: false, msg: '단가를 숫자로 적어 주세요' };
  const { error } = await supabaseAdmin().from('app_settings').upsert({ key: KEY, value: JSON.stringify(v), updated_at: new Date().toISOString() });
  return error ? { ok: false, msg: error.message } : { ok: true, msg: '단가 저장됨' };
}
