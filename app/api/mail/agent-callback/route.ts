// SNS_Manager(직원 PC) → 메일 발송 결과 보고. 인증 = prepareSend 가 큐 행에 심은 job_token
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, msg: 'JSON 아님' }, { status: 400 }); }
  const token = String(body?.token || ''); const results = Array.isArray(body?.results) ? body.results : [];
  if (!token || !results.length) return NextResponse.json({ ok: false, msg: 'token/results 필요' }, { status: 400 });
  const sb = supabaseAdmin(); let n = 0;
  for (const r of results.slice(0, 500)) {
    const id = Number(r?.id); if (!id) continue;
    const upd = r.ok ? { status: 'sent', sent_at: r.sent_at || new Date().toISOString(), error: null }
      : r.cancelled ? { status: 'skipped', error: '중단' } : { status: 'failed', error: String(r.error || '발송 실패').slice(0, 300) };
    const { data } = await sb.from('mail_queue').update(upd).eq('id', id).eq('job_token', token).in('status', ['queued', 'sending']).select('id');
    if (data?.length) n++;
  }
  return NextResponse.json({ ok: true, updated: n });
}
