import { NextResponse } from 'next/server';
import { runSync, defaultRange } from '@/lib/settlement/sync';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;   // 정산 사이트 조회 대기 (Hobby 최대 60초)
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false, msg: 'unauthorized' }, { status: 401 });
  const { from, to } = defaultRange();
  const r = await runSync(from, to, 'cron');
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
