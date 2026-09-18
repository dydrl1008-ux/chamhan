import { settleLogin, type SettleRow } from './client';
const BASE = () => (process.env.SETTLE_BASE_URL || 'http://lchkgy.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
async function getJson(cookie: string, path: string): Promise<SettleRow[]> {
  const res = await fetch(`${BASE()}${path}`, { headers: { Cookie: cookie, Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA, Referer: `${BASE()}/` }, cache: 'no-store', redirect: 'manual' });
  const t = await res.text(); let j: any; try { j = JSON.parse(t); } catch { throw new Error(`JSON 아님 (${res.status}) ${path}: ${t.slice(0, 100)}`); }
  if (j && !Array.isArray(j) && j.error) throw new Error(`API 오류 ${j.status} ${j.error} ${j.path ?? ''}`);
  return Array.isArray(j) ? j : (j.data ?? j.list ?? j.rows ?? []);
}
let cache: { at: number; key: string; data: SettleRow[] }[] = [];
async function cached(key: string, fn: () => Promise<SettleRow[]>, ttlMs = 10 * 60_000) {
  const hit = cache.find(c => c.key === key); if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const data = await fn(); cache = [...cache.filter(c => c.key !== key), { key, data, at: Date.now() }].slice(-20); return data;
}
export const fetchCustomers = () => cached('customers', async () => { const c = await settleLogin(); return getJson(c, '/api/pages/customer?bizNo=&custName=&empId='); });
export const fetchTaxInvoices = (from: string, to: string) => cached(`tax:${from}:${to}`, async () => { const c = await settleLogin(); return getJson(c, `/api/pages/taxinvoices?searchStartDate=${from}&searchEndDate=${to}&custName=&prodName=`); });
export const fetchPayroll = (from: string, to: string) => cached(`pay:${from}:${to}`, async () => { const c = await settleLogin(); return getJson(c, `/api/pages/payrollmng?searchPayYmStart=${from}&searchPayYmEnd=${to}&searchProdName=&searchEmpName=&searchCustName=&searchPayGubun=`); });
