// 워커 결과 수거 + 글 끝난 키워드·업체 렌더 큐 등록 (pv3_render.py 가 주기적으로 호출 · Authorization: Bearer CRON_SECRET)
import { NextResponse } from 'next/server';
import { ingestAi, queueMissingRenders } from '@/lib/pv3Tasks';
import { supabaseAdmin } from '@/lib/supabase/admin';

const KEEP_DAYS = 30;
/** 30일 지난 제안서 이미지 삭제 — 한 번에 최대 500개. 밀린 게 없으면 6시간에 한 번만 확인 (0080 SQL 필요, 없으면 아무것도 안 함) */
async function gcImages(): Promise<number> {
  const sb = supabaseAdmin();
  const { data: last } = await sb.from('ai_settings').select('value').eq('key', 'pv3_gc_next').maybeSingle();
  if (last?.value && new Date(last.value).getTime() > Date.now()) return 0;
  const { data, error } = await sb.rpc('pv3_old_objects', { p_days: KEEP_DAYS, p_limit: 500 }); if (error) return 0;
  const names = ((data ?? []) as { name: string }[]).map(x => x.name); let n = 0;
  for (let i = 0; i < names.length; i += 100) { const { data: del } = await sb.storage.from('pv3').remove(names.slice(i, i + 100)); n += del?.length ?? 0; }
  // 지워진 이미지를 가리키는 장 목록 비우기 — 다시 쓰이는 키워드·업체는 다음 확인 때 새로 렌더된다
  const cut = new Date(Date.now() - KEEP_DAYS * 86400e3).toISOString();
  await sb.from('pv3_stores').update({ images: [] }).lt('rendered_at', cut).neq('images', '[]');
  await sb.from('pv3_keywords').update({ images: [] }).lt('rendered_at', cut).neq('images', '[]');
  const next = names.length >= 500 ? Date.now() : Date.now() + 6 * 3600e3;   // 500개를 꽉 채웠으면 더 남은 것 — 다음 호출 때 이어서
  await sb.from('ai_settings').upsert({ key: 'pv3_gc_next', value: new Date(next).toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return n;
}
export const dynamic = 'force-dynamic'; export const maxDuration = 60;
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const r = await ingestAi(); const renders = await queueMissingRenders();
    let gc = 0; try { gc = await gcImages(); } catch { /* 정리 실패는 발송에 영향 없음 */ }
    return NextResponse.json({ ok: true, ...r, renders, gc });
  } catch (e: any) { return NextResponse.json({ ok: false, msg: e.message }, { status: 500 }); }
}
