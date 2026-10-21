import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth/session';
import { peopleStatus, statusCsv } from '@/lib/peopleStatus';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const me = await getProfile(); if (!me || !['admin', 'head', 'manager'].includes(me.role)) return new NextResponse('forbidden', { status: 403 });
  const team = me.role === 'manager' ? (me.team_id ?? 0) : Number(req.nextUrl.searchParams.get('team')) || 0;
  const m = req.nextUrl.searchParams.get('m') ?? undefined;
  const st = await peopleStatus({ teamId: team || undefined, month: m });
  const body = statusCsv(st.rows, st.bm);
  return new NextResponse(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="workhub-status-${st.bm}-${st.today}.csv"` } });
}
