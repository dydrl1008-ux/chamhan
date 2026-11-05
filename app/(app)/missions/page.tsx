// 경쟁사 미션 — 미션 앱(캐시플랜 등)에서 긁은 (키워드, 상품). 쇼핑은 시크릿 지수로 스토어·순위 매칭, 콜 리스트/메일 대상과 대조
import { requireRole } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import MissionsClient from './MissionsClient';
export const dynamic = 'force-dynamic';
export default async function MissionsPage({ searchParams }: { searchParams: { kind?: string; days?: string } }) {
  await requireRole(['admin', 'head']);   // 총괄·대표만
  const sb = supabaseAdmin();
  const kind = ['nshop', 'place', 'coupang', 'all'].includes(searchParams.kind ?? '') ? searchParams.kind! : 'nshop';
  const days = Math.max(1, Math.min(90, Number(searchParams.days) || 14));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  let q = sb.from('competitor_missions').select('*').gte('last_seen', since).order('last_seen', { ascending: false }).limit(1000);
  if (kind !== 'all') q = q.eq('kind', kind);
  const { data: rows } = await q;
  // 우리 대상과 대조: 매칭된 스토어명이 메일 대상/콜 리스트에 있나
  const malls = [...new Set((rows ?? []).map(r => r.mall_name).filter(Boolean))];
  const [{ data: mt }, { data: ld }] = malls.length ? await Promise.all([sb.from('mail_targets').select('store_name,email').in('store_name', malls), sb.from('leads').select('store_name,status,assigned_to').in('store_name', malls)]) : [{ data: [] as any[] }, { data: [] as any[] }];
  const inMail = new Set((mt ?? []).map(x => x.store_name)); const inLeads = new Map((ld ?? []).map(x => [x.store_name, x.status]));
  const { count: total } = await sb.from('competitor_missions').select('id', { count: 'exact', head: true });
  const { count: unmatched } = await sb.from('competitor_missions').select('id', { count: 'exact', head: true }).eq('kind', 'nshop').is('matched_at', null);
  return <MissionsClient rows={(rows ?? []).map(r => ({ ...r, in_mail: inMail.has(r.mall_name), lead_status: inLeads.get(r.mall_name) ?? null }))} kind={kind} days={days} total={total ?? 0} unmatched={unmatched ?? 0} />;
}
