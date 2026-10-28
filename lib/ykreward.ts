// ykreward (리워드 슬롯 관리, 별도 Supabase 프로젝트) 연동 — 서비스 키로 서버에서만 호출
//   env: YKREWARD_URL, YKREWARD_SERVICE_KEY
import { createClient } from '@supabase/supabase-js';

export const ykrReady = () => !!(process.env.YKREWARD_URL && process.env.YKREWARD_SERVICE_KEY);
export const ykr = () => createClient(process.env.YKREWARD_URL!, process.env.YKREWARD_SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const EMAIL_DOMAIN = 'ykad.local';                                   // ykreward 로그인 이메일 규칙: <아이디>@ykad.local

export type Seller = { id: string; login_id: string; name: string; parent: string; manager: string | null; active: boolean; slots: number };
export type SlotType = { name: string; sort_order: number };

/** 셀러 아이디 하나 조회 (목록은 안 보여줌 — 각자 자기 고객만) */
export async function findSeller(login: string): Promise<Seller | null> {
  const sb = ykr(); const id = login.trim().toLowerCase(); if (!id) return null;
  const { data: a } = await sb.from('accounts').select('id,login_id,name,role,parent_id,manager,active').eq('login_id', id).maybeSingle();
  if (!a || a.role !== 'seller') return null;
  const [{ data: parent }, { count }] = await Promise.all([
    a.parent_id ? sb.from('accounts').select('name').eq('id', a.parent_id).maybeSingle() : Promise.resolve({ data: null as any }),
    sb.from('slots').select('id', { count: 'exact', head: true }).eq('owner_id', a.id).is('stopped_at', null).is('dropped_at', null),
  ]);
  return { id: a.id, login_id: a.login_id, name: a.name ?? '', parent: parent?.name ?? '', manager: a.manager, active: !!a.active, slots: count ?? 0 };
}
export const DEFAULT_BLOCK = '아센도,리얼,세이브';
export const parseBlock = (v: string | null | undefined) => (v ?? DEFAULT_BLOCK).split(',').map(x => x.trim()).filter(Boolean);
export const isBlocked = (type: string, block: string[]) => block.some(b => type.replace(/\s/g, '').includes(b.replace(/\s/g, '')));
/** 발급 가능한 유형만 (설정 ykreward_block_types 에 걸리는 유형 제외) */
export async function listSlotTypes(block: string[]): Promise<SlotType[]> {
  const { data } = await ykr().from('slot_types').select('name,sort_order').eq('active', true).order('sort_order');
  return ((data ?? []) as SlotType[]).filter(t => !isBlocked(t.name, block));
}
/** 활성 유형이 하나도 없으면 ykreward 도 유형 없이(null) 발급하므로 그대로 허용 */
export async function hasActiveTypes(): Promise<boolean> {
  const { count } = await ykr().from('slot_types').select('id', { count: 'exact', head: true }).eq('active', true);
  return (count ?? 0) > 0;
}
/** 셀러 계정 생성: auth 유저(<id>@ykad.local) + accounts 행. 소속(parent)은 app_settings.ykreward_parent_login */
export async function createSeller(p: { login: string; password: string; name: string; parentLogin: string; manager: string }): Promise<{ ok: boolean; msg: string }> {
  const login = p.login.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(login)) return { ok: false, msg: '아이디는 영문 소문자·숫자·_ 3~30자' };
  if (p.password.length < 6) return { ok: false, msg: '비밀번호는 6자 이상' };
  const sb = ykr();
  const { data: dup } = await sb.from('accounts').select('id').eq('login_id', login).maybeSingle();
  if (dup) return { ok: false, msg: `이미 있는 아이디입니다: ${login}` };
  const { data: parent } = await sb.from('accounts').select('id,role').eq('login_id', p.parentLogin).maybeSingle();
  if (!parent) return { ok: false, msg: `소속 계정(${p.parentLogin})을 ykreward 에서 찾을 수 없습니다. 설정 › ykreward_parent_login 확인` };
  const { data: u, error: e1 } = await sb.auth.admin.createUser({ email: `${login}@${EMAIL_DOMAIN}`, password: p.password, email_confirm: true, user_metadata: { login_id: login, created_by: 'workhub' } });
  if (e1 || !u.user) return { ok: false, msg: `auth 생성 실패: ${e1?.message ?? ''}` };
  const { error: e2 } = await sb.from('accounts').insert({ id: u.user.id, login_id: login, role: 'seller', parent_id: parent.id, name: p.name.trim() || login, manager: p.manager, active: true });
  if (e2) { await sb.auth.admin.deleteUser(u.user.id).catch(() => {}); return { ok: false, msg: `계정 행 생성 실패: ${e2.message}` }; }
  return { ok: true, msg: `셀러 계정 생성: ${login}` };
}
/** 슬롯 발급 (ykreward workhub_issue_slots) → 발급된 슬롯 code 목록 */
export async function issueSlots(p: { login: string; count: number; dailyGoal: number; start: string; days: number; slotType: string; rewardName: string; openedBy: string }): Promise<{ ok: boolean; msg: string; codes: number[] }> {
  const { data, error } = await ykr().rpc('workhub_issue_slots', { p_target_login: p.login, p_count: p.count, p_daily_goal: p.dailyGoal, p_start: p.start, p_days: p.days, p_slot_type: p.slotType || null, p_reward_name: p.rewardName || null, p_opened_by: p.openedBy });
  if (error) return { ok: false, msg: error.message.replace(/^.*?: /, ''), codes: [] };
  const codes = ((data ?? []) as any[]).map(s => Number(s.code)).filter(Boolean);
  return { ok: true, msg: `${codes.length}개 발급`, codes };
}
/** 워크허브에서 연 슬롯 현황 (opened_by = 워크허브 직원 이름) */
export type OpenedSlot = { id: string; code: number; owner: string; slot_type: string | null; reward_name: string | null; opened_by: string; keyword: string | null; mid: string | null; registered_at: string | null; stopped_at: string | null; dropped_at: string | null; start_date: string | null; end_date: string | null; daily_goal: number | null };
export async function openedSlots(openedBy?: string[]): Promise<OpenedSlot[]> {
  let q = ykr().from('slots').select('id,code,owner_id,slot_type,reward_name,opened_by,keyword,mid,registered_at,stopped_at,dropped_at,accounts!owner_id(login_id,name),slot_segments(start_date,end_date,daily_goal,seq)').not('opened_by', 'is', null).order('code', { ascending: false }).limit(1000);
  if (openedBy?.length) q = q.in('opened_by', openedBy);
  const { data, error } = await q;
  if (error) throw new Error('ykreward 조회 실패: ' + error.message);
  return (data ?? []).map((s: any) => { const segs = [...(s.slot_segments ?? [])].sort((a: any, b: any) => a.seq - b.seq); const acc = Array.isArray(s.accounts) ? s.accounts[0] : s.accounts;
    return { id: s.id, code: Number(s.code), owner: acc ? `${acc.name ?? ''} (${acc.login_id})` : '', slot_type: s.slot_type, reward_name: s.reward_name, opened_by: s.opened_by, keyword: s.keyword, mid: s.mid, registered_at: s.registered_at, stopped_at: s.stopped_at, dropped_at: s.dropped_at, start_date: segs[0]?.start_date ?? null, end_date: segs.at(-1)?.end_date ?? null, daily_goal: segs[0]?.daily_goal ?? null }; });
}

