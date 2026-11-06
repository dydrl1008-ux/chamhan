import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/ui';
import { adConfigured } from '@/lib/naverAd';
import ProductNameClient, { type NameTask } from './Client';
import { TITLE_PREFIX } from './shared';
export const dynamic = 'force-dynamic';

/** 도구 › 상품명 만들기 — 검색광고 월 검색수 + 시크릿 지수 상위 100 을 모아 AI팀에 지시, 결과를 여기서 봄. 직원은 내 요청만, 총괄·대표는 전체 */
export default async function ProductNamePage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const lead = me.role === 'admin' || me.role === 'head';
  const q = supabaseAdmin().from('ai_tasks').select('id,title,status,result,created_at,requested_by,instruction').like('title', `${TITLE_PREFIX}%`).order('id', { ascending: false }).limit(60);
  const { data } = lead ? await q : await q.eq('requested_by_id', me.id);
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="상품명 만들기" desc="브랜드 + 메인 키워드를 넣으면 검색량·상위 100 상품명 데이터를 붙여 AI팀이 50자 안 상품명 3안을 만들어 줍니다"
        help={<>글자수는 AI가 코드로 세서 표기합니다. 효능·부위 단어는 넣더라도 심의 위험이 같이 표시되니 고객에게 전달할 때 참고하세요. 결과가 마음에 안 들면 「고쳐줘」로 다시 요청.</>} />
      <ProductNameClient tasks={(data ?? []) as NameTask[]} adReady={adConfigured()} />
    </div>
  );
}
