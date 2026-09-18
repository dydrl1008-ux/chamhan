// 순수 계산 (클라이언트·서버 공용) — 정산 사이트 applypayment.html 의 saleSum/setIncentiveRate 와 동일
export type ReqInput = { prodId: string; custId: string; prodAmt: number; prodIncentive: number; saleAmt: number; inflowCnt: number; dateWorkFrom: string; dateWorkTo: string; saleTotalAmt: number; gubun: string; mileageUseInd: boolean; useMileage: number; custRate: number; empRate: number; existMileage: number };
export function calc(i: ReqInput) {
  const workDay = Math.max(0, Math.round((new Date(i.dateWorkTo + 'T00:00:00Z').getTime() - new Date(i.dateWorkFrom + 'T00:00:00Z').getTime()) / 864e5) + 1);
  const prodIncentiveInd = i.prodIncentive > 0 ? 'Y' : 'N';
  const incentiveRate = prodIncentiveInd === 'Y' ? 0 : i.custRate > 0 ? i.custRate : i.empRate;
  const prodTotalAmt = Math.floor(i.prodAmt * i.inflowCnt * workDay);
  const useMileage = i.mileageUseInd ? i.useMileage : 0;
  const costAmt = i.saleTotalAmt - prodTotalAmt;
  let expectRateAmt: number, expectAmt: number;
  if (['05', '06'].includes(i.gubun)) { expectRateAmt = -Math.round(i.saleTotalAmt / 1.1); expectAmt = -(i.saleTotalAmt - useMileage); }
  else { expectRateAmt = Math.round(costAmt * incentiveRate / 1.1); expectAmt = i.saleTotalAmt - useMileage; }
  if (prodIncentiveInd === 'Y') expectRateAmt = workDay * i.prodIncentive * i.inflowCnt;
  return { workDay, prodIncentiveInd, incentiveRate, prodTotalAmt, costAmt, expectRateAmt, expectAmt, useMileage };
}
