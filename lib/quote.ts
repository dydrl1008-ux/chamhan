// 견적서 — 타입·기본값·계산 (서버·클라이언트 공용)
export type QItem = { name: string; period: string; scope: string; price: number; qty: number; note: string };
export type QData = { no: string; date: string; client: string; items: QItem[]; vat: 'excl' | 'incl' | 'none'; delivery: string; memo: string };
export type Supplier = { regNo: string; name: string; ceo: string; addr: string; biz: string; type: string; tel: string; email: string; account: string };
export type Suppliers = { main: Supplier; novat: Supplier };   // main = 세금계산서 발행(참한기획) · novat = 부가세 없는 견적(리코프리)
export type QRow = { id: number; title: string; total: number; updated_at: string; owner: string; data: QData };
export const DEFAULT_SUPPLIERS: Suppliers = {
  main: { regNo: '148-87-03877', name: '㈜ 참한기획', ceo: '곽봉우', addr: '서울특별시 강남구 압구정로2길 46, 214 제이 56호(신사동)', biz: '서비스업', type: '광고대행업', tel: '', email: 'chamchamcorp@naver.com', account: '신한은행 140-016-484360 (주)참한기획' },
  novat: { regNo: '668-29-01636', name: '리코프리', ceo: '최승현', addr: '경기도 남양주시 별내중앙로 26, 1006-33호(별내동)', biz: '서비스업', type: '광고대행업', tel: '', email: '', account: '신한은행 110-560-534499 리코프리' },
};
/** 품목별 공급가액·세액과 합계 — excl: 단가에 10% 추가 · incl: 단가에 10% 포함 · none: 세액 없음 */
export function calc(d: QData) {
  const rows = d.items.map(it => { const amt = (Number(it.price) || 0) * (Number(it.qty) || 0); const supply = d.vat === 'incl' ? Math.round(amt / 1.1) : amt; const tax = d.vat === 'excl' ? Math.round(amt * 0.1) : d.vat === 'incl' ? amt - supply : 0; return { supply, tax }; });
  const supply = rows.reduce((a, r) => a + r.supply, 0), tax = rows.reduce((a, r) => a + r.tax, 0);
  return { rows, supply, tax, total: supply + tax };
}
/** 금액 한글 표기 — 1155000 → 일백일십오만오천 */
export function hangul(n: number): string {
  n = Math.round(Math.abs(n)); if (!n) return '영';
  const d = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'], u = ['', '십', '백', '천'], big = ['', '만', '억', '조']; let out = '';
  for (let g = 0; n > 0; g++, n = Math.floor(n / 10000)) { const part = n % 10000; if (!part) continue; let s = ''; String(part).padStart(4, '0').split('').forEach((c, i) => { if (c !== '0') s += d[Number(c)] + u[3 - i]; }); out = s + big[g] + out; }
  return out;
}
