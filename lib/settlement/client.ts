// 정산 사이트(lchkgy.com) 클라이언트 — 서버 전용. 로그인(POST /login_proc, JSESSIONID) 후 정산승인 API 조회
const BASE = () => (process.env.SETTLE_BASE_URL || 'http://lchkgy.com').replace(/\/$/, '');
export type SettleRow = Record<string, unknown>;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
function cookieJar(): Record<string, string> { return {}; }
function absorb(jar: Record<string, string>, res: Response) { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); } }
const cookieStr = (jar: Record<string, string>) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

export async function settleLogin(cred?: { userId: string; userPw: string }): Promise<string> {
  const co = process.env.SETTLE_CO_CODE, id = cred?.userId ?? process.env.SETTLE_USER_ID, pw = cred?.userPw ?? process.env.SETTLE_USER_PW;
  if (!co || !id || !pw) throw new Error('SETTLE_CO_CODE / SETTLE_USER_ID / SETTLE_USER_PW 환경변수 필요');
  const jar = cookieJar();
  // 1) 로그인 페이지: 초기 세션 + CSRF 토큰
  const pre = await fetch(`${BASE()}/login`, { redirect: 'manual', cache: 'no-store', headers: { 'User-Agent': UA } });
  absorb(jar, pre); const html = await pre.text();
  const csrf = html.match(/name="_csrf"[^>]*value="([^"]+)"/)?.[1] ?? html.match(/value="([^"]+)"[^>]*name="_csrf"/)?.[1] ?? html.match(/<meta name="_csrf" content="([^"]+)"/)?.[1];
  // 2) 로그인
  const body = new URLSearchParams({ coCode: co, userId: id, userPw: pw, ...(csrf ? { _csrf: csrf } : {}) });
  const res = await fetch(`${BASE()}/login_proc`, { method: 'POST', body, redirect: 'manual', cache: 'no-store', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Referer: `${BASE()}/login`, ...(cookieStr(jar) ? { Cookie: cookieStr(jar) } : {}) } });
  absorb(jar, res);
  const loc = res.headers.get('location') ?? '';
  if (/error/i.test(loc)) throw new Error(`정산 사이트 로그인 거부 (아이디/비밀번호 확인)`);
  if (res.status >= 400) throw new Error(`로그인 요청 실패 status ${res.status}`);
  if (!jar['JSESSIONID'] && !Object.keys(jar).some(k => /SESSION/i.test(k))) throw new Error(`로그인 후 세션 쿠키 없음 (login_proc ${res.status}${loc ? ' → ' + loc : ''})`);
  return cookieStr(jar);
}
export async function fetchApprovals(cookie: string, from: string, to: string, applyStatus = ''): Promise<SettleRow[]> {
  const url = `${BASE()}/api/pages/applypaymentapprmng?searchStartDate=${from}&searchEndDate=${to}&emplName=&applyStatus=${encodeURIComponent(applyStatus)}&custName=&prodName=&reqGubun=`;
  const res = await fetch(url, { headers: { Cookie: cookie, Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA, Referer: `${BASE()}/` }, cache: 'no-store', redirect: 'manual' });
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { throw new Error(`JSON 아님 (status ${res.status}): ` + text.slice(0, 120)); }
  if (json && !Array.isArray(json) && json.error && json.status) throw new Error(`정산 API 오류 ${json.status} ${json.error} (${json.path ?? ''}) — 세션/권한 문제`);
  const arr = Array.isArray(json) ? json : (json.data ?? json.list ?? json.rows ?? json.items ?? json.content ?? json.result ?? json.resultList);
  if (!Array.isArray(arr)) throw new Error('배열을 찾지 못함. 최상위 키: ' + Object.keys(json).join(',') + ' / 샘플: ' + text.slice(0, 200));
  return arr as SettleRow[];
}
/** 필드 자동 추정 (연결 테스트 시 기본값 제안용) */
export function guessMap(sample: SettleRow) {
  const keys = Object.keys(sample); const find = (re: RegExp) => keys.find(k => re.test(k)) ?? '';
  return { settle_no: find(/settle.*no|apply.*no|^no$|seq|id$/i), empl_id: find(/empl.*id|emp.*id|user.*id|charge.*id/i), req_date: find(/req.*d(ate|t)|apply.*d(ate|t)|reg.*d(ate|t)/i), profit: find(/profit|margin|income/i), status: find(/status|state|stat$|apprv|appr/i), status_ok: '승인완료' };
}
