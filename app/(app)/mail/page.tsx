// 메일 발송 — 키워드 대상(콜 리스트+시크릿 지수 상위) 이메일로 제안서 링크 발송. 실제 발송·수집·회신 체크는 집컴 워커(mail_worker.py)
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { DEFAULT_SUBJECT, DEFAULT_BODY } from '@/lib/mail';
import MailClient from './MailClient';
export const dynamic = 'force-dynamic';
export default async function MailPage({ searchParams }: { searchParams: { kw?: string } }) {
  const me = (await getProfile())!; const sb = supabaseAdmin();
  const [{ data: accts }, { data: hist }, { data: prof }, { data: todayRows }, { data: cfg }] = await Promise.all([
    sb.from('mail_accounts').select('id,email,provider,from_name,verified_at,daily_limit,tpl_subject,tpl_body').eq('user_id', me.id).not('verified_at', 'is', null).order('id'),
    sb.from('mail_queue').select('id,to_email,store_name,keyword,status,error,queued_at,sent_at,opened_at,open_cnt,replied_at,proposal_code').eq('sender_id', me.id).order('queued_at', { ascending: false }).limit(300),
    sb.from('profiles').select('phone').eq('id', me.id).maybeSingle(),
    sb.rpc('mail_account_today', { p_user: me.id }),
    sb.from('app_settings').select('key,value').in('key', ['mail_recontact_days', 'mail_daily_limit']),
  ]);
  const g = (k: string, d: number) => { const v = Number(String((cfg ?? []).find(x => x.key === k)?.value ?? '').replace(/"/g, '')); return v > 0 ? v : d; };
  const limit = g('mail_daily_limit', 200); const todayMap = new Map<number, number>(); for (const t of ((todayRows ?? []) as any[])) todayMap.set(Number(t.account_id), Number(t.n));
  // 팀장·총괄·대표·관리팀: 직원 발송 현황 (팀장은 팀만)
  let teamHist: any[] = [];
  if (me.role !== 'staff') {
    const all = me.role === 'admin' || me.role === 'head' || me.is_mgmt;
    const { data: profs } = await sb.from('profiles').select('id,name,team_id').eq('is_active', true);
    const ids = (profs ?? []).filter(p => all || p.team_id === me.team_id).map(p => p.id); const nm = new Map((profs ?? []).map(p => [p.id, p.name]));
    const { data: th } = ids.length ? await sb.from('mail_queue').select('id,sender_id,to_email,store_name,keyword,subject,status,error,queued_at,sent_at,opened_at,open_cnt,replied_at,proposal_code').in('sender_id', ids).order('queued_at', { ascending: false }).limit(500) : { data: [] as any[] };
    teamHist = (th ?? []).map(x => ({ ...x, sender: nm.get(x.sender_id) ?? '?' }));
  }
  const acct = (accts ?? [])[0];
  const accounts = (accts ?? []).map(a => ({ id: a.id, email: a.email, provider: a.provider, today: todayMap.get(a.id) ?? 0, limit: Math.min(a.daily_limit || limit, limit) }));
  return <MailClient me={{ name: me.name, phone: (prof as any)?.phone ?? '' }} accounts={accounts}
    tpl={{ subject: acct?.tpl_subject || DEFAULT_SUBJECT, body: acct?.tpl_body || DEFAULT_BODY }} hist={(hist ?? []) as any[]} teamHist={teamHist} base={(process.env.NEXT_PUBLIC_PROPOSAL_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://chamhan.vercel.app').replace(/\/$/, '')} days={g('mail_recontact_days', 3)} initialKw={searchParams.kw ?? ''} />;
}
