import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
/** 승인된 대행사 → CSV (카톡발송기·수동 발송용). ?status=approved 기본 */
export async function GET(req: Request) {
  const me = await getProfile(); if (!me || !['admin', 'head'].includes(me.role)) return new NextResponse('권한 없음', { status: 403 });
  const status = new URL(req.url).searchParams.get('status') || 'approved';
  const { data } = await supabaseServer().from('agencies').select('id,name,kakao,phone,other,products,draft').eq('status', status).order('id');
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + ['번호,업체명,카톡,전화,기타연락,상품,메시지', ...(data ?? []).map(r => [r.id, r.name, r.kakao, r.phone, r.other, r.products, r.draft].map(esc).join(','))].join('\r\n');
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="agencies_${status}.csv"` } });
}
