'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
// 상품(products)은 총괄도 편집 — RLS가 어드민 전용이라 권한 확인 후 admin 클라이언트 사용
const rolesFor = (t: string): ('admin' | 'head')[] => t === 'products' ? ['admin', 'head'] : ['admin'];
const clientFor = (t: string) => t === 'products' ? supabaseAdmin() : supabaseServer();
const ALLOWED = ['products', 'promotions', 'mgmt_duties', 'assets_businesses', 'assets_phones', 'pnl_categories'] as const;
type T = typeof ALLOWED[number];
const num = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return s === '' ? null : Number(s.replace(/,/g, '')); };
/** fd 의 필드를 row 로 변환. numeric 키는 숫자, empty 는 null */
export async function upsertRow(table: T, fd: FormData, numeric: string[], paths: string[]): Promise<{ ok: boolean; msg: string }> {
  await requireRole(rolesFor(table)); if (!ALLOWED.includes(table)) return { ok: false, msg: 'bad table' };
  const row: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) { if (k === 'id' || k.startsWith('$')) continue; row[k] = numeric.includes(k) ? num(v) : (String(v).trim() === '' ? null : String(v)); }
  if ('is_active' in row) row.is_active = String(fd.get('is_active')) === 'on'; else if (fd.get('$has_active')) row.is_active = false;
  const id = fd.get('id') ? Number(fd.get('id')) : null; const sb = clientFor(table);
  const { error } = id ? await sb.from(table).update(row).eq('id', id) : await sb.from(table).insert(row);
  if (error) return { ok: false, msg: error.message }; paths.forEach(p => revalidatePath(p)); return { ok: true, msg: id ? '수정됨' : '추가됨' };
}
export async function deactivateRow(table: T, id: number, paths: string[]): Promise<{ ok: boolean; msg: string }> {
  await requireRole(rolesFor(table)); if (!ALLOWED.includes(table)) return { ok: false, msg: 'bad table' };
  const { error } = await clientFor(table).from(table).update({ is_active: false }).eq('id', id);
  if (error) return { ok: false, msg: error.message }; paths.forEach(p => revalidatePath(p)); return { ok: true, msg: '삭제됨 (비활성)' };
}
/** 드래그 정렬 저장: ids 순서대로 sort_order 1..n */
export async function reorderRows(table: T, ids: number[], paths: string[]): Promise<{ ok: boolean; msg: string }> {
  await requireRole(rolesFor(table)); if (!ALLOWED.includes(table)) return { ok: false, msg: 'bad table' };
  const sb = clientFor(table);
  for (let i = 0; i < ids.length; i++) { const { error } = await sb.from(table).update({ sort_order: i + 1 }).eq('id', ids[i]); if (error) return { ok: false, msg: error.message }; }
  paths.forEach(p => revalidatePath(p)); return { ok: true, msg: '순서 저장됨' };
}
