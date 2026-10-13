import http from 'node:http'; import fs from 'node:fs';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'; process.env.NSC_BASE_URL = 'http://127.0.0.1:18090'; process.env.NSC_SESSION = 'abc';
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/nsc_search_sample.json', import.meta.url), 'utf8')); let calls = 0;
const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { if (!String(req.headers.cookie).includes('session=abc')) { res.writeHead(401); return res.end('{}'); } if (req.url === '/api/me') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ success: true, user: fx.user })); } if (req.url === '/api/search' && req.method === 'POST') { calls++; const kw = JSON.parse(b).keyword; res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ...fx, data: { ...fx.data, insights: { ...fx.data.insights, 검색어: kw } } })); } res.writeHead(404); res.end(); }); });
srv.listen(18090, async () => {
  const { search, me, myUsage } = await import('@/lib/nsc'); const { store } = await import('@supabase/supabase-js') as any;
  store.app_settings.push({ key: 'nsc_daily_per_user', value: '2' }, { key: 'nsc_cache_hours', value: '24' });
  let ok = 0, fail = 0; const T = (n: string, c: boolean, d = '') => { c ? ok++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
  const u = await me(); T('me', u.plan_name === '비즈니스');
  const r1 = await search(' 꽃게 ', 'u1'); T('첫 조회: 사이트 호출, 5개 상품, 캐시 아님', calls === 1 && r1.products.length === 5 && !r1.cached && r1.products[0].hitStarScore === 4, JSON.stringify({ calls, n: r1.products.length }));
  const r2 = await search('꽃게', 'u2'); T('같은 키워드 다른 사람: 캐시 (사이트 호출 없음)', calls === 1 && r2.cached);
  await search('비타민', 'u1'); const us = await myUsage('u1'); T('실제 호출만 한도에 집계', us.used === 2 && us.limit === 2, JSON.stringify(us));
  try { await search('콜라겐', 'u1'); T('한도 초과 → 차단', false); } catch (e: any) { T('한도 초과 → 차단', /한도/.test(e.message), e.message); }
  const r3 = await search('꽃게', 'u1'); T('한도 초과여도 캐시는 조회 가능', r3.cached);
  const r4 = await search('꽃게', 'u3', true); T('강제 재조회 → 사이트 호출', calls === 3 && !r4.cached);
  process.env.NSC_SESSION = 'bad'; try { await me(); T('세션 만료 → 안내 메시지', false); } catch (e: any) { T('세션 만료 → 안내 메시지', /NSC_SESSION/.test(e.message), e.message); }
  console.log(`=== ${ok}/${ok + fail} ${fail ? '✗' : '✓'} ===`); srv.close(); process.exit(fail ? 1 : 0);
});
