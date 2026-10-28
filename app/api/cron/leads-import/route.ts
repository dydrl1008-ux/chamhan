// rank-ykad(광고주 수집) → 워크허브 콜 리스트. POST { source, rows:[{store_name, store_url, keyword, phone, ad_running, rank_now, review_cnt, category, opened_on}] }
// Authorization: Bearer CRON_SECRET. 같은 업체를 매일 다시 보내면 rank_prev 가 자동으로 잡혀 「순위 하락」 점수가 붙음
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false, msg: 'unauthorized' }, { status: 401 });
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, msg: 'JSON 아님' }, { status: 400 }); }
  const rows = Array.isArray(body?.rows) ? body.rows : []; if (!rows.length) return NextResponse.json({ ok: false, msg: 'rows 비어 있음' }, { status: 400 });
  const clean = rows.slice(0, 2000).map((r: any) => ({
    store_name: String(r.store_name ?? r.name ?? '').trim(), store_url: String(r.store_url ?? r.url ?? ''), keyword: String(r.keyword ?? ''), category: String(r.category ?? ''),
    phone: String(r.phone ?? '').replace(/[^\d-]/g, ''), ad_running: r.ad_running == null ? true : !!r.ad_running,
    rank_now: r.rank_now == null || r.rank_now === '' ? null : Number(r.rank_now), rank_prev: r.rank_prev == null || r.rank_prev === '' ? null : Number(r.rank_prev), review_cnt: r.review_cnt == null || r.review_cnt === '' ? null : Number(r.review_cnt), opened_on: r.opened_on || null,
  }));
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('leads_upsert', { p_rows: clean, p_file: String(body.source ?? 'rank-ykad').slice(0, 200) });
  if (error) return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(data as object) });
}
