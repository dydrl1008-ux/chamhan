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
  // 예전 렌더 스크립트(이미지를 워크허브로 올리는 방식 — Vercel 전송량 과금)에는 일감을 주지 않는다. 새 스크립트는 ?v=2 로 부른다
  if (Number(new URL(req.url).searchParams.get('v') ?? 0) < 2) return J({ ok: true, jobs: [], msg: 'pv3_render.py 를 새 버전으로 바꾸고 렌더 창을 껐다 켜 주세요' });
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
  if (b.sign && b.page) {   // 이미지를 워크허브(Vercel)를 거치지 않고 저장소로 바로 올리도록 업로드 주소만 발급 — 이미지가 Vercel 전송량으로 잡히던 문제
    const safe = job.kind === 'store' ? `s${job.ref}` : `k_${encodeURIComponent(job.ref).replace(/%/g, '')}`;
    const path = `${safe}/${Number(b.page)}_${Date.now().toString(36)}.jpg`;
    const { data, error } = await sb.storage.from('pv3').createSignedUploadUrl(path);
    if (error || !data?.signedUrl) return J({ ok: false, msg: error?.message ?? '업로드 주소 발급 실패' }, 500);
    return J({ ok: true, url: data.signedUrl, path });
  }
  if (b.jpeg) return J({ ok: false, msg: '이미지는 저장소로 직접 올려야 합니다 — pv3_render.py 를 새 버전으로 바꿔 주세요' }, 410);   // 워크허브를 거치는 업로드는 막음 (전송량 과금)
  if (b.done && !b.error) {
    const safe = job.kind === 'store' ? `s${job.ref}` : `k_${encodeURIComponent(job.ref).replace(/%/g, '')}`;
    const { data: files } = await sb.storage.from('pv3').list(safe, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
    const want = job.kind === 'store' ? PV3_STORE_PAGES : PV3_COMMON_PAGES; const pick = new Map<number, string>();
    for (const f of files ?? []) { const m = /^(\d+)_/.exec(f.name); const pg = m ? Number(m[1]) : 0; if (want.includes(pg) && !pick.has(pg)) pick.set(pg, f.name); }   // 장마다 가장 최근 파일
    const imgs = want.filter(pg => pick.has(pg)).map(pg => ({ page: pg, url: sb.storage.from('pv3').getPublicUrl(`${safe}/${pick.get(pg)}`).data.publicUrl, v: PV3_DESIGN }));
    const table = job.kind === 'store' ? 'pv3_stores' : 'pv3_keywords'; const key = job.kind === 'store' ? 'id' : 'keyword'; const refv = job.kind === 'store' ? Number(job.ref) : job.ref;
    if (imgs.length === want.length) await sb.from(table).update({ images: imgs, rendered_at: new Date().toISOString() }).eq(key, refv);
    else b.error = `장 누락 ${imgs.length}/${want.length}`;
  }
  if (b.done) { await sb.from('pv3_render_jobs').update({ status: b.error ? 'failed' : 'done', error: b.error ? String(b.error).slice(0, 300) : null, done_at: new Date().toISOString() }).eq('id', id); return J({ ok: true }); }
  return J({ ok: false, msg: '?' }, 400);
}
