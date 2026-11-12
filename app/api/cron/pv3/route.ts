// 워커 결과 수거 + 글 끝난 키워드·업체 렌더 큐 등록 (pv3_render.py 가 주기적으로 호출 · Authorization: Bearer CRON_SECRET)
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ingestAi, queueRender } from '@/lib/pv3Tasks';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const r = await ingestAi(); const sb = supabaseAdmin(); let renders = 0;
    const { data: ks } = await sb.from('pv3_keywords').select('keyword,images').in('ai_status', ['done', 'fallback']);
    for (const k of ks ?? []) {
      if ((k.images ?? []).length < 4) { await queueRender('keyword', k.keyword); renders++; }
      const { data: ss } = await sb.from('pv3_stores').select('id,images').eq('keyword', k.keyword).not('ai', 'is', null);
      for (const s of ss ?? []) if ((s.images ?? []).length < 4) { await queueRender('store', String(s.id)); renders++; }
    }
    return NextResponse.json({ ok: true, ...r, renders });
  } catch (e: any) { return NextResponse.json({ ok: false, msg: e.message }, { status: 500 }); }
}
