// 내 DB 알림 — 하루 한 번(평일 08:30 이후 첫 호출): 오늘 연락하기로 한 DB, 약속일이 지났는데 그대로인 DB 를 본인에게 알린다
import { supabaseAdmin } from '@/lib/supabase/admin';
export async function myDbTick(): Promise<string> {
  const now = new Date(Date.now() + 9 * 3600e3); const today = now.toISOString().slice(0, 10); const hm = now.toISOString().slice(11, 16); const dow = now.getUTCDay();
  const sb0 = supabaseAdmin();
  // 시각을 정해 둔 알람 — 그 시각이 되면 건별로 한 번 알림 (요일 무관, 0093)
  let timed = 0;
  { const { data: due } = await sb0.from('my_db').select('id,owner_id,name,phone,alarm_time,note1').eq('next_on', today).neq('alarm_time', '').lte('alarm_time', hm).is('alarm_sent_on', null).is('deleted_at', null).eq('status', '진행').limit(300);
    if (due?.length) { await sb0.from('my_db').update({ alarm_sent_on: today }).in('id', due.map(d => d.id));
      await sb0.from('notifications').insert(due.map(d => ({ user_id: d.owner_id, kind: 'alert', title: `⏰ ${d.alarm_time} 연락 — ${d.name}`, body: [d.phone, d.note1].filter(Boolean).join(' · ').slice(0, 300), link: '/my-db' }))); timed = due.length; } }
  if (dow === 0 || dow === 6 || hm < '08:30') return `wait${timed ? ` timed ${timed}` : ''}`;
  const sb = supabaseAdmin(); const { data: last } = await sb.from('ai_settings').select('value').eq('key', 'mydb_alarm_day').maybeSingle();
  if (last?.value === today) return `done${timed ? ` timed ${timed}` : ''}`;
  const { data, error } = await sb.from('my_db').select('owner_id,name,next_on').eq('status', '진행').is('deleted_at', null).not('next_on', 'is', null).lte('next_on', today).limit(10000);
  if (error) return 'nosql';
  await sb.from('ai_settings').upsert({ key: 'mydb_alarm_day', value: today, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  const by = new Map<string, { t: string[]; late: number }>();
  for (const r of data ?? []) { const x = by.get(r.owner_id) ?? { t: [], late: 0 }; if (r.next_on === today) x.t.push(r.name); else x.late++; by.set(r.owner_id, x); }
  const rows = [...by].map(([user_id, x]) => ({ user_id, kind: 'info', title: [x.t.length ? `오늘 연락할 DB ${x.t.length}건` : '', x.late ? `약속 지난 DB ${x.late}건` : ''].filter(Boolean).join(' · '), body: x.t.slice(0, 10).join(', ').slice(0, 300), link: '/my-db' }));
  if (rows.length) await sb.from('notifications').insert(rows);
  return `sent ${rows.length}`;
}
