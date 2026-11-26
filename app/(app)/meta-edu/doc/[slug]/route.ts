// 교육자료 열람 — 메타팀 · 총괄만. 사원은 1차 교육 완료 후 열리고, 열면 열람으로 기록된다. 자료 파일은 content/meta-edu/*.html (교체할 때 같은 이름으로 덮어쓰기)
import { readFile } from 'fs/promises';
import path from 'path';
import { getProfile } from '@/lib/auth/session';
import { metaAccess } from '@/lib/meta';
import { EDU_DOCS, eduLoad, eduPatch } from '@/lib/metaEdu';
export const dynamic = 'force-dynamic';
const page = (msg: string, status: number) => new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;color:#344054">${msg}</body>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const me = await getProfile(); if (!me || !me.is_active) return page('로그인이 필요합니다', 401);
  const a = await metaAccess(me); if (!a.ok) return page('볼 수 없는 자료입니다', 403);
  const doc = EDU_DOCS.find(d => d.slug === params.slug); if (!doc) return page('없는 자료입니다', 404);
  if (!a.lead) { const s = await eduLoad([me.id]); const row = s.rows.get(me.id)!;
    if (!s.missing && !row.step1_at) return page('1차 교육을 마친 뒤에 열립니다', 403);
    if (!s.missing && !row.docs?.[doc.slug]) await eduPatch(me.id, { docs: { ...(row.docs ?? {}), [doc.slug]: new Date().toISOString() } }); }
  let html: string; try { html = await readFile(path.join(process.cwd(), 'content', 'meta-edu', `${doc.slug}.html`), 'utf8'); } catch { return page('자료 파일을 찾지 못했습니다', 500); }
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'content-security-policy': "sandbox allow-scripts allow-popups; default-src 'self' 'unsafe-inline' data: blob: https://fonts.googleapis.com https://fonts.gstatic.com; connect-src 'none'", 'x-robots-tag': 'noindex' } });
}
