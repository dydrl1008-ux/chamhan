// 고객(업체) 등록 + 직원 배정 — 정산 사이트 '직원별 고객관리'(/api/pages/emp_customer) 와 동일 API. 어드민 세션(SETTLE_USER_*) 사용 (사이트도 관리자 전용 화면)
// 구조: TB_CUSTOMER(사업자번호당 1건, 킵 공유) ↔ EMP_CUSTOMER(직원-고객 매핑, 1:N). 직원 정산요청 화면에는 자기에게 배정된 고객만 보임
import { createClient } from '@supabase/supabase-js';
import { settleLogin, type SettleRow } from './client';
const BASE = () => (process.env.SETTLE_BASE_URL || 'https://chamhan.info').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const H = (cookie: string, json = false) => ({ Cookie: cookie, Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': UA, Referer: `${BASE()}/`, ...(json ? { 'Content-Type': 'application/json' } : {}) });
async function getJ(cookie: string, path: string) { const res = await fetch(`${BASE()}${path}`, { headers: H(cookie), cache: 'no-store', redirect: 'manual' }); const t = await res.text(); if (res.status >= 300) throw new Error(`세션 만료 또는 권한 없음 (${res.status})`); try { return JSON.parse(t); } catch { throw new Error(`JSON 아님 ${path}: ${t.slice(0, 80)}`); } }
async function send(cookie: string, path: string, method: string, body: unknown) { const res = await fetch(`${BASE()}${path}`, { method, headers: H(cookie, true), body: JSON.stringify(body), cache: 'no-store', redirect: 'manual' }); return { status: res.status, text: await res.text() }; }

let sess: { cookie: string; at: number } | null = null;
async function adminSession() { if (sess && Date.now() - sess.at < 10 * 60_000) return sess.cookie; const cookie = await settleLogin(); sess = { cookie, at: Date.now() }; return cookie; }
const arr = (j: any): SettleRow[] => Array.isArray(j) ? j : (j?.data ?? j?.list ?? []);
async function log(actorId: string, action: string, payload: unknown, result: string, ok: boolean) { await admin().from('settlement_requests').insert({ user_id: actorId, settlement_seq: null, action, payload: { _type: 'emp_customer', ...(payload as object) }, result: result.slice(0, 200), ok }); }

export type Emp = { empId: string; empName: string; deptName?: string; useInd?: string; workhubName?: string };
/** 직원 목록 — 사이트 직원 전체가 아니라, 워크허브에 등록된(활성) 사용자와 연결된 정산 계정만 (정산 계정 연결 or 담당자 매핑). 사이트 퇴사일 지난 계정 제외 */
export async function empList(): Promise<Emp[]> {
  const cookie = await adminSession(); const j = await getJ(cookie, '/api/pages/emp_customer/emp/list?isAdmin=Y&searchEmpId=&searchEmpNm=');
  const sb = admin();
  const [{ data: creds }, { data: maps }, { data: profs }] = await Promise.all([
    sb.from('settlement_credentials').select('user_id, settle_user_id'), sb.from('settlement_empl_map').select('empl_id, user_id'), sb.from('profiles').select('id, name, is_active'),
  ]);
  const active = new Map((profs ?? []).filter((p: any) => p.is_active).map((p: any) => [p.id, String(p.name ?? '')]));
  const allowed = new Map<string, string>();
  for (const m of maps ?? []) if (m.user_id && active.has(m.user_id)) allowed.set(String(m.empl_id).toLowerCase(), active.get(m.user_id)!);
  for (const c of creds ?? []) if (active.has(c.user_id)) allowed.set(String(c.settle_user_id).toLowerCase(), active.get(c.user_id)!);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return arr(j).map(r => ({ empId: String(r.empId ?? ''), empName: String(r.empName ?? ''), deptName: r.deptName ? String(r.deptName) : undefined, useInd: r.useInd ? String(r.useInd) : undefined, retireDate: r.retireDate ? String(r.retireDate).slice(0, 10) : '' }))
    .filter(e => e.empId && allowed.has(e.empId.toLowerCase()) && !(e.retireDate && e.retireDate <= today))
    .map(({ retireDate: _r, ...e }) => ({ ...e, workhubName: allowed.get(e.empId.toLowerCase()) }));
}
/** 특정 직원에게 배정된 고객 */
export async function empCustomers(empId: string): Promise<{ bizNo: string; custName: string; ownerName: string }[]> {
  const cookie = await adminSession(); const j = await getJ(cookie, `/api/pages/emp_customer/customer/list?empId=${encodeURIComponent(empId)}`);
  return arr(j).map(r => ({ bizNo: String(r.bizNo ?? ''), custName: String(r.custName ?? ''), ownerName: String(r.ownerName ?? '') }));
}
/** 전체 고객 검색 (사업자번호·고객명) */
export async function searchCustomers(q: string): Promise<{ bizNo: string; custName: string; ownerName: string }[]> {
  const cookie = await adminSession(); const j = await getJ(cookie, `/api/pages/emp_customer/customer/modal/list?searchCustId=${encodeURIComponent(q)}`);
  return arr(j).map(r => ({ bizNo: String(r.bizNo ?? ''), custName: String(r.custName ?? ''), ownerName: String(r.ownerName ?? '') }));
}
/** 고객 전체 + 각 고객의 배정 직원 (직원별 조회를 합침) */
export async function customerAssignments(): Promise<{ emps: Emp[]; byBiz: Record<string, string[]> }> {
  const emps = await empList(); const byBiz: Record<string, string[]> = {};
  for (const e of emps) { const cs = await empCustomers(e.empId).catch(() => []); for (const c of cs) (byBiz[c.bizNo] ??= []).push(e.empId); }
  return { emps, byBiz };
}
/** 직원 배정 (사이트 POST /api/pages/emp_customer/save 와 동일, 직원 1명씩 보내 중복은 건너뜀) */
export async function assign(actorId: string, bizNo: string, empIds: string[]): Promise<{ added: string[]; skipped: string[] }> {
  const cookie = await adminSession(); const added: string[] = [], skipped: string[] = [];
  for (const empId of [...new Set(empIds.map(s => s.trim()).filter(Boolean))]) {
    const payload = [{ empId, bizNo }]; const res = await send(cookie, '/api/pages/emp_customer/save', 'POST', payload); const ok = Number(res.text) > 0;
    await log(actorId, 'assign', { bizNo, empId }, `${res.status} ${res.text}`, ok);
    if (ok) added.push(empId); else if (/중복/.test(res.text)) skipped.push(empId); else throw new Error(`정산 사이트 응답 (${empId}): ${res.text.slice(0, 160) || res.status}`);
  }
  return { added, skipped };
}
/** 배정 해제 (사이트 DELETE /api/pages/emp_customer 와 동일) */
export async function unassign(actorId: string, bizNo: string, empId: string) {
  const cookie = await adminSession(); const payload = [{ empId, bizNo }]; const res = await send(cookie, '/api/pages/emp_customer', 'DELETE', payload); const ok = Number(res.text) > 0;
  await log(actorId, 'unassign', { bizNo, empId }, `${res.status} ${res.text}`, ok);
  if (!ok) throw new Error(`정산 사이트 응답: ${res.text.slice(0, 160) || res.status}`);
}
export type NewCustomer = { bizNo: string; custName: string; ownerName?: string; custTel?: string; custMail?: string; custAddr?: string; depositorName?: string; bizType?: string; bizClass?: string; incentiveRate?: number };
/** 고객 등록(어드민 세션) + 직원 배정. 사이트는 등록자(어드민)를 자동 배정하므로 그 매핑은 바로 제거 */
export async function createAndAssign(actorId: string, c: NewCustomer, empIds: string[]): Promise<{ bizNo: string; added: string[]; skipped: string[] }> {
  const cookie = await adminSession(); const adminId = process.env.SETTLE_USER_ID || '';
  const bizNo = c.bizNo.replace(/[^\d]/g, ''); if (!bizNo) throw new Error('사업자번호는 필수입니다'); if (!c.custName?.trim()) throw new Error('고객명을 입력하세요');
  if (c.custMail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.custMail)) throw new Error('이메일 형식이 올바르지 않습니다');
  const rate = Number(c.incentiveRate ?? 0); if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error('고객 인센율은 0~1 사이 (예: 0.3)');
  const payload = { isNew: true, bizNo, custName: c.custName.trim(), empId: adminId, ownerName: c.ownerName ?? '', custAddr: c.custAddr ?? '', custTel: c.custTel ?? '', custMail: c.custMail ?? '', depositorName: c.depositorName ?? '', mileage: 0, mileagePrev: 0, incentiveRate: rate, useInd: 'Y', bizType: c.bizType ?? '', bizClass: c.bizClass ?? '' };
  const res = await send(cookie, '/api/pages/customer', 'POST', payload); const ok = Number(res.text) > 0;
  await log(actorId, 'create', { customer: payload }, `${res.status} ${res.text}`, ok);
  if (!ok) throw new Error(`정산 사이트 응답: ${res.text.slice(0, 160) || res.status}`);
  const r = await assign(actorId, bizNo, empIds);
  if (adminId && !empIds.includes(adminId)) { await unassign(actorId, bizNo, adminId).catch(() => {}); }   // 어드민 자동 배정 제거 (실패해도 무해)
  return { bizNo, ...r };
}
