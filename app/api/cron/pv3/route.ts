// 워커 결과 수거 + 글 끝난 키워드·업체 렌더 큐 등록 (pv3_render.py 가 주기적으로 호출 · Authorization: Bearer CRON_SECRET)
import { NextResponse } from 'next/server';
import { ingestAi, queueMissingRenders } from '@/lib/pv3Tasks';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const r = await ingestAi(); const renders = await queueMissingRenders();
    return NextResponse.json({ ok: true, ...r, renders });
  } catch (e: any) { return NextResponse.json({ ok: false, msg: e.message }, { status: 500 }); }
}
