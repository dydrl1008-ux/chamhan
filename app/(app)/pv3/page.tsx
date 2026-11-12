import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import Pv3Client from './Pv3Client';
import { listKw, getSettings, listKnowledge } from './actions';
export const dynamic = 'force-dynamic'; export const maxDuration = 60;

/** 제안서 v3 — 광고 설계 제안서 (키워드·업체 데이터 → 워커 글 → 워커 PC 렌더 → 이미지 8장). 총괄·대표 */
export default async function Pv3Page() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  if (!(me.role === 'admin' || me.role === 'head')) redirect('/');
  const [kw, st, kn] = await Promise.all([listKw(), getSettings(), listKnowledge()]);
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title="맞춤 제안서 · 광고 설계" desc="업체마다 막힌 구간을 판정해 광고 순서를 설계한 제안서 (이미지 10장) — 메일 본문에 넣어 발송"
      help={<>흐름: 키워드·업체 데이터를 코드가 계산(순위·지수·검색량·판정) → AI팀 워커가 업체별 글 작성 → 워커 PC의 <code>pv3_render.py</code> 가 이미지로 만들어 올림 → 메일 발송에서 「맞춤 제안서 이미지로」 체크. 10장 = 표지·진단·시장·사는 사람·광고 설계·1단계 상세·2·3단계·일정과 역할·예상 매출·콘텐츠/FAQ/문의. 표지·진단·설계·상세·일정·매출 7장은 업체마다 다르고, 시장·사는 사람·FAQ 3장은 키워드 공통입니다.</>} />
    <Pv3Client rows={kw.rows ?? []} kakao={st.kakao ?? ''} style={st.style ?? ''} knowledge={kn.rows ?? []} principles={kn.principles ?? []} />
  </div>;
}
