// 네이버 검색광고 API — 키워드도구(연관 키워드 + 월 검색수). 환경변수: NAVER_AD_CUSTOMER_ID, NAVER_AD_API_KEY(액세스라이선스), NAVER_AD_SECRET
import { createHmac } from 'crypto';

export type KwVol = { keyword: string; pc: number; mobile: number; total: number; comp: string };

const num = (v: unknown) => { if (typeof v === 'number') return v; const s = String(v ?? '').trim(); if (s.startsWith('<')) return 5; return Number(s.replace(/,/g, '')) || 0; };   // "< 10" → 5

export function adConfigured() { return !!(process.env.NAVER_AD_CUSTOMER_ID && process.env.NAVER_AD_API_KEY && process.env.NAVER_AD_SECRET); }

/** 힌트 키워드(최대 5개)로 연관 키워드·월 검색수. 결과 total 내림차순 */
export async function keywordVolumes(hints: string[]): Promise<KwVol[]> {
  if (!adConfigured()) throw new Error('검색광고 API 환경변수 없음 (NAVER_AD_CUSTOMER_ID / NAVER_AD_API_KEY / NAVER_AD_SECRET)');
  const hint = hints.map(h => h.replace(/\s+/g, '')).filter(Boolean).slice(0, 5).join(',');
  const path = '/keywordstool'; const ts = String(Date.now());
  const sig = createHmac('sha256', process.env.NAVER_AD_SECRET!).update(`${ts}.GET.${path}`).digest('base64');
  const res = await fetch(`https://api.naver.com${path}?hintKeywords=${encodeURIComponent(hint)}&showDetail=1`, {
    headers: { 'X-Timestamp': ts, 'X-API-KEY': process.env.NAVER_AD_API_KEY!, 'X-Customer': process.env.NAVER_AD_CUSTOMER_ID!, 'X-Signature': sig },
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`검색광고 API ${res.status}: ${text.slice(0, 120)}`);
  const j = JSON.parse(text);
  const list: KwVol[] = (j.keywordList ?? []).map((k: any) => { const pc = num(k.monthlyPcQcCnt), mobile = num(k.monthlyMobileQcCnt); return { keyword: String(k.relKeyword ?? ''), pc, mobile, total: pc + mobile, comp: String(k.compIdx ?? '') }; });
  return list.sort((a, b) => b.total - a.total);
}
