// 워커 PC 렌더: GET → 대기 작업 최대 5개 가져가며 running 표시 · POST {id, page, jpeg(base64)} 장별 업로드 · POST {id, done:true|error} 마감
// Authorization: Bearer CRON_SECRET
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PV3_STORE_PAGES, PV3_COMMON_PAGES, PV3_DESIGN } from '@/lib/proposalV3';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;
const J = (o: any, status = 200) => NextResponse.json(o, { status });
const authed = (req: Request) => !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
const base = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://chamhan.vercel.app').replace(/\/$/, '');
const COMMON = PV3_COMMON_PAGES;

export async function GET(req: Request) {
  if (!authed(req)) return J({ ok: false }, 401);
  const sb = supabaseAdmin();
  await sb.from('ai_settings').upsert({ key: 'pv3_render_last', value: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'key' });   // 렌더 PC 연결 표시
  // 10분 넘게 running 이면 다시 queued (워커 죽음)
  await sb.from('pv3_render_jobs').update({ status: 'queued' }).eq('status', 'running').lt('created_at', new Date(Date.now() - 10 * 60e3).toISOString());
  const { data: jobs } = await sb.from('pv3_render_jobs').select('id,kind,ref').eq('status', 'queued').order('id').limit(5);
  if (jobs?.length) await sb.from('pv3_render_jobs').update({ status: 'running' }).in('id', jobs.map(j => j.id));
  const t = process.env.CRON_SECRET;
  return J({ ok: true, width: 720, scale: 1.5, quality: 82, jobs: (jobs ?? []).map(j => ({ id: j.id, kind: j.kind, ref: j.ref, pages: (j.kind === 'store' ? PV3_STORE_PAGES : COMMON).map(p => ({ page: p, url: `${new URL(req.url).origin}/pv3/view?kind=${j.kind}&ref=${encodeURIComponent(j.ref)}&page=${p}&t=${encodeURIComponent(t ?? '')}` })) })) });
}

export async function POST(req: Request) {
  if (!authed(req)) return J({ ok: false }, 401);
  let b: any = {}; try { b = await req.json(); } catch { return J({ ok: false, msg: 'bad json' }, 400); }
  const sb = supabaseAdmin(); const id = Number(b.id); if (!id) return J({ ok: false, msg: 'id' }, 400);
  const { data: job } = await sb.from('pv3_render_jobs').select('id,kind,ref').eq('id', id).maybeSingle(); if (!job) return J({ ok: false, msg: 'job 없음' }, 404);
  if (b.jpeg && b.page) {
    const buf = Buffer.from(String(b.jpeg), 'base64'); if (buf.length < 1000 || buf.length > 4_000_000) return J({ ok: false, msg: '이미지 크기' }, 400);
    const safe = job.kind === 'store' ? `s${job.ref}` : `k_${encodeURIComponent(job.ref).replace(/%/g, '')}`;
    const path = `${safe}/${b.page}_${Date.now().toString(36)}.jpg`;
    const { error } = await sb.storage.from('pv3').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) return J({ ok: false, msg: error.message }, 500);
    const url = sb.storage.from('pv3').getPublicUrl(path).data.publicUrl;
    const table = job.kind === 'store' ? 'pv3_stores' : 'pv3_keywords'; const key = job.kind === 'store' ? 'id' : 'keyword'; const refv = job.kind === 'store' ? Number(job.ref) : job.ref;
    const { data: row } = await sb.from(table).select('images').eq(key, refv).maybeSingle();
    const imgs: { page: number; url: string; v?: number }[] = ((row?.images ?? []) as any[]).filter(x => x.page !== Number(b.page) && x.v === PV3_DESIGN); imgs.push({ page: Number(b.page), url, v: PV3_DESIGN }); imgs.sort((x, y) => x.page - y.page);   // 예전 디자인 장은 버림
    await sb.from(table).update({ images: imgs, rendered_at: new Date().toISOString() }).eq(key, refv);
    return J({ ok: true, url });
  }
  if (b.done) { await sb.from('pv3_render_jobs').update({ status: b.error ? 'failed' : 'done', error: b.error ? String(b.error).slice(0, 300) : null, done_at: new Date().toISOString() }).eq('id', id); return J({ ok: true }); }
  return J({ ok: false, msg: '?' }, 400);
}
