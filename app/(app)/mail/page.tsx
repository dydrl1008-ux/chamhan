// 메일 발송 — 키워드 대상(콜 리스트+시크릿 지수 상위) 이메일로 제안서 링크 발송. 실제 발송·수집·회신 체크는 집컴 워커(mail_worker.py)
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { DEFAULT_SUBJECT, DEFAULT_BODY } from '@/lib/mail';
import MailClient from './MailClient';
export const dynamic = 'force-dynamic';
export default async function MailPage({ searchParams }: { searchParams: { kw?: string } }) {
  const me = (await getProfile())!; const sb = supabaseAdmin();
  const kstStart = (() => { const d = new Date(Date.now() + 9 * 3600_000); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() - 9 * 3600_000).toISOString(); })();
  const [{ data: acct }, { data: hist }, { data: prof }, { count: today }, { data: cfg }] = await Promise.all([
    sb.from('mail_accounts').select('email,from_name,verified_at,daily_limit,tpl_subject,tpl_body,imap_checked_at').eq('user_id', me.id).maybeSingle(),
    sb.from('mail_queue').select('id,to_email,store_name,keyword,status,error,queued_at,sent_at,opened_at,open_cnt,replied_at,proposal_code').eq('sender_id', me.id).order('queued_at', { ascending: false }).limit(300),
    sb.from('profiles').select('phone').eq('id', me.id).maybeSingle(),
    sb.from('mail_queue').select('id', { count: 'exact', head: true }).eq('sender_id', me.id).in('status', ['queued', 'sending', 'sent']).gte('queued_at', kstStart),
    sb.from('app_settings').select('key,value').in('key', ['mail_recontact_days', 'mail_daily_limit']),
  ]);
  const g = (k: string, d: number) => { const v = Number(String((cfg ?? []).find(x => x.key === k)?.value ?? '').replace(/"/g, '')); return v > 0 ? v : d; };
  const limit = Math.min(acct?.daily_limit || g('mail_daily_limit', 200), g('mail_daily_limit', 200));
  return <MailClient me={{ name: me.name, phone: (prof as any)?.phone ?? '' }} account={acct ? { email: acct.email, fromName: acct.from_name, verifiedAt: acct.verified_at, imapCheckedAt: acct.imap_checked_at } : null}
    tpl={{ subject: acct?.tpl_subject || DEFAULT_SUBJECT, body: acct?.tpl_body || DEFAULT_BODY }} hist={(hist ?? []) as any[]} today={today ?? 0} limit={limit} days={g('mail_recontact_days', 3)} initialKw={searchParams.kw ?? ''} />;
}
