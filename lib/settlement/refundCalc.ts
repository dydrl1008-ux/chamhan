// 순수 계산 (클라이언트·서버 공용) — 정산 사이트 refund.html 의 setRefundWorkDay / saleSum 과 동일
export type RefundCalcIn = { prodAmt: number; saleAmt: number; refundInflowCnt: number; dateWorkFrom: string; dateWorkTo: string; refundDate: string; workDay: number; incentiveRate: number; prodIncentiveInd: string; prodIncentive: number; gubun: string };
export function refundCalc(i: RefundCalcIn) {
  const d1 = new Date(i.dateWorkTo + 'T00:00:00Z').getTime(), d2 = new Date(i.refundDate + 'T00:00:00Z').getTime(), d3 = new Date(i.dateWorkFrom + 'T00:00:00Z').getTime();
  let err = '';
  if (!i.refundDate) err = '환불요청일을 입력하세요';
  else if (d1 < d2) err = '환불요청일은 정산요청의 작업종료일 이전이어야 합니다';
  else if (d2 < d3) err = '환불요청일은 작업시작일 이후여야 합니다';
  const refundWorkDay = err ? 0 : Math.abs((d1 - d2) / 864e5);
  if (!err && refundWorkDay > i.workDay) err = '환불요청 일 수는 정산요청 일 수보다 많을 수 없습니다';
  const byProd = Math.floor(i.prodAmt * i.refundInflowCnt * refundWorkDay);   // 상품가 × 유입수 × 환불일수
  const bySale = Math.floor(i.saleAmt * i.refundInflowCnt * refundWorkDay);   // 판매가 × 유입수 × 환불일수
  const costAmt = byProd - bySale;
  let refundExpectRateAmt = i.gubun === '07' ? -byProd : Math.round(costAmt * i.incentiveRate / 1.1);
  if (i.prodIncentiveInd === 'Y') refundExpectRateAmt = refundWorkDay * i.prodIncentive * i.refundInflowCnt;
  // 사이트 저장 필드명 그대로: refundSaleTotalAmt ← 상품가 기준값, refundProdTotalAmt ← 판매가 기준값 (승인 시 환불금액 = refundProdTotalAmt)
  return { err, refundWorkDay, refundSaleTotalAmt: byProd, refundProdTotalAmt: bySale, refundExpectRateAmt, costAmt };
}
