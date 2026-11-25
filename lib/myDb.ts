// 내 DB 알림 — 하루 한 번(평일 08:30 이후 첫 호출): 오늘 연락하기로 한 DB, 약속일이 지났는데 그대로인 DB 를 본인에게 알린다
import { supabaseAdmin } from '@/lib/supabase/admin';
import { search } from '@/lib/nsc';
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

/** 순위 자동 조회 — 평일 10시·14시. 내 DB(진행·결제, 상품 링크 있는 줄)의 키워드를 모아 키워드당 한 번만 지수 프로그램을 조회하고,
 *  그 키워드를 쓰는 모든 줄에 순위를 적는다. 한 번 호출에 budgetMs 만큼만 돌고, 남은 키워드는 다음 호출이 이어서 한다 (이번 회차에 이미 찍힌 줄은 건너뜀) */
export async function myDbRankTick(budgetMs = 20000): Promise<string> {
  const t0 = Date.now(); const now = new Date(t0 + 9 * 3600e3); const today = now.toISOString().slice(0, 10); const hm = now.toISOString().slice(11, 16); const dow = now.getUTCDay();
  if (dow === 0 || dow === 6 || hm < '10:00' || hm >= '19:00') return 'off';
  const slot = new Date(`${today}T${hm < '14:00' ? '10' : '14'}:00:00+09:00`).toISOString();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('my_db').select('id,owner_id,item,url,url2,rank_now,rank_hist,rank_at').is('deleted_at', null).in('status', ['진행', '결제']).neq('item', '')
    .or('url.ilike.%/products/%,url.ilike.%/catalog/%,url2.ilike.%/products/%,url2.ilike.%/catalog/%').or(`rank_at.is.null,rank_at.lt.${slot}`).order('id').limit(1000);
  if (error) return 'nosql';
  const by = new Map<string, any[]>(); for (const r of data ?? []) { const k = String(r.item).trim().replace(/\s+/g, ' '); if (!k || k.length > 40) continue; by.set(k, [...(by.get(k) ?? []), r]); }
  let kws = 0, rows = 0;
  for (const [kw, list] of by) {
    if (Date.now() - t0 > budgetMs) break;
    let prods: any[]; try { prods = ((await search(kw, list[0].owner_id, true)).products ?? []) as any[]; } catch (e: any) { return `err ${kw}: ${String(e?.message ?? e).slice(0, 50)} (${kws}kw ${rows}rows)`; }
    const at = new Date().toISOString();
    for (const r of list) {
      const pid = [r.url, r.url2].map(u => String(u ?? '').match(/\/products\/(\d+)/)?.[1]).find(Boolean); const cat = [r.url, r.url2].map(u => String(u ?? '').match(/\/catalog\/(\d+)/)?.[1]).find(Boolean);
      const hit = prods.filter(p => (pid && String(p.link ?? '').includes(`/products/${pid}`)) || (cat && String(p.nvmid ?? '') === cat)).sort((a, b) => a.rank - b.rank)[0]; const rk = hit ? Number(hit.rank) || 0 : 0;
      await sb.from('my_db').update({ rank_prev: r.rank_now, rank_now: rk, rank_at: at, rank_title: hit ? String(hit.productTitle ?? '').slice(0, 120) : '', rank_hist: [...(Array.isArray(r.rank_hist) ? r.rank_hist : []), { t: at, r: rk, k: kw }].slice(-90) }).eq('id', r.id);
      rows++;
    }
    kws++;
  }
  return `rank ${kws}/${by.size}kw ${rows}rows`;
}
