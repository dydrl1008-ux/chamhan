// 고객 순위 리포트 — 순위 체크 업체(그룹) 하나를 고객에게 보내는 리포트로. PNG/PDF 저장 + 카톡 문구. 외부 링크 없음(참한/워크허브 노출 X)
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { watchRows, watchHistory, ykrReady, GROUP_NONE } from '@/lib/ykreward';
import { PageHeader, Empty } from '@/components/ui';
import { todayKST, addDays } from '@/lib/date/kst';
import ReportClient, { type ReportData, type KwReport } from './ReportClient';
export const dynamic = 'force-dynamic';

const KST_DAY = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

export default async function ReportPage({ searchParams }: { searchParams: { u?: string; g?: string; from?: string; to?: string; pre?: string } }) {
  const me = (await getProfile())!; const sb = supabaseServer();
  const back = <div style={{ display: 'grid', gap: 14 }}><PageHeader title="고객 리포트" /><div className="card"><Empty>순위 체크에서 업체 옆 「리포트」를 눌러 들어오세요.</Empty></div></div>;
  if (!ykrReady() || !searchParams.g) return back;
  const g = searchParams.g;
  const [{ data: links }, { data: profs }] = await Promise.all([sb.from('reward_watch_links').select('user_id,login_id,phone'), sb.from('profiles').select('id,name').eq('is_active', true)]);
  const uid = me.role === 'staff' ? me.id : (searchParams.u && links?.some(l => l.user_id === searchParams.u) ? searchParams.u : me.id);
  const link = links?.find(l => l.user_id === uid); if (!link) return back;
  const owner = profs?.find(p => p.id === uid)?.name ?? '';
  const { data: setting } = await sb.from('reward_watch_reports').select('start_on,end_on,note').eq('user_id', uid).eq('group_key', g).maybeSingle();

  const today = todayKST();
  const start = searchParams.from || setting?.start_on || addDays(today, -9);     // 기본: 최근 10일 계약
  const end = searchParams.to || setting?.end_on || today;
  const pre = Math.max(0, Math.min(30, Number(searchParams.pre ?? 7) || 0));       // 계약 전 며칠 더 보여줄지
  const from = addDays(start, -pre), to = end < today ? end : today;
  const days: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  let err = ''; let kws: KwReport[] = [];
  try {
    const rows = (await watchRows([link.login_id])).filter(w => w.group === g);
    const spanDays = Math.ceil((Date.now() - new Date(from + 'T00:00:00+09:00').getTime()) / 864e5) + 1;
    const hist = await watchHistory(rows.map(w => w.id), spanDays);
    kws = rows.map(w => {
      const byDay = new Map<string, number | null>();
      for (const p of hist[w.id] ?? []) byDay.set(KST_DAY(p.t), p.r);          // 하루 여러 번이면 마지막 수집
      if (w.cur_at && w.cur_rank !== undefined) { const k = KST_DAY(w.cur_at); if (!byDay.has(k)) byDay.set(k, w.cur_rank); }
      const series = days.map(d => (byDay.has(d) ? byDay.get(d)! : undefined));   // undefined = 수집 없음, null = 미노출
      const inC = days.map((d, i) => ({ d, i })).filter(x => x.d >= start && x.d <= end);
      const nums = inC.map(x => series[x.i]).filter((v): v is number => typeof v === 'number');
      const firstIdx = inC.find(x => series[x.i] !== undefined)?.i;
      const startRank = firstIdx === undefined ? null : series[firstIdx] ?? null;
      const lastIdx = [...inC].reverse().find(x => series[x.i] !== undefined)?.i;
      const curRank = lastIdx === undefined ? (w.cur_rank ?? null) : series[lastIdx] ?? null;
      const prevIdx = lastIdx === undefined ? undefined : [...inC].reverse().find(x => x.i < lastIdx && series[x.i] !== undefined)?.i;
      const measured = inC.filter(x => series[x.i] !== undefined).length;
      return { id: w.id, keyword: w.keyword, title: w.title, store: w.store, image_url: w.image_url, url: w.url, series,
        startRank, curRank, prevRank: prevIdx === undefined ? null : series[prevIdx] ?? null,
        best: nums.length ? Math.min(...nums) : null, avg: nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : null,
        up: startRank !== null ? nums.filter(v => v < startRank).length : 0, measured };
    });
  } catch (e: any) { err = e?.message ?? String(e); }

  const data: ReportData = { group: g === GROUP_NONE ? '' : g, owner, phone: link.phone ?? '', isMe: uid === me.id, uid, start, end, pre, today, days, kws, note: setting?.note ?? '', saved: !!setting };
  return <ReportClient data={data} err={err} />;
}
