// 수집기 → 메일 대상(mail_targets). 콜 리스트(leads-import)와 별도 — 이메일 있는 업체 전부(전화 없어도). 같은 rows 형식 + email
// POST { source, rows:[{store_name, store_url, product_url, keyword, email, phone, category, rank_now, review_cnt, opened_on}] }  Authorization: Bearer CRON_SECRET
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false, msg: 'unauthorized' }, { status: 401 });
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, msg: 'JSON 아님' }, { status: 400 }); }
  const rows = Array.isArray(body?.rows) ? body.rows : []; if (!rows.length) return NextResponse.json({ ok: false, msg: 'rows 비어 있음' }, { status: 400 });
  const clean = rows.slice(0, 3000).map((r: any) => ({
    store_name: String(r.store_name ?? r.name ?? '').trim(), store_url: String(r.store_url ?? ''), product_url: String(r.product_url ?? r.url ?? ''), keyword: String(r.keyword ?? '').trim(),
    email: String(r.email ?? '').trim().toLowerCase(), phone: String(r.phone ?? '').replace(/[^\d-]/g, ''), category: String(r.category ?? ''),
    rank_now: r.rank_now == null || r.rank_now === '' ? null : Number(r.rank_now), review_cnt: r.review_cnt == null || r.review_cnt === '' ? null : Number(r.review_cnt), opened_on: r.opened_on || null,
  })).filter((r: any) => r.email.includes('@'));
  if (!clean.length) return NextResponse.json({ ok: false, msg: 'email 있는 행 없음' }, { status: 400 });
  const { data, error } = await supabaseAdmin().rpc('mail_targets_import', { p_rows: clean });
  if (error) return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(data as object) });
}
