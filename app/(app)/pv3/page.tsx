import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import Pv3Client from './Pv3Client';
import { listKw, getSettings, listKnowledge } from './actions';
export const dynamic = 'force-dynamic';

/** 제안서 v3 — 광고 설계 제안서 (키워드·업체 데이터 → 워커 글 → 워커 PC 렌더 → 이미지 8장). 총괄·대표 */
export default async function Pv3Page() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  if (!(me.role === 'admin' || me.role === 'head')) redirect('/');
  const [kw, st, kn] = await Promise.all([listKw(), getSettings(), listKnowledge()]);
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title="제안서 v3 · 광고 설계" desc="키워드별 시장·업체 데이터는 코드가 계산 → AI팀(워커)이 글 → 워커 PC가 이미지 8장 렌더 → 메일·카톡 발송에 사용"
      help={<>흐름: ① 키워드 만들기 (지수·검색량 계산 + 보낼 수 있는 업체 n곳 + 워커 요청) → ② 워커가 글 쓰면 「수거」 (렌더 큐 자동 등록) → ③ 워커 PC <code>pv3_render.py</code> 가 이미지 만들어 올림 → ④ 메일 발송에서 「제안서 v3 이미지」 선택. 업체마다 퍼널 판정(노출·신뢰·인지·방어·전환)이 달라 리딩 무기·3단계가 다르게 나갑니다.</>} />
    <Pv3Client rows={kw.rows ?? []} kakao={st.kakao ?? ''} style={st.style ?? ''} knowledge={kn.rows ?? []} principles={kn.principles ?? []} />
  </div>;
}
