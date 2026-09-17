// 정산 사이트(lchkgy.com) → 워크허브 동기화 (GitHub Actions / PC 어디서든 실행). 정산 사이트는 조회만 함.
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SETTLE_CO_CODE, SETTLE_USER_ID, SETTLE_USER_PW, [SETTLE_BASE_URL], [FROM], [TO], [DAYS]
import { createClient } from '@supabase/supabase-js';
const env = process.env;
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SETTLE_CO_CODE', 'SETTLE_USER_ID', 'SETTLE_USER_PW']) if (!env[k]) { console.error('환경변수 없음: ' + k); process.exit(1); }
const BASE = (env.SETTLE_BASE_URL || 'http://lchkgy.com').replace(/\/$/, '');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const kst = () => new Date(Date.now() + 9 * 3600e3); const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const today = iso(kst()); const TO = env.TO || today; const FROM = env.FROM || addDays(TO, -(Number(env.DAYS || 7) - 1));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const jar = {}; const absorb = res => { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); } };
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function login() {
  const pre = await fetch(`${BASE}/login`, { redirect: 'manual', headers: { 'User-Agent': UA } }); absorb(pre); const html = await pre.text();
  const csrf = html.match(/name="_csrf"[^>]*value="([^"]+)"/)?.[1] ?? html.match(/<meta name="_csrf" content="([^"]+)"/)?.[1];
  const body = new URLSearchParams({ coCode: env.SETTLE_CO_CODE, userId: env.SETTLE_USER_ID, userPw: env.SETTLE_USER_PW, ...(csrf ? { _csrf: csrf } : {}) });
  const res = await fetch(`${BASE}/login_proc`, { method: 'POST', body, redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Referer: `${BASE}/login`, Cookie: cookie() } }); absorb(res);
  const loc = res.headers.get('location') ?? ''; if (/error/i.test(loc) || res.status >= 400) throw new Error(`로그인 거부 ${res.status} ${loc}`);
  if (!jar.JSESSIONID) throw new Error('세션 쿠키 없음');
}
async function fetchWindow(s, e, attempt = 1) {
  const url = `${BASE}/api/pages/applypaymentapprmng?searchStartDate=${s}&searchEndDate=${e}&emplName=&applyStatus=&custName=&prodName=&reqGubun=`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { Cookie: cookie(), Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA, Referer: `${BASE}/` }, redirect: 'manual', signal: AbortSignal.timeout(180000) });
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { throw new Error(`JSON 아님 ${res.status}: ${text.slice(0, 100)}`); }
    if (!Array.isArray(json) && json?.error) throw new Error(`API 오류 ${json.status} ${json.error} ${json.path ?? ''}`);
    const arr = Array.isArray(json) ? json : (json.data ?? json.list ?? json.rows ?? json.items ?? json.content ?? json.result ?? json.resultList);
    if (!Array.isArray(arr)) throw new Error('배열 없음: ' + Object.keys(json).join(','));
    console.log(`  ${s}~${e}: ${arr.length}건 (${((Date.now() - t0) / 1000).toFixed(1)}s)`); return arr;
  } catch (e) { if (attempt < 3) { console.log(`  ${s}~${e} 재시도 ${attempt}: ${e.message}`); await sleep(3000 * attempt); if (/세션|401|403|302/.test(e.message)) await login(); return fetchWindow(s, e, attempt + 1); } throw e; }
}
const toDate = v => { const m = String(v ?? '').match(/(\d{4})[-./]?(\d{2})[-./]?(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const toNum = v => { const n = Number(String(v ?? '0').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
(async () => {
  const { data: run } = await sb.from('settlement_sync_runs').insert({ range_from: FROM, range_to: TO, triggered_by: env.TRIGGERED_BY || 'github-actions' }).select('id').single();
  const finish = async (ok, message, fetched = 0, applied = 0) => { if (run) await sb.from('settlement_sync_runs').update({ finished_at: new Date().toISOString(), ok, message, rows_fetched: fetched, rows_applied: applied }).eq('id', run.id); console.log((ok ? 'OK ' : 'FAIL ') + message); if (!ok) process.exit(1); };
  try {
    const { data: ms } = await sb.from('app_settings').select('value').eq('key', 'settle_field_map').maybeSingle();
    const map = JSON.parse(ms?.value || '{}'); if (!map.settle_no || !map.empl_id || !map.req_date || !map.profit || !map.status) return finish(false, '필드 매핑 없음 (워크허브 정산 연동 화면에서 저장)');
    console.log(`동기화 ${FROM} ~ ${TO}`); await login();
    const qFrom = addDays(FROM, -15), qTo = addDays(TO, 15); const rows = []; const seen = new Set(); const win = [];
    for (let s = qFrom; s <= qTo; s = addDays(s, 5)) { const e = addDays(s, 4) > qTo ? qTo : addDays(s, 4); const part = await fetchWindow(s, e); win.push(`${s.slice(5)}~${e.slice(5)}:${part.length}`); for (const r of part) { const k = JSON.stringify(r); if (!seen.has(k)) { seen.add(k); rows.push(r); } } await sleep(300); }
    const keyOf = r => [r[map.settle_no], r.confirmSeq, r.reqGubun].filter(v => v != null && String(v) !== '').map(String).join('|');
    const items = rows.map(r => ({ settle_no: keyOf(r), empl_id: String(r[map.empl_id] ?? '').trim(), req_date: toDate(r[map.req_date]), profit: toNum(r[map.profit]), status: String(r[map.status] ?? '').trim(), raw: r })).filter(x => x.settle_no && x.req_date && x.req_date >= FROM && x.req_date <= TO);
    if (rows.length && !items.length) return finish(false, `매핑 필드에서 값을 못 읽음 (키: ${Object.keys(rows[0]).join(',')})`, rows.length);
    const { error: ed } = await sb.from('settlement_items').delete().gte('req_date', FROM).lte('req_date', TO); if (ed) return finish(false, '기간 정리 실패: ' + ed.message);
    for (let i = 0; i < items.length; i += 500) { const { error } = await sb.from('settlement_items').upsert(items.slice(i, i + 500), { onConflict: 'settle_no' }); if (error) return finish(false, '저장 실패: ' + error.message, rows.length); }
    const { data: applied, error } = await sb.rpc('apply_settlement_margin', { p_from: FROM, p_to: TO }); if (error) return finish(false, 'KPI 반영 실패: ' + error.message, rows.length);
    await finish(true, `${FROM}~${TO} 정산 ${items.length}건 → KPI ${applied}건 반영 [${win.join(' ')}]`, items.length, Number(applied ?? 0));
  } catch (e) { await finish(false, e.message); }
})();
