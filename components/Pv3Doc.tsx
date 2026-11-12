// 제안서 v3 (디자인 4) — 10장 · 가로 720 · 세로 가변. 워커 PC가 장별로 캡처해 메일 본문에 이어 붙임. 서버·클라이언트 공용, 외부 의존 없음 (폰트는 view 페이지 <link>)
// 메일은 폰에서 절반 크기로 보이므로 글씨를 크게 잡는다 (본문 19px · 가장 작은 글씨 13px).
// 문체: 제목·한 줄 = 명사 맺음 / 설명·안내 = 존댓말. 매체명·작업 수량·방식 세부 없음.
import { FUNNEL, LEAK_LABEL, AXIS_LABEL, AXIS_DESC, PV3_PAGES, PV3_TITLES, TOP10_SHARE, PAGE1_SHARE, ctr, man, eok, fallbackStages, nowLine, type KwData, type StoreData, type KwAi, type StoreAi, type Axes, type Leak } from '@/lib/proposalV3';
import { weaponInfo, TRACK_LABEL, TIMELINE, type MockKind, type Track } from '@/lib/pv3Weapons';
export { PV3_PAGES, PV3_STORE_PAGES, PV3_COMMON_PAGES } from '@/lib/proposalV3';

const C = {
  ink: '#0A1024', text: '#1C2540', sub: '#55607A', mute: '#8A93A8', line: '#E3E7F0', bg: '#F4F6FB',
  blue: '#2B5BFF', blueSoft: '#EAF0FF', blueLine: '#C5D3FF', violet: '#7A5CFF', violetSoft: '#F1EDFF', violetLine: '#D9CFFF',
  green: '#0B9E63', greenSoft: '#E6F7EF', greenLine: '#B9E8D2', red: '#EF4136', redSoft: '#FEEFED', redLine: '#F9C9C4', amber: '#D97E00', amberSoft: '#FFF4E0', amberLine: '#F6D9A6',
};
const TC: Record<Track, [string, string, string]> = { pf: [C.blue, C.blueSoft, C.blueLine], br: [C.violet, C.violetSoft, C.violetLine], ct: [C.amber, C.amberSoft, C.amberLine] };
const svgBg = (path: string, stroke: string) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='${path}' fill='none' stroke='%23${stroke}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
export const PV3_FONT = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css';
export const PV3_CSS = `
.pv3{font-family:Pretendard,'Noto Sans KR','Malgun Gothic',sans-serif;color:${C.text};-webkit-font-smoothing:antialiased;word-break:keep-all;overflow-wrap:anywhere;width:720px;background:#fff;box-sizing:border-box;position:relative;font-size:19px;line-height:1.68;letter-spacing:-.014em}
.pv3 *{box-sizing:border-box}
.pv3 .bar{display:flex;justify-content:space-between;align-items:center;height:58px;padding:0 44px;background:${C.ink};color:#9AA6C4;font-size:14.5px;font-weight:600}
.pv3 .brand{color:#fff;font-size:17.5px;font-weight:800;display:flex;align-items:center;gap:9px;letter-spacing:-.02em}
.pv3 .brand:before{content:'';width:11px;height:11px;border-radius:3.5px;background:linear-gradient(135deg,#6C95FF,#A88BFF);display:block}
.pv3 .bar .no{display:flex;align-items:center;gap:8px}.pv3 .bar .no b{color:#fff;font-weight:800}
.pv3 .body{padding:40px 44px 30px}
.pv3 .hero{padding:24px 44px 40px;color:#fff;background:radial-gradient(760px 420px at 105% -10%,rgba(168,139,255,.78),rgba(168,139,255,0) 62%),radial-gradient(620px 380px at -12% 112%,rgba(43,91,255,.8),rgba(43,91,255,0) 60%),linear-gradient(155deg,#0A1233 0%,#14277E 58%,#3A2AAE 100%)}
.pv3 .hero .hb{display:flex;justify-content:space-between;align-items:center;font-size:14.5px;color:rgba(255,255,255,.72);font-weight:600;margin-bottom:40px}
.pv3 .pill{display:inline-block;font-size:15px;font-weight:800;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.32);color:#fff;line-height:1.3}
.pv3 h1{font-weight:800;line-height:1.27;letter-spacing:-.04em;margin:18px 0 16px;color:#fff}
.pv3 .hlead{font-size:19.5px;line-height:1.7;color:rgba(255,255,255,.84);margin:0}.pv3 .hlead b{color:#fff}
.pv3 .pcard{margin-top:26px;background:#fff;border-radius:18px;padding:16px;display:flex;gap:16px;align-items:center;color:${C.text};box-shadow:0 14px 34px rgba(5,10,40,.28)}
.pv3 .eyebrow{font-size:14px;font-weight:800;letter-spacing:.09em;color:${C.blue}}
.pv3 h2{font-size:36px;font-weight:800;line-height:1.3;letter-spacing:-.035em;margin:10px 0 14px;color:${C.ink}}
.pv3 h3{font-size:23px;font-weight:800;letter-spacing:-.025em;margin:0;color:${C.ink};line-height:1.38}
.pv3 p{margin:0}.pv3 .lead{font-size:20px;color:${C.sub};line-height:1.72}.pv3 .lead b{color:${C.ink}}
.pv3 em{font-style:normal;color:${C.blue}}.pv3 .red{color:${C.red}}.pv3 .green{color:${C.green}}
.pv3 .card{background:#fff;border:1.5px solid ${C.line};border-radius:18px;padding:22px 24px}
.pv3 .soft{background:${C.bg};border-radius:18px;padding:22px 24px}
.pv3 .dark{background:${C.ink};color:#fff;border-radius:20px;padding:26px 28px}
.pv3 .g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pv3 .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pv3 .stat{background:#fff;border:1.5px solid ${C.line};border-radius:16px;padding:18px 10px 16px;text-align:center}
.pv3 .stat b{display:block;font-size:30px;font-weight:800;letter-spacing:-.035em;color:${C.ink};line-height:1.2}
.pv3 .stat span{display:block;font-size:14.5px;color:${C.mute};margin-top:6px;line-height:1.45;font-weight:500}
.pv3 .tag{display:inline-block;font-size:13.5px;font-weight:800;padding:5px 11px;border-radius:999px;line-height:1.4}
.pv3 .chip{display:inline-block;border:1.5px solid ${C.line};border-radius:999px;padding:6px 14px;font-size:16px;font-weight:700;margin:4px 6px 4px 0;line-height:1.35;background:#fff;color:${C.text}}
.pv3 .spec{background:${C.bg};border-radius:13px;padding:12px 14px}.pv3 .spec i{display:block;font-style:normal;font-size:13.5px;color:${C.mute};font-weight:700}.pv3 .spec b{display:block;font-size:16.5px;font-weight:800;color:${C.ink};margin-top:2px;line-height:1.4}
.pv3 .ic{border-radius:14px;display:flex;align-items:center;justify-content:center;flex:none}
.pv3 .li{display:flex;gap:10px;align-items:flex-start;font-size:17.5px;line-height:1.55;padding:6px 0}
.pv3 .li:before{content:'';flex:none;width:22px;height:22px;border-radius:50%;margin-top:3px;background:${C.greenSoft} ${svgBg('M5.5 10.3l3 3 6-6.3', '0B9E63')} center/20px no-repeat}
.pv3 .li.x:before{background:${C.redSoft} ${svgBg('M6.5 6.5l7 7M13.5 6.5l-7 7', 'EF4136')} center/20px no-repeat}
.pv3 .li.w:before{background:#fff ${svgBg('M5.5 10.3l3 3 6-6.3', '0B9E63')} center/20px no-repeat}.pv3 .li.xw:before{background:#fff ${svgBg('M6.5 6.5l7 7M13.5 6.5l-7 7', 'EF4136')} center/20px no-repeat}
.pv3 table{width:100%;border-collapse:collapse}.pv3 th{font-size:14px;color:${C.mute};font-weight:700;padding:9px 6px;border-bottom:2px solid ${C.ink};text-align:center}
.pv3 td{font-size:16px;padding:11px 6px;border-bottom:1px solid ${C.line};text-align:center;font-variant-numeric:tabular-nums}.pv3 td.l{text-align:left;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv3 .sec{margin-top:30px}.pv3 .cap{font-size:14.5px;color:${C.mute};line-height:1.6;margin-top:10px}
.pv3 .lbl{font-size:15.5px;font-weight:800;color:${C.sub};margin-bottom:10px}
.pv3 .foot{margin-top:34px;padding-top:16px;border-top:1.5px solid ${C.line};display:flex;justify-content:space-between;font-size:13px;color:${C.mute}}
.pv3 .mock{border:1.5px solid ${C.line};border-radius:16px;background:#fff;padding:16px 18px;font-size:16px}
.pv3 .row{display:grid;gap:14px;border-radius:16px;padding:16px 18px;align-items:start}
.pv3 .num{width:44px;height:44px;border-radius:14px;font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center;flex:none}
`;

