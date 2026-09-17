// 정산 사이트(lchkgy.com) 클라이언트 — 서버 전용. 로그인(POST /login_proc, JSESSIONID) 후 정산승인 API 조회
const BASE = () => (process.env.SETTLE_BASE_URL || 'http://lchkgy.com').replace(/\/$/, '');
export type SettleRow = Record<string, unknown>;
export async function settleLogin(): Promise<string> {
  const co = process.env.SETTLE_CO_CODE, id = process.env.SETTLE_USER_ID, pw = process.env.SETTLE_USER_PW;
  if (!co || !id || !pw) throw new Error('SETTLE_CO_CODE / SETTLE_USER_ID / SETTLE_USER_PW 환경변수 필요');
  // 1) 로그인 페이지에서 초기 세션 쿠키 (CSRF 토큰이 있으면 같이)
  const pre = await fetch(`${BASE()}/login`, { redirect: 'manual', cache: 'no-store' });
  const preCookie = cookieOf(pre.headers.getSetCookie?.() ?? []);
  const html = await pre.text();
  const csrf = html.match(/name="_csrf"[^>]*value="([^"]+)"/)?.[1] ?? html.match(/value="([^"]+)"[^>]*name="_csrf"/)?.[1];
  const body = new URLSearchParams({ coCode: co, userId: id, userPw: pw, ...(csrf ? { _csrf: csrf } : {}) });
  const res = await fetch(`${BASE()}/login_proc`, { method: 'POST', body, redirect: 'manual', cache: 'no-store', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(preCookie ? { Cookie: preCookie } : {}) } });
  const loc = res.headers.get('location') ?? '';
  const cookie = cookieOf(res.headers.getSetCookie?.() ?? []) || preCookie;
  if (/error/i.test(loc) || res.status >= 400) throw new Error(`정산 사이트 로그인 실패 (status ${res.status}${loc ? ', → ' + loc : ''})`);
  if (!cookie) throw new Error('세션 쿠키를 받지 못했습니다');
  return cookie;
}
function cookieOf(setCookies: string[]) { return setCookies.map(c => c.split(';')[0]).filter(c => /JSESSIONID|SESSION/i.test(c)).join('; '); }
export async function fetchApprovals(cookie: string, from: string, to: string): Promise<SettleRow[]> {
  const url = `${BASE()}/api/pages/applypaymentapprmng?searchStartDate=${from}&searchEndDate=${to}&emplName=&applyStatus=&custName=&prodName=&reqGubun=`;
  const res = await fetch(url, { headers: { Cookie: cookie, Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest' }, cache: 'no-store', redirect: 'manual' });
  if (res.status === 302 || res.status === 401 || res.status === 403) throw new Error('세션 만료/권한 없음 (로그인 응답 확인)');
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { throw new Error('JSON 아님: ' + text.slice(0, 120)); }
  const arr = Array.isArray(json) ? json : (json.data ?? json.list ?? json.rows ?? json.items ?? json.content ?? json.result);
  if (!Array.isArray(arr)) throw new Error('배열을 찾지 못함. 최상위 키: ' + Object.keys(json).join(','));
  return arr as SettleRow[];
}
/** 필드 자동 추정 (연결 테스트 시 기본값 제안용) */
export function guessMap(sample: SettleRow) {
  const keys = Object.keys(sample); const find = (re: RegExp) => keys.find(k => re.test(k)) ?? '';
  return { settle_no: find(/settle.*no|apply.*no|^no$|seq|id$/i), empl_id: find(/empl.*id|emp.*id|user.*id|charge.*id/i), req_date: find(/req.*d(ate|t)|apply.*d(ate|t)|reg.*d(ate|t)/i), profit: find(/profit|margin|income/i), status: find(/status|state|stat$|apprv|appr/i), status_ok: '승인완료' };
}
