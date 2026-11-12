'use server';
// 견적서 저장·목록 (본인 것만, 총괄·대표는 전체) + 공급자 기본값(ai_settings.quote_supplier)
import { revalidatePath } from 'next/cache';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';

import { DEFAULT_SUPPLIERS, type QData, type QRow, type Suppliers } from '@/lib/quote';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
const lead = (me: { role: string }) => me.role === 'admin' || me.role === 'head';

export async function listQuotes(): Promise<R<{ rows: QRow[]; suppliers: Suppliers; canEditSupplier: boolean }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin();
  let q = sb.from('quotes').select('id,title,total,updated_at,data,owner_id').order('updated_at', { ascending: false }).limit(200); if (!lead(me)) q = q.eq('owner_id', me.id);
  const { data, error } = await q; if (error) return { ok: false, msg: error.message.includes('quotes') ? '견적서 테이블이 없습니다 — SQL 0079 를 먼저 실행하세요' : error.message };
  const ids = [...new Set((data ?? []).map(r => r.owner_id))]; const { data: ps } = ids.length ? await sb.from('profiles').select('id,name').in('id', ids) : { data: [] as any[] };
  const nm = new Map((ps ?? []).map((p: any) => [p.id, p.name as string]));
  const { data: st } = await sb.from('ai_settings').select('value').eq('key', 'quote_supplier').maybeSingle();
  let suppliers = DEFAULT_SUPPLIERS; try { if (st?.value) { const j = JSON.parse(String(st.value)); suppliers = { main: { ...DEFAULT_SUPPLIERS.main, ...(j.main ?? {}) }, adfree: { ...DEFAULT_SUPPLIERS.adfree, ...(j.adfree ?? {}) }, novat: { ...DEFAULT_SUPPLIERS.novat, ...(j.novat ?? {}) } }; } } catch { /* 기본값 */ }
  return { ok: true, msg: '', rows: (data ?? []).map(r => ({ id: r.id, title: r.title, total: Number(r.total), updated_at: r.updated_at, owner: nm.get(r.owner_id) ?? '', data: r.data as QData })), suppliers, canEditSupplier: lead(me) };
}
export async function saveQuote(id: number | null, data: QData, total: number): Promise<R<{ id: number }>> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin(); const title = (data.client || '견적서').slice(0, 80); const row = { title, data, total: Math.round(total) || 0, updated_at: new Date().toISOString() };
  if (id) {
    const { data: ex } = await sb.from('quotes').select('owner_id').eq('id', id).maybeSingle(); if (!ex) return { ok: false, msg: '없는 견적서' };
    if (ex.owner_id !== me.id && !lead(me)) return { ok: false, msg: '본인 견적서만 수정할 수 있습니다' };
    const { error } = await sb.from('quotes').update(row).eq('id', id); if (error) return { ok: false, msg: error.message };
    revalidatePath('/quotes'); return { ok: true, msg: '저장됨', id };
  }
  const { data: ins, error } = await sb.from('quotes').insert({ ...row, owner_id: me.id }).select('id').single(); if (error) return { ok: false, msg: error.message };
  revalidatePath('/quotes'); return { ok: true, msg: '저장됨', id: ins.id };
}
export async function deleteQuote(id: number): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin(); const { data: ex } = await sb.from('quotes').select('owner_id').eq('id', id).maybeSingle(); if (!ex) return { ok: false, msg: '없는 견적서' };
  if (ex.owner_id !== me.id && !lead(me)) return { ok: false, msg: '본인 견적서만 삭제할 수 있습니다' };
  const { error } = await sb.from('quotes').delete().eq('id', id); if (error) return { ok: false, msg: error.message };
  revalidatePath('/quotes'); return { ok: true, msg: '삭제됨' };
}
export async function saveSuppliers(s: Suppliers): Promise<R> {
  const me = await getProfile(); if (!me || !lead(me)) return { ok: false, msg: '총괄·대표만' };
  const { error } = await supabaseAdmin().from('ai_settings').upsert({ key: 'quote_supplier', value: JSON.stringify(s), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { ok: false, msg: error.message }; revalidatePath('/quotes'); return { ok: true, msg: '공급자 정보 저장됨' };
}
