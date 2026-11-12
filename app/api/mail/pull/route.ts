// SNS_Manager 가 1분마다 호출: POST { key, build } → 내 활성 캠페인에서 다음 키워드 1개를 발송 작업으로 반환 (없으면 idle)
// 인증은 개인 키(mail_agent_keys). 작업 내용은 브라우저 자동 발송과 같은 AgentJob 이라 SNS_Manager 쪽 발송 코드는 그대로
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { autoPrepareCore, settings, kstDayStart } from '@/lib/mailSend';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;

type Prog = { done: string[]; sent: number; log: string[] };
const J = (o: any, status = 200) => NextResponse.json(o, { status });

export async function POST(req: Request) {
  let body: any = {}; try { body = await req.json(); } catch {}
  const key = String(body?.key ?? '').trim(); if (!key || key.length < 16) return J({ ok: false, msg: 'key 없음' }, 401);
  const sb = supabaseAdmin();
  const { data: k } = await sb.from('mail_agent_keys').select('user_id').eq('key', key).maybeSingle();
  if (!k) return J({ ok: false, msg: '키가 맞지 않습니다 — 워크허브 메일 발송 화면에서 다시 연결' }, 401);
  const { data: me } = await sb.from('profiles').select('id,name,is_active').eq('id', k.user_id).maybeSingle();
  if (!me?.is_active) return J({ ok: false, msg: '비활성 사용자' }, 403);

  const { data: cs } = await sb.from('mail_campaigns').select('*').eq('owner_id', me.id).eq('status', 'active').order('created_at', { ascending: true }).limit(3);
  const c = (cs ?? [])[0];
  if (!c) return J({ ok: true, idle: true, reason: '진행 중인 자동 발송 없음', wait: 120 });
  await sb.from('mail_campaigns').update({ last_pull_at: new Date().toISOString() }).eq('id', c.id);

  // 계정 일 상한 + 캠페인 일 상한
  const { limit } = await settings();
  const { data: acct } = await sb.from('mail_accounts').select('id,daily_limit,verified_at').eq('id', c.account_id).eq('user_id', me.id).maybeSingle();
  if (!acct?.verified_at) { await fail(sb, c, '발신 계정 없음 — 내 정보에서 다시 연결'); return J({ ok: true, idle: true, reason: '발신 계정 없음', wait: 600 }); }
  const lim = Math.min(acct.daily_limit || limit, limit);
  const { count: usedAcct } = await sb.from('mail_queue').select('id', { count: 'exact', head: true }).eq('account_id', acct.id).in('status', ['queued', 'sending', 'sent']).gte('queued_at', kstDayStart());
  let remain = lim - (usedAcct ?? 0);
  if (c.daily_cap > 0) {
    const { count: usedC } = await sb.from('mail_queue').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).in('status', ['queued', 'sending', 'sent']).gte('queued_at', kstDayStart());
    remain = Math.min(remain, c.daily_cap - (usedC ?? 0));
  }
  if (remain <= 0) return J({ ok: true, idle: true, reason: '오늘 발송 상한 도달 — 내일 이어서', wait: 1800 });

  const prog: Prog = { done: [], sent: 0, log: [], ...(c.progress ?? {}) };
  const kws: string[] = (c.keywords ?? []) as string[];
  const log = (m: string) => { prog.log = [...prog.log.slice(-60), `${new Date(Date.now() + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ')} ${m}`]; };
  // 다음 키워드: 대상 없는 키워드는 건너뛰며 최대 5개까지 시도
  for (let t = 0; t < 5; t++) {
    const kw = kws.find(x => !prog.done.includes(x));
    if (!kw) { log('모든 키워드 완료'); await sb.from('mail_campaigns').update({ status: 'done', progress: prog }).eq('id', c.id); return J({ ok: true, idle: true, reason: '캠페인 완료', wait: 300 }); }
    const n = Math.min(c.per_kw || 30, remain);
    const r = await autoPrepareCore(me, { keyword: kw, n, subject: c.subject, body: c.body, owner: c.owner_name, phone: c.phone, offer: (c.offer ?? { basic: '', rec: '' }) as any, accountId: c.account_id, campaignId: c.id, v3: !!c.use_v3 });
    if (!r.ok && c.use_v3 && /준비 중/.test(r.msg)) {   // v3 준비 중 → 이 키워드는 뒤로 미루고 다음 키워드. 전부 준비 중이면 5분 쉼
      const rest = kws.filter(x => x !== kw && !prog.done.includes(x)); const pending = (prog as any).pending ?? [];
      if (!pending.includes(kw)) pending.push(kw); (prog as any).pending = pending; log(`'${kw}' v3 준비 중 — 뒤로`);
      await sb.from('mail_campaigns').update({ keywords: [...prog.done, ...rest, kw], progress: prog }).eq('id', c.id);
      if (!rest.length || pending.length >= rest.length + 1) return J({ ok: true, idle: true, reason: 'v3 글·이미지 준비 중 (워커)', wait: 300 });
      kws.splice(kws.indexOf(kw), 1); kws.push(kw); continue;
    }
    prog.done.push(kw);
    if (!r.ok || !r.job) { log(`'${kw}' 건너뜀 — ${r.msg}`); if (/상한/.test(r.msg)) { await sb.from('mail_campaigns').update({ progress: prog }).eq('id', c.id); return J({ ok: true, idle: true, reason: r.msg, wait: 1800 }); } continue; }
    (prog as any).pending = ((prog as any).pending ?? []).filter((x: string) => x !== kw);
    prog.sent += r.job.items.length; log(`'${kw}' ${r.job.items.length}건 → SNS_Manager`);
    await sb.from('mail_campaigns').update({ progress: prog }).eq('id', c.id);
    return J({ ok: true, job: r.job, keyword: kw, campaign_id: c.id });
  }
  await sb.from('mail_campaigns').update({ progress: prog }).eq('id', c.id);
  return J({ ok: true, idle: true, reason: '대상 있는 키워드를 찾는 중', wait: 30 });
}

async function fail(sb: ReturnType<typeof supabaseAdmin>, c: any, msg: string) {
  const prog = { done: [], sent: 0, log: [], ...(c.progress ?? {}) }; prog.log = [...prog.log.slice(-60), msg];
  await sb.from('mail_campaigns').update({ status: 'paused', progress: prog }).eq('id', c.id);
}
