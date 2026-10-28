// 주요 슬롯 순위 변동 알림 — GitHub Actions(rank-alert.yml) 가 하루 두 번 호출. CRON_SECRET 필요
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rankAlerts, ykrReady } from '@/lib/ykreward';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false, msg: 'unauthorized' }, { status: 401 });
  if (!ykrReady()) return NextResponse.json({ ok: false, msg: 'ykreward env 없음' }, { status: 500 });
  const wh = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  try {
    const { data: st } = await wh.from('app_settings').select('value').eq('key', 'rank_alert_delta').maybeSingle();
    const r = await rankAlerts(wh, Math.max(1, Number(st?.value) || 5));
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) { return NextResponse.json({ ok: false, msg: e.message }, { status: 500 }); }
}
