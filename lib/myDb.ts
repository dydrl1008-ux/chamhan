// 내 DB 알림 — 하루 한 번(평일 08:30 이후 첫 호출): 오늘 연락하기로 한 DB, 약속일이 지났는데 그대로인 DB 를 본인에게 알린다
import { supabaseAdmin } from '@/lib/supabase/admin';
export async function myDbTick(): Promise<string> {
  const now = new Date(Date.now() + 9 * 3600e3); const today = now.toISOString().slice(0, 10); const hm = now.toISOString().slice(11, 16); const dow = now.getUTCDay();
  if (dow === 0 || dow === 6 || hm < '08:30') return 'wait';
  const sb = supabaseAdmin(); const { data: last } = await sb.from('ai_settings').select('value').eq('key', 'mydb_alarm_day').maybeSingle();
  if (last?.value === today) return 'done';
  const { data, error } = await sb.from('my_db').select('owner_id,name,next_on').eq('status', '진행').is('deleted_at', null).not('next_on', 'is', null).lte('next_on', today).limit(10000);
  if (error) return 'nosql';
  await sb.from('ai_settings').upsert({ key: 'mydb_alarm_day', value: today, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  const by = new Map<string, { t: string[]; late: number }>();
  for (const r of data ?? []) { const x = by.get(r.owner_id) ?? { t: [], late: 0 }; if (r.next_on === today) x.t.push(r.name); else x.late++; by.set(r.owner_id, x); }
  const rows = [...by].map(([user_id, x]) => ({ user_id, kind: 'info', title: [x.t.length ? `오늘 연락할 DB ${x.t.length}건` : '', x.late ? `약속 지난 DB ${x.late}건` : ''].filter(Boolean).join(' · '), body: x.t.slice(0, 10).join(', ').slice(0, 300), link: '/my-db' }));
  if (rows.length) await sb.from('notifications').insert(rows);
  return `sent ${rows.length}`;
}
