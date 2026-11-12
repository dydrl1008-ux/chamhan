// 메일 영업 공용: 스토어 키 추출, 기본 템플릿, 변수 치환
export const MAIL_VARS = ['{업체명}', '{키워드}', '{순위}', '{담당자}', '{연락처}', '{제안서링크}', '{수신거부링크}'] as const;

export const DEFAULT_SUBJECT = "'{키워드}' 검색 결과 확인 후 연락드립니다 — {업체명}";
export const DEFAULT_BODY = `안녕하세요, {업체명} 담당자님.
참한기획 {담당자}입니다.

'{키워드}' 검색 결과를 확인하던 중 {업체명} 상품을 보고 연락드립니다.
현재 위치와 유입 반영 상태를 정리한 자료를 아래 링크로 보내드립니다.
{제안서링크}

진행 시 순위는 매일 확인하고, 주간 리포트로 변동을 공유하며, 요청 사항은 당일 반영합니다.

검토 후 회신 주시면 자세히 안내드리겠습니다.

{담당자} · {연락처}
참한기획

수신을 원치 않으시면 아래 링크를 눌러주세요.
{수신거부링크}`;

export function fillVars(t: string, v: Record<string, string>) {
  // 비어 있는 변수 앞뒤의 구분자(·, -, |)는 같이 지움 — 연락처 비우면 "이름 · " 처럼 남지 않게
  return t.replace(/\{(업체명|키워드|순위|담당자|연락처|제안서링크|수신거부링크|오픈채팅)\}/g, (_, k) => v[k] ?? '')
    .replace(/[ \t]*[·\-|][ \t]*$/gm, '').replace(/^[ \t]*[·\-|][ \t]*/gm, '').replace(/[ \t]+[·|]\s+[·|][ \t]+/g, ' · ');
}

/** 스토어 URL → 식별 키. smartstore/brand 는 ID, 그 외는 호스트(+첫 경로). 상품 URL 도 스토어로 정규화 */
export function storeKey(url: string): { key: string; storeUrl: string } | null {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    const seg = u.pathname.split('/').filter(Boolean);
    if (/^(smartstore|brand)\.naver\.com$/.test(host)) {
      const id = seg[0]; if (!id || /^(products|main|category|inflow|i)$/.test(id)) return null;
      return { key: `${host.split('.')[0]}:${id.toLowerCase()}`, storeUrl: `https://${host}/${id}` };
    }
    if (/naver\.com$/.test(host)) return null;           // 네이버 쇼핑 카탈로그 등 — 스토어 아님
    return { key: `host:${host.toLowerCase()}`, storeUrl: `https://${host}` };
  } catch { return null; }
}
