'use server';
import { getProfile } from '@/lib/auth/session';
import { search, recent, myUsage, me } from '@/lib/nsc';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
export async function nscSearch(keyword: string, force = false): Promise<R<{ result: Awaited<ReturnType<typeof search>> }>> {
  const p = await getProfile(); if (!p) return { ok: false, msg: '로그인 필요' };
  if (force && !(p.role === 'admin' || p.role === 'head' || p.is_mgmt)) force = false;   // 강제 재조회(과금)는 관리자만
  try { const result = await search(keyword, p.id, force); return { ok: true, msg: result.cached ? '캐시된 결과' : '새로 조회함', result }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function nscRecent(): Promise<R<{ list: Awaited<ReturnType<typeof recent>>; usage: Awaited<ReturnType<typeof myUsage>> }>> {
  const p = await getProfile(); if (!p) return { ok: false, msg: '로그인 필요' };
  try { const [list, usage] = await Promise.all([recent(), myUsage(p.id)]); return { ok: true, msg: '', list, usage }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function nscStatus(): Promise<R<{ user: Awaited<ReturnType<typeof me>> }>> {
  const p = await getProfile(); if (!p || !(p.role === 'admin' || p.role === 'head' || p.is_mgmt)) return { ok: false, msg: '권한 없음' };
  try { return { ok: true, msg: '연결 정상', user: await me() }; } catch (e: any) { return { ok: false, msg: e.message }; }
}
