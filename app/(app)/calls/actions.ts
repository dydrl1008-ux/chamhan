'use server';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { addWatch, ykrReady } from '@/lib/ykreward';

type R = { ok: boolean; msg: string; code?: string };
const RESULTS = ['called', 'interested', 'rejected', 'won', 'excluded'];

export async function setResult(id: number, status: string, note: string, next?: string | null): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!RESULTS.includes(status)) return { ok: false, msg: '잘못된 결과' };
  const nx = status === 'interested' && next && /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null;
  const { error } = await supabaseServer().rpc('lead_set_result', { p_id: id, p_status: status, p_note: note.slice(0, 1000), p_next: nx });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/calls');
  return { ok: true, msg: nx ? `기록됨 · ${nx.slice(5).replace('-', '/')} 아침 리스트 맨 위에 다시 뜸` : '기록됨' };
}
/** 관심 업체 다음 연락일 변경 */
export async function setNext(id: number, next: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return { ok: false, msg: '날짜 확인' };
  const { error } = await supabaseServer().rpc('lead_set_next', { p_id: id, p_next: next });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/calls'); return { ok: true, msg: `다음 연락일 ${next.slice(5).replace('-', '/')}` };
}

/** 제안서 주소를 추적 링크로 감싸기 — 고객이 열면 담당자에게 알림 */
export async function makeTrackLink(leadId: number | null, title: string, url: string): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const u = url.trim();
  if (!/^https:\/\/[^\s]+$/.test(u)) return { ok: false, msg: 'https:// 로 시작하는 제안서 주소를 넣어 주세요' };
  const code = randomBytes(6).toString('base64url').slice(0, 8);
  const { error } = await supabaseServer().from('proposals').insert({ code, lead_id: leadId, title: title.slice(0, 120), target_url: u.slice(0, 2000), owner_id: me.id });
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/calls');
  return { ok: true, msg: '추적 링크 생성', code };
}

/** 되돌리기 — 오늘 내가 남긴 마지막 결과 삭제 (차수 -1, 다시 오늘 리스트로) */
export async function undoResult(id: number): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const { error } = await supabaseServer().rpc('lead_undo_result', { p_id: id });
  if (error) return { ok: false, msg: error.message.replace(/^.*?: /, '') };
  revalidatePath('/calls'); revalidatePath('/leads');
  return { ok: true, msg: '되돌림 — 다시 오늘 리스트에 있음' };
}

/** 계약 후 확인 폼에서 → 순위 체크 업체(그룹) + 상품·키워드 + 계약 기간 등록. 상품 URL 비우면 업체·기간만 */
export async function registerWatchFromLead(p: { leadId: number; group: string; url: string; keywords: string; start: string; end: string }): Promise<R> {
  const me = await getProfile(); if (!me) return { ok: false, msg: '로그인 필요' };
  const sb = supabaseServer();
  const group = p.group.trim(); if (!group) return { ok: false, msg: '업체명을 입력하세요' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end) || p.start > p.end) return { ok: false, msg: '계약 기간을 확인하세요' };
  const { data: link } = await sb.from('reward_watch_links').select('login_id').eq('user_id', me.id).maybeSingle();
  if (!link?.login_id) return { ok: false, msg: '순위 체크 메뉴에서 내 ykreward 계정을 먼저 연결하세요' };
  const kws = p.keywords.split(/[\n,，]/).map(k => k.trim()).filter(Boolean);
  let msg = '';
  if (p.url.trim()) {
    if (!ykrReady()) return { ok: false, msg: 'ykreward 연동 설정이 없습니다' };
    if (!kws.length) return { ok: false, msg: '키워드를 입력하세요' };
    const r = await addWatch({ ownerLogin: link.login_id, url: p.url.trim(), keywords: kws, group, memo: '콜 리스트 계약' });
    if (!r.ok) return { ok: false, msg: r.msg };
    msg = r.msg;
  }
  await sb.from('reward_watch_groups').upsert({ user_id: me.id, name: group, memo: '' }, { onConflict: 'user_id,name' });
  const { error } = await sb.from('reward_watch_reports').upsert({ user_id: me.id, group_key: group, start_on: p.start, end_on: p.end, note: '', updated_at: new Date().toISOString() }, { onConflict: 'user_id,group_key' });
  if (error) return { ok: false, msg: '계약 기간 저장 실패: ' + error.message };
  revalidatePath('/rank-watch'); revalidatePath('/calls');
  return { ok: true, msg: `순위 체크에 「${group}」 등록 · 계약 ${p.start.slice(5).replace('-', '/')}~${p.end.slice(5).replace('-', '/')}${msg ? ' · ' + msg : ''}` };
}
