'use server';
import { getProfile } from '@/lib/auth/session';
import { empList, empCustomers, searchCustomers, customerAssignments, assign, unassign, createAndAssign, type NewCustomer } from '@/lib/settlement/customers';
type R<T = {}> = { ok: boolean; msg: string } & Partial<T>;
async function mgr() { const me = await getProfile(); if (!me || !(me.role === 'admin' || me.role === 'head' || me.is_mgmt)) throw new Error('관리팀·총괄·어드민만 가능'); return me; }
export async function loadEmps(): Promise<R<{ emps: Awaited<ReturnType<typeof empList>> }>> { try { await mgr(); return { ok: true, msg: '', emps: await empList() }; } catch (e: any) { return { ok: false, msg: e.message }; } }
export async function loadAssignments(): Promise<R<Awaited<ReturnType<typeof customerAssignments>>>> { try { await mgr(); return { ok: true, msg: '', ...(await customerAssignments()) }; } catch (e: any) { return { ok: false, msg: e.message }; } }
export async function loadEmpCustomers(empId: string): Promise<R<{ list: Awaited<ReturnType<typeof empCustomers>> }>> { try { await mgr(); return { ok: true, msg: '', list: await empCustomers(empId) }; } catch (e: any) { return { ok: false, msg: e.message }; } }
export async function findCustomers(q: string): Promise<R<{ list: Awaited<ReturnType<typeof searchCustomers>> }>> { try { await mgr(); return { ok: true, msg: '', list: await searchCustomers(q) }; } catch (e: any) { return { ok: false, msg: e.message }; } }
export async function assignCustomer(bizNo: string, empIds: string[]): Promise<R> {
  try { const me = await mgr(); if (!empIds.length) return { ok: false, msg: '직원을 선택하세요' }; const r = await assign(me.id, bizNo, empIds); return { ok: true, msg: `배정 ${r.added.length}명${r.skipped.length ? ` · 이미 배정 ${r.skipped.length}명` : ''}` }; }
  catch (e: any) { return { ok: false, msg: e.message }; }
}
export async function unassignCustomer(bizNo: string, empId: string): Promise<R> { try { const me = await mgr(); await unassign(me.id, bizNo, empId); return { ok: true, msg: `${empId} 배정 해제` }; } catch (e: any) { return { ok: false, msg: e.message }; } }
export async function createCustomerAssigned(fd: FormData): Promise<R<{ bizNo: string }>> {
  try {
    const me = await mgr(); const g = (k: string) => String(fd.get(k) ?? '').trim(); const empIds = fd.getAll('empIds').map(String).filter(Boolean);
    if (!empIds.length) return { ok: false, msg: '담당 직원을 1명 이상 선택하세요' };
    const c: NewCustomer = { bizNo: g('bizNo'), custName: g('custName'), ownerName: g('ownerName'), custTel: g('custTel'), custMail: g('custMail'), custAddr: g('custAddr'), depositorName: g('depositorName'), bizType: g('bizType'), bizClass: g('bizClass'), incentiveRate: g('incentiveRate') ? Number(g('incentiveRate')) : 0 };
    const r = await createAndAssign(me.id, c, empIds); return { ok: true, msg: `고객 등록 + ${r.added.length}명 배정 완료`, bizNo: r.bizNo };
  } catch (e: any) { return { ok: false, msg: e.message }; }
}
