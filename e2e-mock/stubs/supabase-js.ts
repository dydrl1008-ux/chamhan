// 메모리 Supabase 스텁 (eq/is/in/order/limit/maybeSingle/single/insert/upsert/update/delete/rpc)
const tables: Record<string, any[]> = { settlement_credentials: [], settlement_actions: [], settlement_requests: [], settlement_pending: [], settlement_empl_map: [], app_settings: [{ key: 'settle_pending_code', value: '01' }] };
export const store = tables;
class Q { private t: string; private rows: any[]; private filters: ((r: any) => boolean)[] = []; private op: string = 'select'; private payload: any; private conflict?: string; private lim?: number; private single = false;
  constructor(t: string) { this.t = t; this.rows = tables[t] ??= []; }
  select() { return this; } eq(k: string, v: any) { this.filters.push(r => r[k] === v); return this; } is(k: string, v: any) { this.filters.push(r => (r[k] ?? null) === v); return this; } in(k: string, vs: any[]) { this.filters.push(r => vs.includes(r[k])); return this; } not() { return this; } lt() { return this; } lte() { return this; } gte() { return this; } neq() { return this; } order() { return this; } limit(n: number) { this.lim = n; return this; } maybeSingle() { this.single = true; return this; } single() { this.single = true; return this; }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this; } upsert(p: any, o?: any) { this.op = 'upsert'; this.payload = p; this.conflict = o?.onConflict; return this; } update(p: any) { this.op = 'update'; this.payload = p; return this; } delete() { this.op = 'delete'; return this; }
  private run() { const f = (r: any) => this.filters.every(x => x(r)); let data: any = null;
    if (this.op === 'select') { data = this.rows.filter(f); if (this.lim) data = data.slice(0, this.lim); if (this.single) data = data[0] ?? null; }
    else if (this.op === 'insert') { const arr = Array.isArray(this.payload) ? this.payload : [this.payload]; this.rows.push(...arr.map(x => ({ ...x }))); data = this.single ? arr[0] : arr; }
    else if (this.op === 'upsert') { const arr = Array.isArray(this.payload) ? this.payload : [this.payload]; const keys = (this.conflict ?? 'user_id').split(','); for (const x of arr) { const i = this.rows.findIndex(r => keys.every(k => r[k] === x[k])); if (i >= 0) this.rows[i] = { ...this.rows[i], ...x }; else this.rows.push({ ...x }); } data = this.single ? arr[0] : arr; }
    else if (this.op === 'update') { data = []; for (const r of this.rows) if (f(r)) { Object.assign(r, this.payload); data.push(r); } if (this.single) data = data[0] ?? null; }
    else if (this.op === 'delete') { for (let i = this.rows.length - 1; i >= 0; i--) if (f(this.rows[i])) this.rows.splice(i, 1); data = []; }
    return { data, error: null, count: Array.isArray(data) ? data.length : null }; }
  then(res: any, rej?: any) { return Promise.resolve(this.run()).then(res, rej); } }
export function createClient() { return { from: (t: string) => new Q(t), rpc: async () => ({ data: 0, error: null }), auth: {} }; }
