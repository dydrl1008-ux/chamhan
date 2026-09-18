import { NextResponse } from 'next/server';
import { pollPending } from '@/lib/settlement/pending';
import { notifyPending } from '@/lib/settlement/notify';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false, msg: 'unauthorized' }, { status: 401 });
  try { const r = await pollPending(3); if (r.fresh.length) await notifyPending(r.fresh); return NextResponse.json({ ok: true, ...r, fresh: r.fresh.length }); }
  catch (e: any) { return NextResponse.json({ ok: false, msg: e.message }, { status: 500 }); }
}
