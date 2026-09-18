import { createClient } from '@supabase/supabase-js';
// 새 승인요청 알림. 1차: 워크허브 배지(테이블 기반, 별도 동작 없음). 2차: 알림톡/웹훅 — NOTIFY_WEBHOOK_URL 이 있으면 POST (솔라피·카톡발송기·Slack 등 연결용)
export async function notifyPending(fresh: { empl_name: string; cust_name: string; prod_name: string; amount: number; req_gubun: string; item_key: string }[]) {
  const url = process.env.NOTIFY_WEBHOOK_URL; if (!url) return;
  const text = `[워크허브] 정산 승인요청 ${fresh.length}건\n` + fresh.slice(0, 10).map(f => `· ${f.empl_name} / ${f.cust_name} / ${f.prod_name} / ${f.req_gubun} / ${f.amount.toLocaleString('ko-KR')}원`).join('\n') + (fresh.length > 10 ? `\n외 ${fresh.length - 10}건` : '');
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, count: fresh.length, items: fresh }) }); } catch {}
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  await sb.from('settlement_pending').update({ notified_at: new Date().toISOString() }).in('item_key', fresh.map(f => f.item_key));
}
