'use server';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
type R<T = {}> = ({ ok: true; msg: string } & T) | { ok: false; msg: string };
export type KwCount = { keyword: string; n: number; open: number };
export type Contact = { id: number; store_name: string; store_url: string; company: string; rep: string; email: string; phone: string; address: string; biz_no: string; keywords: string[]; claimed_by: string | null; claimed_name: string; result: string; memo: string; result_at: string | null };
const KW_RESULTS = ['부재', '관심', '재연락', '거절', '계약'];   // 'use server' 파일은 async 함수만 export 가능
const needSql = (m: string) => /kw_contact/.test(m) ? '0086 SQL(kw_contacts 표)을 먼저 실행해 주세요' : m;
const active = async () => { const me = await getProfile(); return me && me.is_active ? me : null; };

export async function kwKeywords(): Promise<R<{ list: KwCount[] }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { data, error } = await supabaseAdmin().rpc('kw_contact_keywords'); if (error) return { ok: false, msg: needSql(error.message) };
  return { ok: true, msg: '', list: (data ?? []) as KwCount[] };
}
export async function kwContacts(keyword: string): Promise<R<{ rows: Contact[] }>> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('kw_contacts').select('id,store_name,store_url,company,rep,email,phone,address,biz_no,keywords,claimed_by,result,memo,result_at').contains('keywords', [keyword]).order('result', { ascending: true }).order('id', { ascending: true }).limit(1000);
  if (error) return { ok: false, msg: needSql(error.message) };
  const ids = Array.from(new Set((data ?? []).map(r => r.claimed_by).filter(Boolean))) as string[];
  const names = new Map<string, string>(); if (ids.length) { const { data: ps } = await sb.from('profiles').select('id,name').in('id', ids); for (const p of ps ?? []) names.set(p.id, p.name); }
  return { ok: true, msg: '', rows: (data ?? []).map(r => ({ ...r, claimed_name: r.claimed_by ? names.get(r.claimed_by) ?? '' : '' })) as Contact[] };
}
/** 연락 결과·메모 저장 — 처음 남긴 사람이 담당. 다른 사람이 담당인 건은 총괄·어드민만 고칠 수 있음. 결과를 비우면 담당도 풀림 */
export async function kwSetResult(id: number, result: string, memo: string): Promise<R> {
  const me = await active(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (result && !KW_RESULTS.includes(result)) return { ok: false, msg: '결과 값이 올바르지 않습니다' };
  const sb = supabaseAdmin(); const { data: cur, error } = await sb.from('kw_contacts').select('claimed_by').eq('id', id).maybeSingle();
  if (error) return { ok: false, msg: needSql(error.message) }; if (!cur) return { ok: false, msg: '없는 업체' };
  const boss = me.role === 'head' || me.role === 'admin';
  if (cur.claimed_by && cur.claimed_by !== me.id && !boss) return { ok: false, msg: '다른 직원이 담당 중인 업체입니다' };
  const m = String(memo ?? '').slice(0, 500); const clear = !result && !m;
  const { error: e2 } = await sb.from('kw_contacts').update({ result, memo: m, claimed_by: clear ? null : (cur.claimed_by && !boss ? cur.claimed_by : cur.claimed_by ?? me.id), result_at: clear ? null : new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
  return e2 ? { ok: false, msg: e2.message } : { ok: true, msg: clear ? '담당 해제' : '저장됨' };
}
/** 추출기 CSV → 키워드 콜 리스트 (총괄만 올림). 화면이 1,000행씩 나눠 부른다 */
export async function kwImport(rows: Record<string, string>[]): Promise<R<{ added: number; updated: number; skipped: number }>> {
  const me = await active(); if (!me || me.role !== 'head') return { ok: false, msg: '총괄만' };
  const s = (x: unknown, n: number) => String(x ?? '').trim().slice(0, n);
  const clean = (rows ?? []).slice(0, 1000).map(r => ({ store_name: s(r.store_name, 100), store_url: s(r.store_url, 300), keyword: s(r.keyword, 60), company: s(r.company, 100), rep: s(r.rep, 40), email: s(r.email, 120).toLowerCase(), phone: s(r.phone, 30).replace(/[^\d-]/g, ''), address: s(r.address, 200), biz_no: s(r.biz_no, 20) }));
  const { data, error } = await supabaseAdmin().rpc('kw_contacts_import', { p_rows: clean }); if (error) return { ok: false, msg: needSql(error.message) };
  const d = (data ?? {}) as { added?: number; updated?: number; skipped?: number };
  return { ok: true, msg: '', added: d.added ?? 0, updated: d.updated ?? 0, skipped: d.skipped ?? 0 };
}
