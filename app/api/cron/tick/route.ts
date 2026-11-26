// 워크허브 자체 예약 실행 (Vercel Cron, vercel.json) — 회사 PC 와 무관하게 5분마다 돈다. Authorization: Bearer CRON_SECRET (Vercel 이 자동으로 붙임)
//   · 내 DB 알람: 시각 알람은 그 시각이 지나면 바로, 아침 묶음 알림은 평일 08:30 이후 한 번
//   · 순위 체크: 평일 10시·14시 회차 — 키워드당 한 번 조회, 한 번에 못 끝내면 다음 5분에 이어서
import { NextResponse } from 'next/server';
import { myDbTick } from '@/lib/myDb';
import { rankWatchTick } from '@/lib/rankWatch';
export const dynamic = 'force-dynamic'; export const maxDuration = 300;
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  let md = 'skip'; try { md = await myDbTick(); } catch (e: any) { md = 'err ' + String(e?.message ?? e).slice(0, 80); }
  let rw = 'skip'; try { rw = await rankWatchTick(230000); } catch (e: any) { rw = 'err ' + String(e?.message ?? e).slice(0, 80); }
  return NextResponse.json({ ok: true, md, rw });
}