export type Pv3Props = { k: KwData; ka: KwAi; s: StoreData; sa: StoreAi; brand: { name: string; email: string; kakao: string; owner?: string; phone?: string }; page: number };   // 담당자 이름·연락처는 메일 본문 서명에 (공통 장은 키워드당 1번만 렌더되므로 이미지엔 회사 정보만)
const won = (n: number) => Math.round(n).toLocaleString('ko-KR');
const ICON: Record<string, string> = {
  trend: 'M4 16l5-5 3 3 7-8M14 6h5v5', search: 'M10.5 17a6.5 6.5 0 110-13 6.5 6.5 0 010 13zM20 20l-4.6-4.6', ad: 'M4 9v6h3l6 4V5L7 9H4zM17 9a4 4 0 010 6', cart: 'M4 5h2l2.2 10h9.3L20 8H7.5M9.5 19.5a1 1 0 100-2 1 1 0 000 2zM17 19.5a1 1 0 100-2 1 1 0 000 2z',
  pen: 'M5 19l1-4L16.5 4.5a1.8 1.8 0 012.6 0l.4.4a1.8 1.8 0 010 2.6L9 18l-4 1z', chat: 'M5 6h14v10H10l-4 3v-3H5V6z', heart: 'M12 19s-7-4.4-7-9.4A3.6 3.6 0 0112 7.5a3.6 3.6 0 017 2.1c0 5-7 9.4-7 9.4z', pin: 'M12 21s-6-5.6-6-10.3a6 6 0 0112 0C18 15.4 12 21 12 21zM12 12.5a2 2 0 100-4 2 2 0 000 4z',
  video: 'M4 7h11v10H4V7zM15 10.5l5-3v9l-5-3', mega: 'M4 10v4h3l7 4V6L7 10H4zM18 8v8',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20.5a7.5 7.5 0 0115 0', bulb: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 00-3.7 10.7c.7.6 1.2 1.4 1.2 2.3h5c0-.9.5-1.7 1.2-2.3A6 6 0 0012 3z', check: 'M5 12.5l4.5 4.5L19 7.5',
  tap: 'M9 12V5.6a1.6 1.6 0 013.2 0V11l4.6.9a2 2 0 011.6 2.3l-.6 3.6A3.8 3.8 0 0114 21h-2.200a3.800 3.800 0 01-3-1.500L5.600 15.400a1.500 1.500 0 012.300-1.900L9 14.600', doc: 'M7 3h7l4 4v14H7V3zM14 3v4h4M9.500 12h6M9.500 16h6',
  cal: 'M5 6h14v14H5V6zM5 10.5h14M9 3.5v4M15 3.5v4', arrow: 'M5 12h14M13 6l6 6-6 6',
};
const Svg = ({ n, c, s = 24, w = 1.9 }: { n: string; c: string; s?: number; w?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d={ICON[n] ?? ICON.trend} /></svg>;
const Ico = ({ n, c, bg, size = 48 }: { n: string; c: string; bg: string; size?: number }) => <div className="ic" style={{ background: bg, width: size, height: size }}><Svg n={n} c={c} s={Math.round(size * .54)} /></div>;
const Bar = ({ n, brand }: { n: number; brand: string }) => <div className="bar"><span className="brand">{brand}</span><span className="no"><b>{String(n).padStart(2, '0')}</b>{PV3_TITLES[n - 1]}</span></div>;
const Foot = ({ k, n }: { k: KwData; n: number }) => <div className="foot"><span>「{k.keyword}」 광고 설계 제안 · {k.date} 데이터 기준 · 금액은 추정치</span><span>{n} / {PV3_PAGES}</span></div>;
const Tag = ({ t }: { t: Track }) => <span className="tag" style={{ color: TC[t][0], background: TC[t][1] }}>{TRACK_LABEL[t]}</span>;
const SHOW_AXES: (keyof Axes)[] = ['hit', 'sale', 'quality', 'review'];
const STAGE_DESC = ['처음 알게 됨', '검색해서 찾음', '후기·가격 비교', '상세 보고 결제', '다시 찾고 다시 삼'];

/** 상위 10 상품명에서 2번 이상 나온 단어 (키워드 자체·숫자·단위 제외) */
function topWords(k: KwData): [string, number][] {
  const kw = k.keyword.replace(/\s+/g, '').toLowerCase(); const cnt = new Map<string, number>();
  k.top10.forEach(t => { const seen = new Set<string>(); t.title.replace(/[\[\]()\/,+·]/g, ' ').split(/\s+/).map(w => w.trim()).filter(w => w.length >= 2 && w.length <= 8 && !/^\d|^[a-z0-9]+$/i.test(w) && !kw.includes(w.toLowerCase()) && !w.toLowerCase().includes(kw)).forEach(w => { if (seen.has(w)) return; seen.add(w); cnt.set(w, (cnt.get(w) ?? 0) + 1); }); });
  return [...cnt.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12);
}
const rankText = (k: KwData, s: StoreData) => s.rank ? `${s.rank}위` : `${k.n}위 밖`;

// ── 화면 예시(목업) — "이렇게 보입니다" ──
const Line = ({ w = '100%' }: { w?: string }) => <div style={{ height: 10, borderRadius: 5, background: '#E7EBF3', width: w, flex: w === '100%' ? 1 : undefined }} />;
function Mock({ kind, k, s }: { kind: MockKind; k: KwData; s: StoreData }) {
  const kw = k.keyword;
  const q = <div style={{ display: 'flex', gap: 10, alignItems: 'center', border: `2px solid ${C.blue}`, borderRadius: 999, padding: '10px 18px', fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 10 }}><Svg n="search" c={C.blue} s={20} w={2.3} />{kw}</div>;
  const cap = (t: string) => <div className="cap" style={{ marginTop: 12 }}>화면 예시 · {t}</div>;
  const hi = { display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', background: C.blueSoft, borderRadius: 10, color: C.blue, fontWeight: 800 } as const;
  const lo = { display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', color: C.mute, fontWeight: 700 } as const;
  switch (kind) {
    case 'flow': return <div className="mock" style={{ background: C.bg, border: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 22px 1fr 22px 1fr', gap: 4, alignItems: 'stretch' }}>
        {([['search', `「${kw}」 검색`, '실제 사용자가 검색'], ['tap', '상품 클릭', `${s.store} 상품을 찾아 들어옴`], ['trend', '순위 반영', '찾는 사람이 많은 상품으로']] as [string, string, string][]).flatMap(([ic, t, d], i) => [
          <div key={t} style={{ background: '#fff', borderRadius: 14, padding: '14px 8px 12px', textAlign: 'center', border: `1.5px solid ${C.line}` }}><div style={{ display: 'flex', justifyContent: 'center' }}><Ico n={ic} c={C.blue} bg={C.blueSoft} size={42} /></div><div style={{ fontSize: 16.5, fontWeight: 800, color: C.ink, marginTop: 8, lineHeight: 1.35 }}>{t}</div><div style={{ fontSize: 13.5, color: C.mute, marginTop: 3, lineHeight: 1.4 }}>{d}</div></div>,
          ...(i < 2 ? [<div key={t + '>'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Svg n="arrow" c={C.blue} s={18} w={2.4} /></div>] : [])])}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 14, padding: '12px 16px' }}><span style={{ color: s.leak === 'defend' ? C.blue : C.red, fontWeight: 800, fontSize: 16.5, whiteSpace: 'nowrap' }}>지금 {rankText(k, s)}</span><div style={{ flex: 1, height: 7, borderRadius: 4, background: `linear-gradient(90deg,${s.leak === 'defend' ? C.blueLine : C.redLine},${C.green})` }} /><span style={{ color: C.green, fontWeight: 800, fontSize: 16.5, whiteSpace: 'nowrap' }}>목표 {s.target}위권</span></div>
      {cap('매일 일정하게 쌓이는 유입이 순위에 반영되는 흐름')}</div>;
    case 'rank': return <div className="mock">{q}
      {[1, 2, 3].map(i => i === 2 ? <div key={i} style={hi}><span>{Math.min(s.target, 9)}</span><span style={{ flex: 1 }}>{s.store}</span><span style={{ fontSize: 13.5 }}>목표 자리</span></div> : <div key={i} style={lo}><span>{i === 1 ? Math.max(1, Math.min(s.target, 9) - 1) : Math.min(s.target, 9) + 1}</span><Line /></div>)}{cap(`「${kw}」 검색 결과에서의 자리`)}</div>;
    case 'auto': return <div className="mock">{q}
      {[`${kw} ${s.store}`, `${kw} 추천`, `${kw} 후기`, `${s.store} ${kw}`].map((t, i) => { const on = i === 0 || i === 3; return <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 14px', borderRadius: 10, background: on ? C.blueSoft : 'transparent', color: on ? C.blue : C.sub, fontWeight: on ? 800 : 500 }}><Svg n="search" c={on ? C.blue : C.mute} s={17} w={2.2} />{t}</div>; })}{cap('검색창에 입력하는 순간 함께 뜨는 자리')}</div>;
    case 'ad': return <div className="mock">{q}
      {[0, 1, 2].map(i => i === 0 ? <div key={i} style={hi}><span style={{ fontSize: 12.5, border: `1.5px solid ${C.blue}`, borderRadius: 5, padding: '0 6px' }}>광고</span><span style={{ flex: 1 }}>{s.store}</span><span style={{ fontSize: 13.5 }}>상단 즉시 노출</span></div>
        : <div key={i} style={lo}><span>{i}</span><Line /></div>)}{cap('순위와 별개로 바로 잡는 광고 자리')}</div>;
    case 'cafe': return <div className="mock"><div style={{ fontSize: 13.5, color: C.mute, fontWeight: 700 }}>○○맘 카페 · 생활정보</div>
      <div style={{ fontSize: 18.5, fontWeight: 800, color: C.ink, margin: '6px 0 10px', lineHeight: 1.4 }}>{kw} 고민하다 써 본 후기 남겨요</div><div style={{ display: 'grid', gap: 8 }}><Line /><Line w="86%" /><Line w="62%" /></div>
      <div style={{ display: 'flex', gap: 14, fontSize: 13.5, color: C.mute, marginTop: 12 }}><span>조회 ···</span><span>댓글 ···</span></div>
      <div style={{ marginTop: 10, background: C.bg, borderRadius: 10, padding: '10px 13px', fontSize: 15.5, color: C.sub }}>↳ 저도 이거 보고 있었는데 어디 거예요?</div>{cap('구매 직전 후기를 찾는 사람이 보게 되는 글')}</div>;
    case 'insta': return <div className="mock" style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 16, alignItems: 'center' }}>
      <div style={{ height: 170, borderRadius: 14, background: s.image ? `#fff url(${s.image}) center/cover` : 'linear-gradient(135deg,#DCE6FF,#EBDDFF)', border: `1.5px solid ${C.line}` }} />
      <div><div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#7A5CFF,#2B5BFF)' }} /><b style={{ fontSize: 16 }}>daily_review</b></div>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}><Line /><Line w="78%" /></div><div style={{ fontSize: 15, color: C.blue, fontWeight: 700, marginTop: 12, lineHeight: 1.5 }}>#{kw.replace(/\s+/g, '')} #{s.store.replace(/\s+/g, '')}</div></div>
      <div style={{ gridColumn: '1 / -1' }}>{cap('피드·릴스에 올라가는 콘텐츠')}</div></div>;
    case 'thread': return <div className="mock"><div style={{ display: 'flex', gap: 12 }}><div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E7EBF3', flex: 'none' }} /><div style={{ flex: 1 }}><b style={{ fontSize: 16 }}>써본사람</b>
      <div style={{ fontSize: 17, color: C.text, margin: '4px 0 10px', lineHeight: 1.55 }}>{kw} 이것저것 써 봤는데 결국 {s.store}로 정착함. 이유는 댓글에.</div><div style={{ display: 'flex', gap: 16, fontSize: 13.5, color: C.mute }}><span>좋아요 ···</span><span>댓글 ···</span><span>공유 ···</span></div></div></div>{cap('검색하지 않는 시간에 닿는 짧은 글')}</div>;
    case 'video': return <div className="mock"><div style={{ height: 170, borderRadius: 14, background: 'linear-gradient(135deg,#0F1A3A,#3A2AAE)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}><div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(255,255,255,.94)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 20 20"><path d="M6 3.500v13l10-6.500z" fill={C.ink} /></svg></div><div style={{ position: 'absolute', left: 14, bottom: 12, color: '#fff', fontSize: 15, fontWeight: 700 }}>{s.store} · {kw} 15초</div></div>{cap('릴스·쇼츠·상세페이지·광고에 나눠 쓰는 영상')}</div>;
    case 'title': { const ws = topWords(k).slice(0, 4).map(w => w[0]); return <div className="mock">
      <div style={{ fontSize: 13.5, color: C.red, fontWeight: 800 }}>지금 상품명</div><div style={{ fontSize: 16.5, color: C.sub, margin: '3px 0 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || `${s.store} 현재 상품명`}</div>
      <div style={{ fontSize: 13.5, color: C.blue, fontWeight: 800 }}>개선 방향 예시</div><div style={{ fontSize: 18, fontWeight: 800, color: C.ink, marginTop: 3, lineHeight: 1.45 }}>{s.store} <em>{kw}</em> {ws.join(' ')}</div>
      {cap('브랜드 → 메인 키워드 → 상위 10개가 공통으로 쓰는 단어 순서입니다. 실제 안은 검색량을 확인한 뒤 3개를 드립니다')}</div>; }
    default: return null;
  }
}
const Specs = ({ spec }: { spec: [string, string][] }) => <div className="g3" style={{ marginTop: 14 }}>{spec.map(([l, v]) => <div key={l} className="spec"><i>{l}</i><b>{v}</b></div>)}</div>;
/** 무기 상세 카드 — full: 화면 예시 + 저희가 하는 일 / 준비하실 것 */
function WeaponCard({ name, k, s, full, lead }: { name: string; k: KwData; s: StoreData; full?: boolean; lead?: boolean }) {
  const w = weaponInfo(name); const [c, bg, ln] = TC[w.track];
  return <div className="card" style={{ marginTop: 16, ...(lead ? { border: `2.5px solid ${c}`, boxShadow: `0 10px 28px ${bg}` } : {}) }}>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Ico n={w.icon} c={c} bg={bg} size={full ? 52 : 46} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}><Tag t={w.track} />{lead && <span className="tag" style={{ background: c, color: '#fff' }}>가장 먼저 시작</span>}</div><h3 style={{ marginTop: 5 }}>{name}</h3></div></div>
    <div style={{ fontSize: 19.5, fontWeight: 800, color: c, marginTop: 14, lineHeight: 1.45 }}>{w.hook}</div>
    <p style={{ fontSize: 17.5, color: C.sub, marginTop: 6, lineHeight: 1.72 }}>{w.what(k.keyword, s.store)}</p>
    {full && w.mock !== 'none' && <div style={{ marginTop: 16 }}><Mock kind={w.mock} k={k} s={s} /></div>}
    {full ? <Specs spec={w.spec} /> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 12, fontSize: 15.5, color: C.sub }}>{w.spec.map(([l, v]) => <span key={l}><span style={{ color: C.mute }}>{l}</span> <b style={{ color: C.ink }}>{v}</b></span>)}</div>}
    {full ? <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      <div className="soft" style={{ padding: '15px 18px' }}><div style={{ fontSize: 14.5, fontWeight: 800, color: C.sub, marginBottom: 4 }}>저희가 하는 일</div>{w.we.map(t => <div key={t} className="li w" style={{ fontSize: 17 }}>{t}</div>)}</div>
      <div style={{ background: bg, border: `1.5px solid ${ln}`, borderRadius: 18, padding: '15px 18px' }}><div style={{ fontSize: 14.5, fontWeight: 800, color: c, marginBottom: 4 }}>대표님이 준비하실 것</div><div style={{ fontSize: 17.5, fontWeight: 700, color: C.ink, lineHeight: 1.6 }}>{w.you}</div></div></div>
      : <div style={{ fontSize: 15.5, color: C.sub, marginTop: 8, background: bg, borderRadius: 12, padding: '10px 14px', lineHeight: 1.55 }}><b style={{ color: c }}>준비하실 것</b> &nbsp;<b style={{ color: C.ink }}>{w.you}</b></div>}
  </div>;
}
/** 지수 비교 — 축마다 한 줄 (막대 = 이 상품, 검정 선 = 상위 10 평균) */
const AxesRows = ({ a, t }: { a: Axes; t: Axes }) => <div style={{ display: 'grid', gap: 14 }}>{SHOW_AXES.map(x => { const d = a[x] - t[x]; const col = d >= 0 ? C.green : d <= -0.5 ? C.red : C.amber;
  return <div key={x} style={{ display: 'grid', gridTemplateColumns: '142px 1fr 92px', gap: 14, alignItems: 'center' }}>
    <div><div style={{ fontSize: 17.5, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>{AXIS_LABEL[x]}</div><div style={{ fontSize: 13, color: C.mute, lineHeight: 1.4 }}>{AXIS_DESC[x]}</div></div>
    <div style={{ height: 14, borderRadius: 7, background: '#E7EBF3', position: 'relative' }}><div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 7, width: `${Math.max(3, Math.min(100, a[x] / 5 * 100))}%`, background: col }} /><div style={{ position: 'absolute', top: -5, left: `calc(${Math.min(100, t[x] / 5 * 100)}% - 1.5px)`, width: 3, height: 24, borderRadius: 2, background: C.ink }} /></div>
    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}><b style={{ fontSize: 21, color: col }}>{a[x]}</b><span style={{ fontSize: 14.5, color: C.mute }}> / {t[x]}</span></div></div>; })}</div>;
/** 1페이지 40개 자리 지도 — 지금 자리와 목표 자리 */
function RankMap({ k, s }: { k: KwData; s: StoreData }) {
  const cur = s.rank != null && s.rank <= 40 ? s.rank : null; const defend = s.leak === 'defend'; const tg = s.target; const curC = defend ? C.blue : C.red;
  const share = Math.round(100 * TOP10_SHARE / PAGE1_SHARE);
  const dot = (bg: string, bd: string) => <span style={{ display: 'inline-block', width: 13, height: 13, borderRadius: 4, background: bg, border: `1.5px solid ${bd}`, marginRight: 6, verticalAlign: -1 }} />;
  return <div className="card" style={{ padding: '20px 20px 18px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}><b style={{ fontSize: 18, color: C.ink }}>「{k.keyword}」 검색 1페이지 · 40개 자리</b><span style={{ fontSize: 13.5, color: C.mute }}>{k.date} 기준</span></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 5 }}>{Array.from({ length: 40 }, (_, i) => i + 1).map(r => { const isCur = r === cur, isTg = r === tg && r !== cur, top = r <= 10;
      const st = isCur ? { background: curC, color: '#fff', borderColor: curC } : isTg ? { background: C.green, color: '#fff', borderColor: C.green } : top ? { background: C.blueSoft, color: C.blue, borderColor: C.blueLine } : { background: C.bg, color: '#A3ABBD', borderColor: C.bg };
      return <div key={r} style={{ height: 46, borderRadius: 10, border: '1.5px solid', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, ...st }}>{r}{(isCur || isTg) && <span style={{ fontSize: 10.5, fontWeight: 700 }}>{isCur ? '지금' : '목표'}</span>}</div>; })}</div>
    {cur == null && <div style={{ marginTop: 8, border: `2px dashed ${C.redLine}`, background: C.redSoft, borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><b className="red" style={{ fontSize: 17.5, whiteSpace: 'nowrap' }}>지금 · {rankText(k, s)}</b><span style={{ color: C.sub, fontSize: 15, textAlign: 'right', lineHeight: 1.45 }}>{s.rank ? '2페이지 이후 — 검색한 사람이 잘 넘겨 보지 않는 자리' : `상위 ${k.n}개 안에서 확인되지 않는 상태`}</span></div>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 14, fontSize: 14.5, color: C.sub, lineHeight: 1.5 }}>
      <span>{dot(curC, curC)}{defend ? '지금 자리' : '지금 자리'}</span><span>{dot(C.green, C.green)}{defend ? '다음 목표' : '1차 목표'}</span><span>{dot(C.blueSoft, C.blueLine)}상위 10 — 1페이지 클릭의 약 {share}%가 몰리는 자리(추정)</span></div>
  </div>;
}
/** 다섯 단계 상태 */
function Funnel({ s }: { s: StoreData }) {
  const defend = s.leak === 'defend'; const fn = s.funnel ?? [];
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>{FUNNEL.map((f, i) => { const on = i === s.stage; const v = fn[i] ?? (i < s.stage ? 2 : 0);
    const [bg, fg, t] = on ? [defend ? C.blue : C.red, '#fff', defend ? '넓힐 곳' : '먼저 풀 곳'] : v === 2 ? [C.greenSoft, C.green, '준비됨'] : v === 1 ? [C.amberSoft, C.amber, '보완 필요'] : [C.bg, C.mute, i === 4 ? '다음 단계' : '확인 전'];
    return <div key={f} style={{ padding: '14px 4px 12px', textAlign: 'center', borderRadius: 14, background: bg, color: fg }}><div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.3 }}>{f}</div><div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 3, opacity: .94 }}>{t}</div></div>; })}</div>;
}
const H2: Record<Leak, [string, string]> = { exposure: ['검색한 사람에게', '보이지 않는 상태'], trust: ['순위보다 먼저', '후기가 비어 있는 상태'], awareness: ['검색만으로는', '수요가 부족한 시장'], conversion: ['들어와도', '가격에서 걸리는 상태'], title: ['상품명이', '키워드와 어긋난 상태'], defend: ['', ''] };

export default function Pv3Doc(p: Pv3Props) {
  const { k, ka, s, sa, brand, page } = p; const kw = k.keyword; const g = k.volume.group; const defend = s.leak === 'defend';
  const stages = (sa.stages?.length ? sa.stages : ka.stages?.length ? ka.stages : fallbackStages(k, s)); const P1 = s.plan[0], P2 = s.plan[1], P3 = s.plan[2];
  const kakao = brand.kakao.replace(/^https?:\/\//, '');
  const have = (sa.have?.length ? sa.have : s.good ?? []).slice(0, 3); const lack = (sa.leak?.length ? sa.leak : s.bad ?? s.why ?? []).slice(0, 3);
  const ratio = (x: number) => Math.max(10, Math.min(100, Math.round(100 * x)));
  const B = (n: number) => <Bar n={n} brand={brand.name} />; const F = (n: number) => <Foot k={k} n={n} />;
  const first = sa.first || `카카오톡으로 상품 URL을 보내 주시면, 「${kw}」와 연관 키워드 현재 순위부터 확인해 드립니다.`;
  switch (page) {
    // ───────── 1. 표지 (업체별) ─────────
    case 1: { const hl = sa.headline; return <div className="pv3">
      <div className="hero">
        <div className="hb"><span className="brand">{brand.name}</span><span>광고 설계 제안서 · {k.date}</span></div>
        <span className="pill">{s.store} 대표님께 드리는 맞춤 설계안</span>
        <h1 style={{ fontSize: hl.length > 40 ? 37 : hl.length > 28 ? 41 : 46 }}>{hl}</h1>
        <p className="hlead">「{kw}」 상위 {k.n}개 상품의 실제 데이터{g ? <>와 월 검색량 <b>{won(g)}회</b></> : null}를 기준으로, <b>{s.store} 상품 하나만 놓고</b> 설계한 제안서입니다.</p>
        {(s.image || s.title) && <div className="pcard">
          {s.image && <img src={s.image} alt="" style={{ width: 92, height: 92, borderRadius: 13, objectFit: 'cover', border: `1px solid ${C.line}`, flex: 'none' }} />}
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, color: C.mute, fontWeight: 700 }}>분석한 상품</div><div style={{ fontSize: 17.5, fontWeight: 700, color: C.ink, lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.title || s.store}</div>
            <div style={{ marginTop: 4 }}>{s.rank != null && <span className="chip" style={{ fontSize: 14.5, padding: '4px 12px' }}>{s.rank}위{s.ad ? ' · 광고' : ''}</span>}{s.reviews != null && <span className="chip" style={{ fontSize: 14.5, padding: '4px 12px' }}>리뷰 {won(s.reviews)}</span>}{s.price != null && <span className="chip" style={{ fontSize: 14.5, padding: '4px 12px' }}>{won(s.price)}원</span>}</div></div></div>}
      </div>
      <div className="body" style={{ paddingTop: 26 }}>
        <div className="g3">
          <div className="stat"><b>{rankText(k, s)}</b><span>「{kw}」 현재 순위<br />{s.rank ? s.band : `상위 ${k.n}개 안에 없음`}</span></div>
          {defend ? <div className="stat"><b className="green">{man(s.revenue.keep)}</b><span>지금 자리에서 지키는<br />월 매출 추정</span></div> : <div className="stat" style={{ background: C.redSoft, borderColor: C.redLine }}><b className="red">{LEAK_LABEL[s.leak]}</b><span style={{ color: C.sub }}>가장 먼저 풀 곳<br />(02 진단 참고)</span></div>}
          <div className="stat" style={{ borderColor: C.blueLine, background: C.blueSoft }}><b style={{ color: C.blue }}>+{man(s.revenue.gain)}</b><span style={{ color: C.sub }}>{defend ? '연관 키워드로 넓히면' : `${s.target}위권 진입 시`}<br />월 추가 매출 추정</span></div></div>
        <div style={{ marginTop: 14, borderRadius: 20, padding: '24px 26px', background: `linear-gradient(135deg,${C.blueSoft},${C.violetSoft})`, border: `1.5px solid ${C.blueLine}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.blue, letterSpacing: '.06em' }}>이 제안의 한 줄</div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.42, marginTop: 6, letterSpacing: '-.03em', color: C.ink }}>{sa.thesis}</div></div>
        <div className="sec"><div className="eyebrow">먼저 이 세 가지만 보셔도 됩니다</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {([['지금', C.sub, C.bg, C.line, nowLine(k, s)], ['가장 먼저', C.blue, C.blueSoft, C.blueLine, <><b style={{ color: C.ink }}>{s.lead}</b>부터 시작합니다 ({P1.when}). {stages[0]}</>], ['대표님이 하실 일', C.green, C.greenSoft, C.greenLine, first]] as [string, string, string, string, React.ReactNode][]).map(([t, c, bg, ln, d]) => <div key={t} className="row" style={{ gridTemplateColumns: '1fr', gap: 4, background: bg, border: `1.5px solid ${ln}` }}><b style={{ color: c, fontSize: 15 }}>{t}</b><span style={{ fontSize: 18, lineHeight: 1.62 }}>{d}</span></div>)}</div></div>
        <div className="sec"><div className="eyebrow">이 제안서에 담긴 내용</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 22px', marginTop: 8 }}>
            {[['02', '진단', `${s.store} 상품이 막힌 곳`], ['03', '시장', `「${kw}」의 수요와 돈`], ['04', '사는 사람', '무엇을 보고 사는지'], ['05', '광고 설계', '무엇을 어떤 순서로'], ['06', '1단계 상세', '실제로 하는 일과 준비물'], ['07', '2·3단계', '그 다음에 더하는 것'], ['08', '일정·역할', '언제 무엇이 진행되는지'], ['09', '예상 매출', '추정 매출과 계산 근거'], ['10', '문의', '카카오톡으로 시작하는 방법']].map(([n, t, d]) => <div key={n} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: `1px solid ${C.line}`, alignItems: 'baseline' }}><b style={{ color: C.blue, fontSize: 14, width: 22, flex: 'none' }}>{n}</b><b style={{ fontSize: 16.5, color: C.ink, whiteSpace: 'nowrap' }}>{t}</b><span style={{ fontSize: 14, color: C.mute, lineHeight: 1.4 }}>{d}</span></div>)}</div></div>
        {F(1)}</div></div>; }

    // ───────── 2. 진단 (업체별) ─────────
    case 2: return <div className="pv3">{B(2)}<div className="body">
      <div className="eyebrow">DIAGNOSIS · 진단</div>
      <h2>{defend ? <>상단 자리는 확보한 상태,<br />남은 건 <em>지키면서 넓히는 일</em></> : <>{s.store} 상품, {H2[s.leak][0]}<br /><span className="red">{H2[s.leak][1]}</span></>}</h2>
      <p className="lead">{sa.summary || `검색에서 구매까지 다섯 단계 중 ${s.store} 상품이 ${defend ? '서 있는' : '멈추는'} 자리를 데이터로 확인했습니다.`}</p>
      <div className="sec"><RankMap k={k} s={s} /></div>
      <div className="sec"><div className="lbl">검색에서 구매까지 다섯 단계 — {s.store} 상품의 상태</div><Funnel s={s} />
        <p className="cap">인지(처음 알게 됨) → 탐색(검색해서 찾음) → 비교(후기·가격을 견줌) → 구매(상세를 보고 결제) → 재구매 순서입니다. {defend ? '파란 칸이 지금부터 넓힐 곳입니다.' : '빨간 칸이 가장 먼저 풀어야 하는 곳입니다.'}</p></div>
      {s.axes ? <div className="card sec"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}><b style={{ fontSize: 18, color: C.ink }}>네이버 쇼핑 지수 — 상위 10개와 비교</b><span style={{ fontSize: 13.5, color: C.mute }}>5점 만점</span></div><AxesRows a={s.axes} t={k.axes10} />
        <p className="cap" style={{ marginTop: 14 }}>막대가 이 상품, 검정 선이 상위 10개 평균입니다. 「{kw}」 검색 결과에서 조회한 값이며 오른쪽 숫자는 이 상품 / 상위 10 평균입니다.</p></div>
        : <div className="soft sec" style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Ico n="doc" c={C.blue} bg={C.blueSoft} /><div style={{ fontSize: 17, lineHeight: 1.6 }}><b style={{ color: C.ink }}>클릭·판매·적합도 지수는 상품 URL이 있어야 확인됩니다.</b><br /><span style={{ color: C.sub }}>카카오톡으로 URL을 보내 주시면 상위 10개와 비교해서 알려 드립니다.</span></div></div>}
      <div className="sec" style={{ display: 'grid', gap: 12 }}>
        <div className="card" style={{ background: C.greenSoft, borderColor: C.greenLine }}><div style={{ fontSize: 15.5, fontWeight: 800, color: C.green, marginBottom: 4 }}>이미 가진 것</div>{(have.length ? have : ['상품 URL을 주시면 확인해 드립니다']).map((h, i) => <div key={i} className="li w">{h}</div>)}</div>
        <div className="card" style={{ background: C.redSoft, borderColor: C.redLine }}><div style={{ fontSize: 15.5, fontWeight: 800, color: C.red, marginBottom: 4 }}>{defend ? '아직 비어 있는 것' : '지금 비어 있는 것'}</div>{lack.map((h, i) => <div key={i} className="li xw">{h}</div>)}</div></div>
      <div className="sec" style={{ display: 'grid', gap: 10 }}>
        {([['지금', C.sub, C.bg, nowLine(k, s)],
          ['그대로 두면', C.red, C.redSoft, defend ? `연관 키워드 ${k.volume.related.length}개의 검색 수요는 계속 다른 상품 몫으로 남고, 상단 자리를 노리는 경쟁 상품은 늘어납니다.` : `상위 10개가 가져가는 월 ${eok(k.revenue.loss)} 규모(추정)의 매출은 계속 경쟁 상품 몫이고, 클릭·리뷰 격차는 시간이 갈수록 벌어집니다.`],
          ['진행하면', C.green, C.greenSoft, defend ? `지금 자리를 지키면서 연관 키워드로 넓혀, 월 +${man(s.revenue.gain)}(추정)의 추가 매출을 목표로 합니다.` : `「${P1.title}」부터 시작해 ${s.target}위권 진입을 목표로 하고, 진입 시 월 +${man(s.revenue.gain)}(추정)의 추가 매출을 예상합니다.`]] as [string, string, string, string][]).map(([t, c, bg, d]) => <div key={t} className="row" style={{ gridTemplateColumns: '104px 1fr', background: bg, borderLeft: `6px solid ${c}` }}><b style={{ color: c, fontSize: 16.5, lineHeight: 1.7 }}>{t}</b><span style={{ fontSize: 17.5, lineHeight: 1.62 }}>{d}</span></div>)}</div>
      {F(2)}</div></div>;

    // ───────── 3. 시장 (키워드 공통) ─────────
    case 3: { const cm = k.contentMarket; const hasCm = cm.blog != null || cm.cafe != null || cm.youtube != null; const base = g * k.revenue.conv * k.revenue.aov; const words = topWords(k); return <div className="pv3">{B(3)}<div className="body">
      <div className="eyebrow">MARKET · 시장</div>
      <h2>「{kw}」 시장에 있는<br />수요와 돈</h2>
      <p className="lead">{ka.marketRead || `「${kw}」를 둘러싼 검색 수요와, 그 수요가 어느 자리로 흘러가는지 정리했습니다.`}</p>
      <div className="g3 sec">
        <div className="stat"><b>{g ? won(g) : '—'}</b><span>월 검색수<br />메인 {won(k.volume.main)} + 연관 {k.volume.related.length}개</span></div>
        <div className="stat"><b>{hasCm ? `${Math.round(((cm.blog ?? 0) + (cm.cafe ?? 0)) / 10000)}만` : `${k.stats.adCount10}개`}</b><span>{hasCm ? <>블로그·카페 글 수<br />콘텐츠 경쟁 규모</> : <>상위 10개 중<br />광고 상품</>}</span></div>
        <div className="stat"><b>{won(k.revenue.aov)}원</b><span>상위 10개 평균 가격<br />90일 내 신규 {k.stats.newRate}%</span></div></div>
      <div className="dark sec"><div style={{ fontSize: 16, marginBottom: 14, color: '#AEB8D2', fontWeight: 600 }}>「{kw}」 검색에서 매달 오가는 매출 · 추정</div>
        <div style={{ display: 'grid', gap: 11 }}>{([['1페이지 전체 (1~40위)', k.revenue.market, 100, '#3D63FF'], ['상위 10개가 가져가는 몫', k.revenue.loss, ratio(k.revenue.loss / Math.max(1, k.revenue.market)), '#5B7BFF'], ['1위 한 자리', base * ctr(1), ratio(ctr(1) / PAGE1_SHARE), '#8FA6FF'], ['3위 한 자리', base * ctr(3), ratio(ctr(3) / PAGE1_SHARE), '#B9C8FF']] as [string, number, number, string][]).map(([l, v, w, c], i) => <div key={i}><div style={{ fontSize: 14.5, color: '#AEB8D2', marginBottom: 4 }}>{l}</div><div style={{ height: 40, borderRadius: 10, background: c, width: `${w}%`, minWidth: 128, display: 'flex', alignItems: 'center', paddingLeft: 14, fontWeight: 800, fontSize: 19, color: i >= 2 ? C.ink : '#fff', whiteSpace: 'nowrap' }}>{eok(v)}</div></div>)}</div>
        <div style={{ fontSize: 13.5, color: '#8A93A8', marginTop: 14, lineHeight: 1.6 }}>계산 근거 — 월 검색 {won(g)}회 × 순위별 클릭 점유(1위 12% · 2~3위 7% · 4~5위 4% · 6~10위 2.5% · 11~40위 0.6%) × 구매 전환 {(k.revenue.conv * 100).toFixed(1)}% × 객단가 {won(k.revenue.aov)}원. 가정에 따른 추정치입니다.</div></div>
      <div className="sec"><h3>상위 10개 — 리뷰가 많다고<br />위에 있지 않습니다</h3>
        <div className="card" style={{ marginTop: 12, padding: '8px 14px 4px' }}><table><thead><tr><th style={{ width: 54 }}>순위</th><th style={{ textAlign: 'left' }}>상품</th><th>리뷰</th><th>가격</th><th>클릭지수</th></tr></thead><tbody>
          {k.top10.slice(0, 10).map(t => <tr key={t.rank}><td><b>{t.rank}</b>{t.ad && <span style={{ fontSize: 10.5, color: C.mute, marginLeft: 3 }}>AD</span>}</td><td className="l" style={{ maxWidth: 258 }}>{t.title}</td><td>{won(t.reviews)}</td><td>{won(t.price)}</td><td style={{ color: C.blue, fontWeight: 800 }}>{t.click.toFixed(1)}</td></tr>)}</tbody></table></div>
        <div className="g3" style={{ marginTop: 12 }}>
          <div className="stat" style={{ background: C.blueSoft, borderColor: C.blueLine }}><b style={{ color: C.blue }}>{k.stats.avgClick10}</b><span style={{ color: C.sub }}>상위 10<br />클릭지수 평균</span></div>
          <div className="stat"><b>{k.stats.avgClickMid || '—'}</b><span>11~40위<br />클릭지수 평균</span></div>
          <div className="stat" style={{ background: C.redSoft, borderColor: C.redLine }}><b className="red">{k.stats.avgClickMid ? Math.round((k.stats.avgClick10 - k.stats.avgClickMid) * 10) / 10 : '—'}</b><span style={{ color: C.sub }}>이 차이가<br />순위를 가릅니다</span></div></div>
        <p className="cap">클릭지수는 5점 만점이며 「{kw}」 상위 {k.n}개 상품을 {k.date}에 조회한 값입니다. 순위를 올리는 작업은 리뷰를 만드는 일이 아니라, 검색한 사람이 상품을 찾아 들어오는 유입을 쌓는 일입니다.</p></div>
      {words.length > 0 && <div className="soft sec"><div className="lbl" style={{ marginBottom: 6 }}>상위 10개 상품명이 공통으로 쓰는 단어</div>{words.map(([w, n]) => <span key={w} className="chip">{w} <span style={{ color: C.mute, fontWeight: 600, fontSize: 13.5 }}>{n}</span></span>)}<p className="cap">2개 이상 상품이 쓰는 단어입니다. 검색하는 사람이 반응하는 말이라, 상품명·상세 문구를 볼 때 기준이 됩니다.</p></div>}
      {k.volume.related.length > 0 && <div className="sec"><div className="lbl" style={{ marginBottom: 6 }}>함께 검색되는 연관 키워드 · 월 검색수</div>{k.volume.related.map(r => <span key={r.keyword} className="chip">{r.keyword} <span style={{ color: C.blue, fontSize: 14.5 }}>{won(r.total)}</span></span>)}</div>}
      {F(3)}</div></div>; }

    // ───────── 4. 사는 사람 (키워드 공통) ─────────
    case 4: return <div className="pv3">{B(4)}<div className="body">
      <div className="eyebrow">BUYER · 사는 사람</div>
      <h2>「{kw}」를 검색하는 사람</h2>
      <p className="lead">광고는 상품 스펙이 아니라 사는 사람의 상황에서 출발해야 합니다. 검색량·가격대·리뷰에서 읽은 구매자의 모습입니다.</p>
      <div className="sec" style={{ display: 'grid', gap: 10 }}>{([['누가', ka.buyer.who, 'user'], ['속마음', ka.buyer.truth, 'bulb'], ['사는 순간', ka.buyer.moment, 'check']] as [string, string, string][]).map(([t, v, ic]) => <div key={t} className="card" style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 16, alignItems: 'center' }}><Ico n={ic} c={C.blue} bg={C.blueSoft} size={52} /><div><div style={{ fontSize: 14.5, fontWeight: 800, color: C.blue }}>{t}</div><div style={{ fontSize: 21.5, fontWeight: 800, color: C.ink, lineHeight: 1.45, letterSpacing: '-.025em' }}>{v}</div></div></div>)}</div>
      <div className="sec" style={{ display: 'grid', gap: 8 }}>
        <div className="card" style={{ background: C.redSoft, borderColor: C.redLine }}><div style={{ fontSize: 14.5, fontWeight: 800, color: C.red }}>이 시장에서 파는 쪽의 어려움</div><div style={{ fontSize: 20.5, fontWeight: 800, color: C.ink, lineHeight: 1.5, marginTop: 4, letterSpacing: '-.025em' }}>{ka.reframe.weak}</div></div>
        <div style={{ display: 'flex', justifyContent: 'center', transform: 'rotate(90deg)', height: 22 }}><Svg n="arrow" c={C.mute} s={22} w={2.4} /></div>
        <div className="card" style={{ background: C.greenSoft, borderColor: C.greenLine }}><div style={{ fontSize: 14.5, fontWeight: 800, color: C.green }}>뒤집어 보면</div><div style={{ fontSize: 20.5, fontWeight: 800, color: C.ink, lineHeight: 1.5, marginTop: 4, letterSpacing: '-.025em' }}>{ka.reframe.flip}</div></div></div>
      <div className="soft sec"><div className="lbl">그래서 설계는 이렇게 이어집니다</div>
        {[['시장', ka.narrative.diagnosis], ['사는 사람', ka.narrative.insight], ['광고 방향', ka.narrative.strategy]].map(([t, v], i) => <div key={t} style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: 10, alignItems: 'start', padding: '11px 0', borderTop: i ? `1px solid ${C.line}` : 0 }}><b style={{ color: '#fff', background: C.blue, fontSize: 14, width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 3 }}>{i + 1}</b><div><div style={{ fontSize: 14, color: C.mute, fontWeight: 700 }}>{t}</div><div style={{ fontSize: 19, fontWeight: 700, color: C.ink, lineHeight: 1.5 }}>{v}</div></div></div>)}</div>
      {F(4)}</div></div>;

    // ───────── 5. 광고 설계 (업체별) ─────────
    case 5: { const all = s.plan.flatMap(pl => pl.weapons.map(w => ({ w, ph: pl.phase }))); const oc = defend ? C.blue : C.red; return <div className="pv3">{B(5)}<div className="body">
      <div className="eyebrow">PLAN · 광고 설계</div>
      <h2>{defend ? <>지키는 순서,<br />넓히는 순서</> : <>막힌 곳 하나,<br />그걸 푸는 순서 셋</>}</h2>
      <p className="lead">할 수 있는 광고를 전부 권하는 제안이 아닙니다. {s.store} 상품의 {defend ? '현재 자리' : '막힌 구간'}에 맞춰 <b>먼저 할 것과 나중에 할 것</b>을 나눴습니다. 가장 먼저 시작하는 것은 <b style={{ color: C.blue }}>{s.lead}</b>입니다.</p>
      <div className="sec"><div className="lbl">고객이 검색해서 사기까지 — 단계마다 배치한 광고</div>
        <div style={{ border: `1.5px solid ${C.line}`, borderRadius: 18, overflow: 'hidden' }}>{FUNNEL.map((f, i) => { const ws = all.filter(x => weaponInfo(x.w).step === i); const on = i === s.stage; return <div key={f} style={{ display: 'grid', gridTemplateColumns: '122px 1fr', borderTop: i ? `1.5px solid ${C.line}` : 0, background: on ? (defend ? C.blueSoft : C.redSoft) : '#fff' }}>
          <div style={{ padding: '14px 0 14px 16px', fontWeight: 800, fontSize: 18, color: on ? oc : C.ink, lineHeight: 1.35 }}>{f}<div style={{ fontSize: 13, fontWeight: 700, color: on ? oc : C.mute, marginTop: 2 }}>{on ? (defend ? '지금 넓힐 곳' : '먼저 풀 곳') : STAGE_DESC[i]}</div></div>
          <div style={{ padding: '10px 12px 10px 8px' }}>{ws.length ? ws.map(x => { const tc = TC[weaponInfo(x.w).track][0]; return <span key={x.w} className="chip" style={{ fontSize: 15.5, padding: '5px 12px', ...(x.w === s.lead ? { background: tc, color: '#fff', borderColor: tc } : { borderColor: tc, color: tc }) }}>{x.w}<span style={{ fontSize: 12, opacity: .78, marginLeft: 5 }}>{x.ph}단계</span></span>; }) : <span style={{ fontSize: 15, color: C.mute, lineHeight: '42px' }}>{i === 4 ? '앞 단계가 쌓이면 따라오는 구간 (브랜드 검색·재구매)' : '이번 설계에서는 별도 광고 없이 진행'}</span>}</div></div>; })}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 12, fontSize: 14.5, color: C.sub }}>{(['pf', 'br', 'ct'] as Track[]).map(t => <span key={t}><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 4, background: TC[t][0], marginRight: 6, verticalAlign: -1 }} />{TRACK_LABEL[t]}</span>)}</div></div>
      <div className="sec" style={{ display: 'grid', gap: 12 }}>{s.plan.map((pl, i) => <div key={pl.phase} className="card" style={i === 0 ? { border: `2.5px solid ${C.blue}`, boxShadow: `0 10px 28px ${C.blueSoft}` } : {}}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><div className="num" style={{ background: i === 0 ? C.blue : C.bg, color: i === 0 ? '#fff' : C.ink }}>{pl.phase}</div><div><div style={{ fontSize: 14.5, fontWeight: 700, color: i === 0 ? C.blue : C.mute }}>{pl.when}{i === 0 ? ' · 지금 시작' : ''}</div><h3>{pl.title}</h3></div></div>
        <div style={{ marginTop: 10 }}>{pl.weapons.map(w => <span key={w} className="chip" style={w === s.lead ? { background: C.blue, color: '#fff', borderColor: C.blue } : {}}>{w}</span>)}</div>
        <p style={{ fontSize: 17.5, color: C.sub, marginTop: 10, lineHeight: 1.72 }}>{stages[i] ?? ''}</p></div>)}</div>
      <div className="soft sec"><div className="lbl" style={{ marginBottom: 4 }}>이번에는 권하지 않는 것</div>{s.skip.map((x, i) => <div key={i} style={{ padding: '11px 0', borderTop: i ? `1px solid ${C.line}` : 0 }}><b style={{ color: C.mute, textDecoration: 'line-through', fontSize: 16.5 }}>{x.weapon}</b><div style={{ color: C.sub, lineHeight: 1.6, fontSize: 16.5, marginTop: 2 }}>{sa.skipWhy?.[i] || x.why}</div></div>)}<p className="cap">필요 없는 광고비가 나가지 않도록, 지금 단계에 맞지 않는 것은 빼 두었습니다.</p></div>
      {F(5)}</div></div>; }

    // ───────── 6. 1단계 상세 (업체별) ─────────
    case 6: return <div className="pv3">{B(6)}<div className="body">
      <div className="eyebrow">STEP 1 · {P1.when}</div>
      <h2>1단계 「{P1.title}」<br />실제로 진행되는 일</h2>
      <p className="lead">가장 먼저 시작하는 단계입니다. 채널마다 <b>무엇을 하는지, 어떻게 보이는지, 대표님이 무엇을 준비하시면 되는지</b> 정리했습니다.</p>
      {[...P1.weapons.filter(w => w === s.lead), ...P1.weapons.filter(w => w !== s.lead)].map(w => <WeaponCard key={w} name={w} k={k} s={s} full lead={w === s.lead} />)}
      {F(6)}</div></div>;

    // ───────── 7. 2·3단계 (업체별) ─────────
    case 7: return <div className="pv3">{B(7)}<div className="body">
      <div className="eyebrow">STEP 2 · 3</div>
      <h2>그 다음 단계에서<br />더하는 것</h2>
      <p className="lead">1단계 결과를 보고 진행 여부를 정하시면 됩니다. 처음부터 한꺼번에 계약하실 필요는 없습니다.</p>
      {[P2, P3].filter(Boolean).map(pl => <div key={pl.phase} className="sec">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: C.ink, borderRadius: 16, padding: '14px 18px' }}><div className="num" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}>{pl.phase}</div><div><div style={{ fontSize: 14, color: '#9AA6C4', fontWeight: 700 }}>{pl.when}</div><h3 style={{ color: '#fff' }}>{pl.title}</h3></div></div>
        <p style={{ fontSize: 17.5, color: C.sub, marginTop: 12, lineHeight: 1.72 }}>{stages[pl.phase - 1] ?? ''}</p>
        {pl.weapons.map((w, i) => <WeaponCard key={w} name={w} k={k} s={s} full={i === 0 && pl.phase === 2} />)}</div>)}
      {F(7)}</div></div>;

    // ───────── 8. 일정·역할 (업체별) ─────────
    case 8: { const tl = TIMELINE[s.leak] ?? TIMELINE.exposure; const lw = weaponInfo(s.lead); const from = s.rank && s.rank <= 100 ? s.rank : 60; const tg = defend ? Math.max(1, s.target) : s.target;
      const pts = (defend ? [from, from, from, Math.max(tg, from - 1), from, Math.max(tg, from - 1), Math.max(tg, from - 1), tg, tg, tg] : [from, from, Math.round(from * .8), Math.round(from * .62), Math.round(from * .5), Math.round(from * .38), Math.round(from * .3), Math.max(tg + 3, Math.round(from * .22)), tg + 1, tg]).map(v => Math.max(1, v)); const mx = Math.max(...pts, 5);
      return <div className="pv3">{B(8)}<div className="body">
      <div className="eyebrow">SCHEDULE · 일정과 역할</div>
      <h2>시작하면<br />이렇게 진행됩니다</h2>
      <p className="lead">대표님이 하실 일은 많지 않습니다. 자료만 주시면 세팅·진행·확인은 저희가 맡고, 진행 상황은 그때그때 공유드립니다.</p>
      <div className="card sec" style={{ padding: '10px 24px' }}>{tl.map(([d, t], i) => <div key={d} style={{ display: 'grid', gridTemplateColumns: '26px 96px 1fr', gap: 12, alignItems: 'start', padding: '15px 0', borderTop: i ? `1px solid ${C.line}` : 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? C.blue : C.blueSoft, color: i === 0 ? '#fff' : C.blue, fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 3 }}>{i + 1}</div><b style={{ fontSize: 18, color: C.blue, lineHeight: 1.7 }}>{d}</b><span style={{ fontSize: 18, color: C.text, lineHeight: 1.62 }}>{t}</span></div>)}</div>
      <div className="sec" style={{ display: 'grid', gap: 12 }}>
        <div className="card" style={{ background: C.blueSoft, borderColor: C.blueLine }}><div style={{ fontSize: 15.5, fontWeight: 800, color: C.blue, marginBottom: 6 }}>대표님이 하실 일 — 세 가지</div>
          {['카카오톡으로 상품 URL 보내기', lw.todo || lw.you, '리포트를 보시고 계속할지 결정'].map((t, i) => <div key={i} style={{ display: 'flex', gap: 12, padding: '7px 0', fontSize: 18, lineHeight: 1.55, alignItems: 'flex-start' }}><b style={{ color: '#fff', background: C.blue, width: 26, height: 26, borderRadius: 8, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 2 }}>{i + 1}</b><span style={{ fontWeight: 700, color: C.ink }}>{t}</span></div>)}</div>
        <div className="card"><div style={{ fontSize: 15.5, fontWeight: 800, color: C.sub, marginBottom: 4 }}>저희가 하는 일</div>{[...lw.we, '진행 중 문의는 카카오톡으로 당일 답변'].map(t => <div key={t} className="li">{t}</div>)}</div></div>
      {(s.leak === 'exposure' || s.leak === 'defend' || s.leak === 'title') && <div className="card sec"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3>받아 보시는 순위 리포트</h3><span className="tag" style={{ background: C.bg, color: C.mute }}>예시 화면</span></div>
        <svg width="100%" viewBox="0 0 592 168" style={{ marginTop: 12, display: 'block' }}><line x1="0" y1="140" x2="592" y2="140" stroke={C.line} />{[0, 1, 2].map(i => <line key={i} x1="0" y1={30 + i * 37} x2="592" y2={30 + i * 37} stroke="#EFF2F7" />)}
          <polyline fill="none" stroke={C.blue} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" points={pts.map((v, i) => `${24 + i * 60},${30 + (v / mx) * 105}`).join(' ')} />
          {pts.map((v, i) => <g key={i}><circle cx={24 + i * 60} cy={30 + (v / mx) * 105} r="5" fill="#fff" stroke={C.blue} strokeWidth="2.5" />{(i === 0 || i === 4 || i === 9) && <text x={24 + i * 60} y={17 + (v / mx) * 105} fontSize="14" fontWeight="800" fill={C.ink} textAnchor="middle">{v}위</text>}<text x={24 + i * 60} y="160" fontSize="12.5" fill={C.mute} textAnchor="middle">{i + 1}일</text></g>)}</svg>
        <p className="cap">순위 흐름을 설명하기 위한 예시이며 실제 결과는 키워드 경쟁도에 따라 달라집니다. 진행 중에는 매일 순위를 공유드리고, 변동이 있으면 당일 조정합니다.</p></div>}
      <div className="g3 sec"><div className="stat"><b>매일</b><span>순위·진행 확인</span></div><div className="stat"><b>당일</b><span>요청·변동 반영</span></div><div className="stat"><b>10일</b><span>단위로 결과 보고 결정</span></div></div>
      {F(8)}</div></div>; }

    // ───────── 9. 예상 매출·조합 (업체별) ─────────
    case 9: { const g6 = s.revenue.gain * 6; return <div className="pv3">{B(9)}<div className="body">
      <div className="eyebrow">PROJECTION · 예상 매출</div>
      <h2>진행했을 때의<br />예상 매출</h2>
      <p className="lead">검색량과 순위별 클릭 비율로 계산한 추정치입니다. 실제 매출은 상품·시기에 따라 달라질 수 있어, 계산 근거를 함께 적었습니다.</p>
      <div className="g3 sec">
        {defend ? <div className="stat"><b>{man(s.revenue.keep)}</b><span>지금 자리에서 지키는<br />월 매출</span></div> : <div className="stat" style={{ borderColor: C.blueLine, background: C.blueSoft }}><b style={{ color: C.blue }}>+{man(s.revenue.gain)}</b><span style={{ color: C.sub }}>{s.target}위권 진입 시<br />월 추가 매출</span></div>}
        <div className="stat" style={defend ? { borderColor: C.blueLine, background: C.blueSoft } : {}}><b style={defend ? { color: C.blue } : {}}>+{man(defend ? s.revenue.gain : s.revenue.gainMax)}</b><span>{defend ? <>연관 키워드로 넓히면<br />월 추가 매출</> : <>1위까지 오르면<br />월 최대</>}</span></div>
        <div className="stat"><b>{eok(g6)}</b><span>6개월 누적<br />(1단계만 진행 시)</span></div></div>
      <div className="dark sec"><b style={{ fontSize: 17 }}>월 {defend ? '확장' : '추가'} 매출 흐름 · 추정</b>
        <svg width="100%" viewBox="0 0 588 196" style={{ marginTop: 14, display: 'block' }}><line x1="0" y1="160" x2="588" y2="160" stroke="#2A3550" />
          <path d="M0,158 L98,104 L196,76 L294,64 L392,58 L490,54 L588,52 L588,160 L0,160 Z" fill="rgba(61,99,255,.2)" />
          <polyline fill="none" stroke="#6C8BFF" strokeWidth="4" strokeLinecap="round" points="0,158 98,104 196,76 294,64 392,58 490,54 588,52" />
          <polyline fill="none" stroke="#5EE0A8" strokeWidth="4" strokeLinecap="round" points="0,158 98,104 196,68 294,44 392,28 490,18 588,12" />
          <text x="436" y="13" fontSize="14.5" fill="#5EE0A8" fontWeight="800" textAnchor="end">3단계까지 · 누적 {eok(g6 * 1.6)}</text><text x="586" y="80" fontSize="14.5" fill="#9DB1FF" fontWeight="800" textAnchor="end">1단계만 · 누적 {eok(g6)}</text>
          {[1, 2, 3, 4, 5, 6].map(i => <text key={i} x={i * 98 - (i === 6 ? 16 : 0)} y="184" fontSize="13.5" fill="#8A93A8" textAnchor="middle">{i}개월</text>)}</svg>
        <div style={{ fontSize: 13.5, color: '#8A93A8', marginTop: 8, lineHeight: 1.6 }}>{s.revenue.formula}. {s.revenue.basis}. 3단계 곡선은 후기·콘텐츠가 쌓여 검색량이 늘어난다는 가정입니다.</div></div>
      <div className="sec"><h3>진행 조합</h3><p style={{ fontSize: 17.5, color: C.sub, marginTop: 6 }}>1단계만 먼저 해 보시고, 결과를 본 뒤 넓히시는 것을 권해 드립니다.</p>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {([['먼저', '1단계만', P1.weapons, '10일 단위 · 매일 순위 확인 · 종료 리포트', true], ['그 다음', '1 + 2단계', [...P1.weapons, ...(P2?.weapons ?? [])], '월 리포트 · 전담 담당자', false], ['통합', '1 + 2 + 3단계', s.plan.flatMap(x => x.weapons), '주간 리포트 · 콘텐츠 제작 포함', false]] as [string, string, string[], string, boolean][]).map(([n, t, ws, d, rec]) => <div key={n} className="card" style={rec ? { border: `2.5px solid ${C.blue}`, background: C.blueSoft } : {}}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="tag" style={{ background: rec ? C.blue : C.bg, color: rec ? '#fff' : C.sub }}>{n}</span><h3>{t}</h3>{rec && <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: C.blue }}>권해 드리는 시작</span>}</div>
            <div style={{ marginTop: 10 }}>{ws.map(w => <span key={w} className="chip" style={{ fontSize: 15, padding: '5px 12px' }}>{w}</span>)}</div><div style={{ fontSize: 15.5, color: C.sub, marginTop: 8 }}>{d}</div></div>)}</div>
        <p className="cap">금액은 키워드 경쟁도와 상품을 확인한 뒤 안내드립니다. 진행 중에도 성과를 보고 채널을 줄이거나 바꿀 수 있습니다.</p></div>
      {F(9)}</div></div>; }

    // ───────── 10. 콘텐츠·FAQ·문의 (키워드 공통) ─────────
    default: return <div className="pv3">{B(10)}<div className="body">
      <div className="eyebrow">CONTENT · 콘텐츠 방향</div>
      <h2>「{kw}」에서 통하는<br />이야기 다섯</h2>
      <p className="lead">후기·콘텐츠 단계에서 내보낼 글과 영상의 방향입니다. 형식은 서로 다르게, 하려는 말은 하나로 맞춥니다.</p>
      <div className="sec" style={{ display: 'grid', gap: 10 }}>{ka.contents.slice(0, 5).map((c, i) => <div key={i} style={{ background: C.bg, borderRadius: 16, padding: '15px 18px' }}><span className="tag" style={{ background: C.violetSoft, color: C.violet }}>{c.fmt}</span><div style={{ fontSize: 19, fontWeight: 800, color: C.ink, lineHeight: 1.45, marginTop: 6 }}>{c.idea}</div>{c.why && <div style={{ fontSize: 15, color: C.mute, marginTop: 2 }}>{c.why}</div>}</div>)}</div>
      <div className="sec"><div className="eyebrow">FAQ · 자주 묻는 질문</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>{[
          ['효과는 언제부터 보이나요?', '쇼핑 상위노출은 구동 다음 날부터 순위 변동이 시작되고, 보통 3~7일 안에 1페이지 진입 여부가 보입니다. 키워드 경쟁도에 따라 차이가 있습니다.'],
          ['중간에 그만둘 수 있나요?', '10일 단위로 진행합니다. 결과를 보시고 계속할지 정하시면 됩니다. 유입이 멈추면 순위는 서서히 내려갈 수 있습니다.'],
          ['상품이나 스토어에 문제가 생기지는 않나요?', '실제 사용자의 검색 유입으로 진행합니다. 진행이 어려운 조건(가격비교 묶음 상품 등)은 접수할 때 먼저 확인해 드립니다.'],
          ['무엇을 준비하면 되나요?', '상품 URL만 있으면 됩니다. 키워드는 검색량과 경쟁도를 보고 함께 정합니다.'],
          ['비용은 어떻게 되나요?', '키워드 경쟁도와 진행할 채널에 따라 달라, 상품을 확인한 뒤 안내드립니다. 1단계만 먼저 진행하실 수 있습니다.'],
        ].map(([q, a]) => <div key={q} className="card" style={{ padding: '18px 20px' }}><div style={{ fontSize: 19, fontWeight: 800, color: C.ink, lineHeight: 1.45, display: 'flex', gap: 9 }}><span style={{ color: C.blue }}>Q</span><span>{q}</span></div><div style={{ fontSize: 17, color: C.sub, marginTop: 6, lineHeight: 1.7 }}>{a}</div></div>)}</div></div>
      <div className="sec"><div className="eyebrow">HOW TO START · 시작하는 방법</div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>{[['01', '카카오톡으로 상품 URL 보내기', '아래 오픈채팅으로 URL 하나만 보내 주시면 됩니다.'], ['02', '순위·키워드 확인 결과 받기', '연관 키워드 순위까지 확인해서 답장드립니다.'], ['03', '진행 결정', '1단계부터 10일 단위로, 결과를 보고 정하시면 됩니다.']].map(([n, t, d]) => <div key={n} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 14, alignItems: 'center', background: C.bg, borderRadius: 16, padding: '15px 18px' }}><div className="num" style={{ background: C.blue, color: '#fff', width: 52, height: 52, fontSize: 19 }}>{n}</div><div><div style={{ fontSize: 19, fontWeight: 800, color: C.ink, lineHeight: 1.4 }}>{t}</div><div style={{ fontSize: 16, color: C.sub, lineHeight: 1.55 }}>{d}</div></div></div>)}</div></div>
      <div className="sec" style={{ borderRadius: 22, color: '#fff', textAlign: 'center', padding: '36px 28px 32px', background: 'radial-gradient(520px 300px at 100% 0%,rgba(168,139,255,.8),rgba(168,139,255,0) 62%),linear-gradient(150deg,#0A1233 0%,#14277E 60%,#3A2AAE 100%)' }}>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.5, letterSpacing: '-.03em' }}>카카오톡으로 상품 URL만 보내 주세요.<br />「{kw}」 연관 키워드 순위까지<br />확인해서 답장드리겠습니다.</div>
        <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', marginTop: 20, background: '#FEE500', color: '#191600', borderRadius: 999, padding: '13px 26px', fontWeight: 800, fontSize: 19 }}><Svg n="chat" c="#191600" s={22} w={2.2} />{kakao}</div>
        <div style={{ fontSize: 15.5, color: 'rgba(255,255,255,.82)', marginTop: 12 }}>카카오톡 오픈채팅 · 편하게 문의 주시면 됩니다</div></div>
      <div className="card sec" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}><div><div style={{ fontSize: 21, fontWeight: 800, color: C.ink }}>{brand.name}</div><div style={{ fontSize: 14.5, color: C.mute }}>네이버쇼핑 상위노출 · 카페 · 인플루언서 · 쿠팡</div></div><div style={{ textAlign: 'right', fontSize: 15, color: C.sub, lineHeight: 1.6 }}>{brand.email}</div></div>
      <p className="cap">※ 매출·시장 규모는 검색량·클릭 비율·구매 전환율 가정에 따른 추정치이며, 구매자 묘사는 데이터에서 추론한 내용입니다. 특정 순위나 매출을 보장하지 않습니다.</p>
      {F(10)}</div></div>;
  }
}
