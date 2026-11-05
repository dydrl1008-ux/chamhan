// 미션 앱 크롤러(mission_crawl.py --push) → 경쟁사 미션. POST { source, rows:[{app, keyword, product, kind, points, first_seen, last_seen}] }  Bearer CRON_SECRET
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false, msg: 'unauthorized' }, { status: 401 });
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, msg: 'JSON 아님' }, { status: 400 }); }
  const rows = Array.isArray(body?.rows) ? body.rows : []; if (!rows.length) return NextResponse.json({ ok: false, msg: 'rows 비어 있음' }, { status: 400 });
  const ts = (v: any) => { const x = String(v ?? '').trim(); if (!x) return null; return /[zZ]$|[+-]\d\d:?\d\d$/.test(x) ? x : x.replace(' ', 'T') + '+09:00'; };   // 크롤러 시각은 KST
  const clean = rows.slice(0, 5000).map((r: any) => ({ app: String(r.app ?? body.source ?? ''), keyword: String(r.keyword ?? '').trim(), product: String(r.product ?? '').trim().slice(0, 300), kind: ['nshop', 'place', 'coupang'].includes(r.kind) ? r.kind : 'nshop', points: String(r.points ?? ''), first_seen: ts(r.first_seen), last_seen: ts(r.last_seen) })).filter((r: any) => r.keyword);
  const { data, error } = await supabaseAdmin().rpc('competitor_missions_import', { p_rows: clean });
  if (error) return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(data as object) });
}