/** 상품 URL → MID (스마트스토어·브랜드스토어 상품 페이지만, 가격비교(catalog)는 ykreward 에서) */
export function parseMid(url: string): { ok: true; mid: string; url: string } | { ok: false; msg: string } {
  const u = url.trim(); if (!u) return { ok: false, msg: '상품 URL이 없습니다' };
  const m = u.match(/^https?:\/\/(?:m\.)?(?:smartstore|brand)\.naver\.com\/[^/?#]+\/products\/(\d+)/i);
  if (m) return { ok: true, mid: m[1], url: u.split(/[?#]/)[0] };
  if (/shopping\.naver\.com\/.*catalog\/\d+/i.test(u)) return { ok: false, msg: '가격비교(카탈로그) 상품은 ykreward 에서 등록해 주세요' };
  return { ok: false, msg: '스마트스토어·브랜드스토어 상품 URL(…/products/숫자)만 등록할 수 있습니다' };
}
/** 발급된 슬롯에 상품·키워드 등록 — 워크허브가 연 슬롯(opened_by 있음)만. 트리거가 수집 큐에 넣음 */
export async function registerSlots(p: { codes: number[]; url: string; keyword: string }): Promise<{ ok: boolean; msg: string; n: number }> {
  const r = parseMid(p.url); if (!r.ok) return { ok: false, msg: r.msg, n: 0 };
  const kw = p.keyword.trim(); if (!kw) return { ok: false, msg: '키워드를 입력하세요', n: 0 };
  const { data, error } = await ykr().from('slots').update({ url: r.url, mid: r.mid, keyword: kw, cmp: '단독', cmp_checked: true, cmp_mid: null, registered_at: new Date().toISOString() })
    .in('code', p.codes).not('opened_by', 'is', null).is('dropped_at', null).select('code');
  if (error) return { ok: false, msg: 'ykreward 등록 실패: ' + error.message, n: 0 };
  return { ok: true, msg: `${data?.length ?? 0}개 슬롯에 등록 (MID ${r.mid} · ${kw})`, n: data?.length ?? 0 };
}
