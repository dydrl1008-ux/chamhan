// 메타 인바운드 자동 접수 — 접수 시트의 스크립트가 5분마다 새 줄을 보낸다. Authorization: Bearer META_INTAKE_SECRET
//   body: { rows: [{ tab: '유노애드 상담신청' | '유노애드 바이럴 접수', cells: [...] }] }  ← 칸은 시트 그대로. 뜻풀이는 lib/metaIntake.ts
//   같은 접수 ID 는 한 번만 들어가고, 이미 있는 전화번호는 「중복」. 새로 들어온 건은 미배정 — 메타팀 팀장에게 알림
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { metaTeamId, metaIntakeOpen } from '@/lib/meta';
import { mapIntake, type IntakeRow } from '@/lib/metaIntake';
export const dynamic = 'force-dynamic'; export const maxDuration = 30;
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export async function POST(req: Request) {
  const secret = process.env.META_INTAKE_SECRET ?? ''; const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (secret.length < 16 || !same(got, secret)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!metaIntakeOpen()) return NextResponse.json({ ok: true, held: true, msg: '평일은 09:00~17:30 에만 받습니다(주말은 제한 없음) — 시간이 되면 들어갑니다' });   // 시간 밖: 넣지 않는다. 시트가 5분마다 다시 보내므로 9시에 한꺼번에 들어온다
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, msg: 'bad json' }, { status: 400 }); }
  const list: IntakeRow[] = []; const seenId = new Set<string>(); for (const r of (Array.isArray(body?.rows) ? body.rows : []).slice(0, 500)) { const m = mapIntake(String(r?.tab ?? ''), Array.isArray(r?.cells) ? r.cells : []); if (m && !seenId.has(m.ext_id)) { seenId.add(m.ext_id); list.push(m); } }
  if (!list.length) return NextResponse.json({ ok: true, added: 0, dup: 0, skipped: 0 });
  const sb = supabaseAdmin(); const { data: have, error } = await sb.from('meta_leads').select('ext_id').in('ext_id', list.map(r => r.ext_id)); if (error) return NextResponse.json({ ok: false, msg: /ext_id/.test(error.message) ? '0103 SQL 을 먼저 실행해 주세요' : error.message }, { status: 500 });
  const old = new Set((have ?? []).map(r => r.ext_id)); const fresh = list.filter(r => !old.has(r.ext_id)).sort((a, b) => String(a.received_at ?? a.received_on).localeCompare(String(b.received_at ?? b.received_on)));
  if (!fresh.length) return NextResponse.json({ ok: true, added: 0, dup: 0, skipped: list.length });
  const keys = [...new Set(fresh.map(r => r.phone_key).filter(k => k.length >= 8))]; const { data: ph } = keys.length ? await sb.from('meta_leads').select('phone_key').in('phone_key', keys) : { data: [] as any[] }; const seen = new Set((ph ?? []).map((r: any) => r.phone_key)); let dup = 0;
  const ins = fresh.map(r => { const k = r.phone_key.length >= 8 ? r.phone_key : ''; const isDup = !!k && seen.has(k); if (k) seen.add(k); if (isDup) dup++; return { ...r, status: isDup ? '중복' : '미연락', owner_id: null }; });
  const { error: e2 } = await sb.from('meta_leads').upsert(ins, { onConflict: 'ext_id', ignoreDuplicates: true }); if (e2) return NextResponse.json({ ok: false, msg: e2.message }, { status: 500 });
  const added = ins.length - dup;
  if (added > 0) { const tid = await metaTeamId(); const { data: ls } = tid == null ? { data: [] as any[] } : await sb.from('profiles').select('id').eq('team_id', tid).eq('role', 'manager').eq('is_active', true);
    if (ls?.length) await sb.from('notifications').insert(ls.map((l: any) => ({ user_id: l.id, kind: 'info', title: `새 인바운드 DB ${added}건 — 배분해 주세요`, body: ins.filter(r => r.status !== '중복').slice(0, 10).map(r => `${r.source} · ${r.product || '-'} · ${r.name}`).join('\n'), link: '/meta-db?u=none' }))); }
  return NextResponse.json({ ok: true, added, dup, skipped: list.length - fresh.length });
}
