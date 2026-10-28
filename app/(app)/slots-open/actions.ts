'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { issueSlots, createSeller, findSeller, registerSlots, parseMid, ykrReady, parseBlock, isBlocked, type Seller } from '@/lib/ykreward';
type R = { ok: boolean; msg: string };
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ALLOWED = ['staff', 'manager', 'head', 'admin'];

export async function openSlots(fd: FormData): Promise<R & { codes?: number[] }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!ALLOWED.includes(me.role)) return { ok: false, msg: '권한 없음' };
  if (!ykrReady()) return { ok: false, msg: 'ykreward 연동 설정(YKREWARD_URL / YKREWARD_SERVICE_KEY)이 없습니다.' };
  const login = String(fd.get('login') || '').trim(); const count = Number(fd.get('count')); const dailyGoal = Number(fd.get('daily_goal')); const start = String(fd.get('start') || ''); const days = Number(fd.get('days'));
  const rewardName = String(fd.get('reward_name') || '').trim(); const targetName = String(fd.get('target_name') || '');
  const url = String(fd.get('url') || '').trim(); const keyword = String(fd.get('keyword') || '').trim();
  if (!login) return { ok: false, msg: '셀러를 선택하세요' };
  if (!(count >= 1 && count <= 500)) return { ok: false, msg: '슬롯 수는 1~500' };
  if (!(dailyGoal >= 1)) return { ok: false, msg: '일유입을 입력하세요' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { ok: false, msg: '시작일을 선택하세요' };
  if (!(days >= 1)) return { ok: false, msg: '운영일수를 입력하세요' };
  if (!rewardName) return { ok: false, msg: '리워드 이름을 입력하세요' };
  if ((url || keyword) && (!url || !keyword)) return { ok: false, msg: '상품 등록은 URL과 키워드를 둘 다 넣어야 합니다' };
  if (url) { const pm = parseMid(url); if (!pm.ok) return { ok: false, msg: pm.msg }; }
  const { data: bl } = await supabaseServer().from('app_settings').select('value').eq('key', 'ykreward_block_types').maybeSingle(); const block = parseBlock(bl?.value);
  if (isBlocked(rewardName, block)) return { ok: false, msg: `"${rewardName}" 는 워크허브에서 쓸 수 없는 이름입니다 (${block.join('·')} 는 ykreward 에서만)` };
  const typeToUse = rewardName;   // ykreward 유형 칸 = 리워드 이름
  const r = await issueSlots({ login, count, dailyGoal, start, days, slotType: typeToUse, rewardName, openedBy: me.name });
  if (!r.ok) return r;
  const { error } = await admin().from('reward_slot_opens').insert({ user_id: me.id, team_id: me.team_id, target_login: login, target_name: targetName, cnt: count, daily_goal: dailyGoal, start_date: start, days, slot_type: typeToUse || null, reward_name: rewardName, slot_codes: r.codes });
  if (error) return { ok: true, msg: `${r.msg} (이력 저장 실패: ${error.message})`, codes: r.codes };
  let regMsg = '';
  if (url && keyword && r.codes.length) { try { const g = await registerSlots({ codes: r.codes, url, keyword }); regMsg = g.ok ? ` · 상품 등록 ${g.n}개` : ` · 상품 등록 실패: ${g.msg} (아래 표에서 다시 등록)`; } catch (e: any) { regMsg = ` · 상품 등록 오류: ${e?.message ?? e}`; } }
  revalidatePath('/slots-open');
  return { ok: true, msg: `${rewardName} · ${login} 에 ${r.codes.length}개 발급 (#${r.codes[0]}~#${r.codes.at(-1)})${regMsg}`, codes: r.codes };
}

export async function newSeller(fd: FormData): Promise<R & { login?: string }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!ALLOWED.includes(me.role)) return { ok: false, msg: '권한 없음' };
  if (!ykrReady()) return { ok: false, msg: 'ykreward 연동 설정이 없습니다.' };
  const { data: st } = await supabaseServer().from('app_settings').select('value').eq('key', 'ykreward_parent_login').maybeSingle();
  const r = await createSeller({ login: String(fd.get('login') || ''), password: String(fd.get('password') || ''), name: String(fd.get('name') || ''), parentLogin: st?.value || 'lchkgy', manager: me.name });
  if (r.ok) revalidatePath('/slots-open');
  return { ...r, login: r.ok ? String(fd.get('login') || '').trim().toLowerCase() : undefined };
}

export async function checkSeller(login: string): Promise<{ ok: boolean; msg: string; seller?: Seller }> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!ykrReady()) return { ok: false, msg: 'ykreward 연동 설정이 없습니다.' };
  const s = await findSeller(login);
  if (!s) return { ok: false, msg: `ykreward 에 셀러 계정 "${login.trim()}" 이 없습니다. 아이디를 확인하거나 새 계정을 만드세요.` };
  if (!s.active) return { ok: false, msg: `"${s.login_id}" 는 중지된 계정입니다.` };
  return { ok: true, msg: '', seller: s };
}

/** 이미 발급된 슬롯(워크허브가 연 것)에 상품·키워드 등록 */
export async function registerOne(fd: FormData): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!ALLOWED.includes(me.role)) return { ok: false, msg: '권한 없음' };
  const code = Number(fd.get('code')); if (!code) return { ok: false, msg: '슬롯 번호 오류' };
  let g: { ok: boolean; msg: string; n: number };
  try { g = await registerSlots({ codes: [code], url: String(fd.get('url') || ''), keyword: String(fd.get('keyword') || '') }); }
  catch (e: any) { return { ok: false, msg: '등록 중 오류: ' + (e?.message ?? String(e)) }; }
  if (g.ok) revalidatePath('/slots-open');
  return { ok: g.ok, msg: g.ok ? `#${code} 등록 완료` : g.msg };
}
