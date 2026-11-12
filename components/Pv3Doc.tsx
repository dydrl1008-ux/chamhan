// 제안서 v3 — 8장 HTML (워커 PC가 1080×1350 으로 캡처). 서버·클라이언트 공용, 외부 의존 없음 (폰트는 view 페이지의 <link>)
import { FUNNEL, LEAK_LABEL, AXIS_LABEL, ctr, man, eok, type KwData, type StoreData, type KwAi, type StoreAi, type Axes } from '@/lib/proposalV3';

export const PV3_PAGES = 8;
export const PV3_STORE_PAGES = [1, 2, 5, 7];   // 업체별로 다른 장 (표지·진단·설계·콘텐츠/시뮬레이션). 3·4·6·8 은 키워드 공통 (업체 정보 안 씀)
const C = { paper: '#F4F1EA', ink: '#0E1626', ink2: '#162238', text: '#141A26', muted: '#6B7280', line: '#E3DDD0', gold: '#8A7B62', green: '#1F6F5F', greenSoft: '#E6F4EF', mint: '#7FD1B9', orange: '#D9480F', orangeSoft: '#FFF4EC', sand: '#EEE9DF' };
export const PV3_CSS = `
.pv3{font-family:'Noto Sans KR',sans-serif;color:${C.text};-webkit-font-smoothing:antialiased;word-break:keep-all;width:1080px;height:1350px;padding:60px 72px 48px;background:${C.paper};display:flex;flex-direction:column;box-sizing:border-box;position:relative;overflow:hidden}
.pv3 *{box-sizing:border-box}.pv3.ink{background:${C.ink};color:${C.paper}}
.pv3 .serif,.pv3 h1,.pv3 h2,.pv3 .quote,.pv3 .num,.pv3 .stat b{font-family:'Noto Serif KR','Noto Sans KR',serif}
.pv3 .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:34px}
.pv3 .brand{font-size:12.5px;letter-spacing:.24em;font-weight:700;color:${C.gold};text-transform:uppercase}.pv3.ink .brand{color:#B7A98A}
.pv3 .prog{display:flex;gap:5px}.pv3 .prog i{display:block;width:26px;height:4px;border-radius:2px;background:${C.line}}.pv3.ink .prog i{background:#263551}.pv3 .prog i.on{background:${C.green}}.pv3.ink .prog i.on{background:${C.mint}}
.pv3 .kick{font-size:14px;letter-spacing:.2em;font-weight:700;color:${C.gold};text-transform:uppercase}.pv3.ink .kick{color:#B7A98A}
.pv3 h1{font-size:58px;font-weight:900;line-height:1.32;letter-spacing:-.02em;margin:20px 0 22px}
.pv3 h2{font-size:40px;font-weight:900;line-height:1.3;letter-spacing:-.02em;margin:10px 0 10px}
.pv3 .lead{font-size:20px;line-height:1.7;color:#4A5262}.pv3.ink .lead{color:#AEB6C6}
.pv3 em{font-style:normal;color:${C.green}}.pv3.ink em{color:${C.mint}}.pv3 .hot{color:${C.orange}}
.pv3 .rule{height:2px;background:${C.text};margin:24px 0 20px;opacity:.9}.pv3.ink .rule{background:${C.paper};opacity:.3}
.pv3 .box{background:#fff;border:1px solid ${C.line};border-radius:8px;padding:24px 28px}.pv3.ink .box{background:${C.ink2};border-color:#263551}
.pv3 .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pv3 .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.pv3 .stat b{display:block;font-size:40px;font-weight:900;letter-spacing:-.03em;line-height:1.1}.pv3 .stat span{font-size:15px;color:${C.muted};display:block;margin-top:6px}.pv3.ink .stat span{color:#8E99AD}
.pv3 .quote{font-size:27px;font-weight:600;line-height:1.55;letter-spacing:-.01em}
.pv3 .tag{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.12em;padding:5px 11px;border:1px solid currentColor;border-radius:999px}
.pv3 table{width:100%;border-collapse:collapse}.pv3 th{font-size:13px;letter-spacing:.08em;color:${C.gold};font-weight:700;padding:8px 10px;border-bottom:2px solid ${C.text};text-align:center}
.pv3 td{font-size:17.5px;padding:9px 10px;border-bottom:1px solid ${C.line};text-align:center;font-variant-numeric:tabular-nums}.pv3 td.l{text-align:left;max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv3 .chip{display:inline-block;background:#fff;border:1px solid ${C.line};border-radius:999px;padding:6px 12px;font-size:15px;font-weight:700;margin:3px 6px 3px 0;line-height:1.3}
.pv3 .chip.pf{border-color:${C.green};color:${C.green}}.pv3 .chip.br{border-color:${C.orange};color:${C.orange}}.pv3 .chip.now{background:${C.green};color:#fff;border-color:${C.green}}.pv3 .chip.off{color:#9AA3B2;border-style:dashed;text-decoration:line-through;background:transparent}
.pv3 .foot{margin-top:auto;padding-top:20px;display:flex;justify-content:space-between;font-size:13px;color:${C.gold}}.pv3.ink .foot{color:#6F7C94}
.pv3 .ph1{display:grid;grid-template-columns:110px 1fr;gap:16px;align-items:start;padding:15px 0;border-top:1px solid ${C.line}}
.pv3 .ph1 .t{font-size:14px;letter-spacing:.1em;color:${C.gold};font-weight:700;padding-top:5px}.pv3 .ph1 b{font-size:20px;display:block;line-height:1.45}.pv3 .ph1 p{margin:4px 0 0;font-size:16px;line-height:1.6;color:#4A5262}
.pv3 .ci{display:grid;grid-template-columns:72px 1fr;gap:12px;padding:11px 0;border-bottom:1px solid ${C.line};align-items:start}
.pv3 .ci span{font-size:12.5px;font-weight:800;letter-spacing:.06em;color:#fff;background:${C.text};border-radius:4px;padding:5px 6px;text-align:center;margin-top:2px}.pv3 .ci b{font-size:17px;line-height:1.5;font-weight:600}
.pv3 .funnel{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.pv3 .funnel div{padding:13px 6px;text-align:center;border:1px solid ${C.line};background:#fff;border-radius:6px;font-size:16px;font-weight:700;color:#9AA3B2}
.pv3 .funnel div.on{background:${C.orange};color:#fff;border-color:${C.orange}}.pv3 .funnel div.ok{color:${C.green};border-color:${C.green};background:${C.greenSoft}}
.pv3 .axes{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.pv3 .axes .ax{background:#fff;border:1px solid ${C.line};border-radius:6px;padding:10px 12px}.pv3 .axes .ax .n{font-size:13px;color:${C.muted};font-weight:700;display:flex;justify-content:space-between}
.pv3 .axes .bar{height:8px;border-radius:4px;background:${C.sand};margin-top:7px;position:relative}.pv3 .axes .bar i{position:absolute;left:0;top:0;height:100%;border-radius:4px;background:${C.green}}.pv3 .axes .bar u{position:absolute;top:-3px;width:2px;height:14px;background:${C.text}}
.pv3 .road{position:relative;padding-left:26px}.pv3 .road:before{content:'';position:absolute;left:9px;top:12px;bottom:12px;width:2px;background:${C.line}}
.pv3 .road .st{position:relative;display:grid;grid-template-columns:150px 1fr;gap:16px;padding:12px 0 14px}.pv3 .road .st:before{content:'';position:absolute;left:-22px;top:19px;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid ${C.green}}
.pv3 .road .st.lead:before{background:${C.green}}.pv3 .road .st.br:before{border-color:${C.orange}}
.pv3 .road .w{font-size:13px;letter-spacing:.08em;color:${C.gold};font-weight:700}.pv3 .road .h{font-size:21px;font-weight:800;margin:2px 0 6px}.pv3 .road p{margin:6px 0 0;font-size:16px;line-height:1.6;color:#4A5262}
.pv3 .faq b{font-size:18px;display:block;margin-bottom:2px}.pv3 .faq span{font-size:16px;color:#4A5262;line-height:1.55}
.pv3 .pimg{width:220px;height:220px;border-radius:12px;object-fit:cover;background:#fff;border:1px solid #263551}
`;

export type Pv3Props = { k: KwData; ka: KwAi; s: StoreData; sa: StoreAi; brand: { name: string; owner: string; phone: string; email: string; kakao: string }; page: number };
const won = (n: number) => n.toLocaleString('ko-KR');
/** 상위 10 상품명에서 2번 이상 나온 단어 (키워드 자체·숫자·단위 제외) */
function topWords(k: KwData): [string, number][] {
  const kw = k.keyword.replace(/\s+/g, '').toLowerCase(); const cnt = new Map<string, number>();
  k.top10.forEach(t => { const seen = new Set<string>(); t.title.replace(/[\[\]()\/,+·]/g, ' ').split(/\s+/).map(w => w.trim()).filter(w => w.length >= 2 && w.length <= 8 && !/^\d|^[a-z0-9]+$/i.test(w) && !kw.includes(w.toLowerCase()) && !w.toLowerCase().includes(kw)).forEach(w => { if (seen.has(w)) return; seen.add(w); cnt.set(w, (cnt.get(w) ?? 0) + 1); }); });
  return [...cnt.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 14);
}
const Top = ({ n, dark }: { n: number; dark?: boolean }) => <div className="top"><div className="brand">참한기획 · Advertising Proposal</div><div className="prog">{Array.from({ length: PV3_PAGES }, (_, i) => <i key={i} className={i + 1 === n ? 'on' : ''} />)}</div></div>;
const Foot = ({ k, n }: { k: KwData; n: number }) => <div className="foot"><span>「{k.keyword}」 광고 설계 제안 · {k.date} · 추정치 포함</span><span>{n} / {PV3_PAGES}</span></div>;
const Srch = ({ k, s, after }: { k: KwData; s: StoreData; after?: boolean }) => <div style={{ background: '#fff', border: `1px solid ${after ? C.green : C.line}`, borderRadius: 8, padding: '12px 14px' }}>
  <div style={{ fontSize: 13, color: after ? C.green : C.orange, fontWeight: 800, marginBottom: 6, letterSpacing: '.08em' }}>{after ? `목표 · ${s.target}위권` : '지금'}</div>
  <div style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '7px 12px', fontSize: 15, marginBottom: 6, color: C.muted }}>🔍 {k.keyword}</div>
  {[1, 2, 3, 4].map(i => after && i === Math.min(4, s.target) ? <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 6px', fontSize: 14.5, background: C.greenSoft, borderRadius: 6, color: C.green, fontWeight: 800 }}>{s.target} &nbsp;{s.store} ↗</div>
    : <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 6px', fontSize: 14.5, color: '#9AA3B2', borderBottom: `1px solid ${C.sand}` }}>{i}<div style={{ flex: 1, height: 9, background: C.sand, borderRadius: 5 }} /></div>)}
  {!after && <div style={{ padding: '6px 6px', fontSize: 14.5, color: C.orange, fontWeight: 800, border: '1px dashed #F3B79C', borderRadius: 6, marginTop: 6 }}>{s.rank ? `${s.rank}위` : '1페이지 밖'} &nbsp;{s.store}</div>}
</div>;
const AxesRow = ({ a, t }: { a: Axes; t: Axes }) => <div className="axes">{(Object.keys(AXIS_LABEL) as (keyof Axes)[]).map(x => <div key={x} className="ax"><div className="n"><span>{AXIS_LABEL[x]}</span><span style={{ color: a[x] >= t[x] ? C.green : C.orange }}>{a[x]}</span></div><div className="bar"><i style={{ width: `${Math.min(100, a[x] / 5 * 100)}%`, background: a[x] >= t[x] ? C.green : C.orange }} /><u style={{ left: `${Math.min(100, t[x] / 5 * 100)}%` }} title="상위 10 평균" /></div></div>)}</div>;

export default function Pv3Doc(p: Pv3Props) {
  const { k, ka, s, sa, brand, page } = p; const kw = k.keyword; const g = k.volume.group; const defend = s.leak === 'defend';
  const ratio = (x: number) => Math.max(8, Math.min(100, Math.round(100 * x)));
  switch (page) {
    case 1: return <div className="pv3 ink"><Top n={1} dark />
      <div className="kick">Advertising Proposal · {s.store}</div>
      <div style={{ display: 'grid', gridTemplateColumns: s.image ? '1fr 220px' : '1fr', gap: 28, alignItems: 'start' }}>
        <h1>{sa.headline}</h1>
        {s.image && <div style={{ paddingTop: 24 }}><img className="pimg" src={s.image} alt="" /><div style={{ fontSize: 12.5, color: '#8E99AD', marginTop: 8, lineHeight: 1.5, maxWidth: 200, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.title}</div></div>}
      </div>
      <div className="lead">「{kw}」 상위 {k.n}개 상품 실측 데이터{g ? `와 월 검색량 ${won(g)}회` : ''}를 기준으로, {s.store} 상품 하나만 놓고 쓴 광고 설계.</div>
      <div className="rule" />
      <div className="grid3">
        <div className="stat"><b>{s.rank ? `${s.rank}위` : '미진입'}</b><span>현재 순위 · {s.band}{s.ad ? ' · 광고 노출 중' : ''}</span></div>
        {defend ? <div className="stat"><b style={{ color: C.mint }}>{man(s.revenue.keep)}</b><span>지금 지키고 있는 월 매출 추정</span></div> : <div className="stat"><b className="hot">{LEAK_LABEL[s.leak]}</b><span>새는 구간 · 인지→탐색→비교→구매→재구매</span></div>}
        <div className="stat"><b style={{ color: C.mint }}>+{man(s.revenue.gain)}</b><span>{defend ? '연관 키워드 확장 시 월 추가 추정' : '설계대로 진행 시 월 추가 매출 추정'}</span></div></div>
      <div className="box" style={{ marginTop: 32 }}><div className="kick" style={{ marginBottom: 10 }}>이 제안을 관통하는 한 줄</div><div className="quote">{sa.thesis}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
        {[['진단', ka.narrative.diagnosis], ['인사이트', ka.narrative.insight], ['전략', ka.narrative.strategy]].map(([t, v], i) => <div key={i} style={{ background: C.ink2, border: '1px solid #263551', borderRadius: 8, padding: '16px 18px' }}><div className="kick" style={{ fontSize: 12 }}>{['01', '02', '03'][i]} · {t}</div><div style={{ fontSize: 17.5, lineHeight: 1.55, marginTop: 8, fontWeight: 600 }}>{v}</div></div>)}</div>
      <div style={{ marginTop: 'auto', paddingTop: 24, fontSize: 15.5, color: '#8E99AD', lineHeight: 1.9 }}>① 진단 — 강점과 그러나 &nbsp;② 사는 사람 &nbsp;③ 시장 세 숫자 &nbsp;④ 광고 설계 3단계 &nbsp;⑤ 순위를 가르는 것 &nbsp;⑥ 콘텐츠·시뮬레이션 &nbsp;⑦ 진행 방식</div>
      <Foot k={k} n={1} /></div>;

    case 2: return <div className="pv3"><Top n={2} />
      <div className="kick">01 · Diagnosis</div>
      <h2>{defend ? <>상단 자리는 확보한 상태.<br />남은 건 <em>지키면서 넓히는 일</em></> : <>{sa.have.length ? '가진 건 분명한 상품.' : '수요는 있는 키워드.'}<br />그러나 <span className="hot">{LEAK_LABEL[s.leak]} 구간에서 새는 구조</span></>}</h2>
      <div className="lead">검색에서 구매까지 다섯 단계 중 {s.store}가 {defend ? '서 있는' : '멈추는'} 자리.</div>
      <div className="funnel" style={{ marginTop: 14 }}>{FUNNEL.map((f, i) => <div key={f} className={i === s.stage ? 'on' : i < s.stage ? 'ok' : ''}>{f}{i === s.stage ? (defend ? ' ●' : ' ✕') : i < s.stage ? ' ✓' : ''}</div>)}</div>
      {s.axes && <div style={{ marginTop: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.muted, marginBottom: 6 }}><span><b style={{ color: C.text }}>{s.store}</b> 지수 (5점 만점) · 검정 선 = 상위 10 평균</span><span>{s.weakAxis && `가장 비는 축 · ${AXIS_LABEL[s.weakAxis]}`}</span></div><AxesRow a={s.axes} t={k.axes10} /></div>}
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="box" style={{ padding: '18px 22px' }}><div className="kick" style={{ marginBottom: 8 }}>가진 것</div>{(sa.have.length ? sa.have : ['—']).slice(0, 3).map((h, i, a) => <div key={i} className="ci" style={i === a.length - 1 ? { border: 0 } : {}}><span>{['자산', '포지션', '수요'][i] ?? '강점'}</span><b>{h}</b></div>)}</div>
        <div className="box" style={{ padding: '18px 22px', borderColor: '#F3B79C', background: C.orangeSoft }}><div className="kick" style={{ marginBottom: 8, color: C.orange }}>{defend ? '비어 있는 곳' : '새는 곳'}</div>{(sa.leak.length ? sa.leak : s.why).slice(0, 3).map((h, i, a) => <div key={i} className="ci" style={i === a.length - 1 ? { border: 0 } : {}}><span style={{ background: C.orange }}>{['구간', '원인', '결과'][i] ?? '문제'}</span><b>{h}</b></div>)}</div></div>
      <div className="grid2" style={{ marginTop: 14 }}><Srch k={k} s={s} /><Srch k={k} s={s} after /></div>
      <div className="box" style={{ marginTop: 14, background: C.text, color: C.paper, border: 0, padding: '18px 24px' }}><div className="quote" style={{ fontSize: 23 }}>진단 — {ka.narrative.diagnosis || `${LEAK_LABEL[s.leak]}부터 막아야 하는 순서`}</div></div>
      <Foot k={k} n={2} /></div>;

    case 3: return <div className="pv3"><Top n={3} />
      <div className="kick">02 · Who Is Searching</div>
      <h2>「{kw}」를 검색하는 사람</h2>
      <div className="lead">상품 스펙이 아니라 사람의 상황에서 출발한 설계. 검색량·가격대·리뷰 패턴에서 추론한 구매자의 모습.</div>
      <div style={{ marginTop: 22 }}>
        {[['누구', ka.buyer.who], ['속마음', ka.buyer.truth], ['결정 순간', ka.buyer.moment]].map(([t, v], i) => <div key={i} className="ph1" style={i === 2 ? { borderBottom: `1px solid ${C.line}` } : {}}><div className="t">{t}</div><div><b style={{ fontSize: 23 }}>{v}</b></div></div>)}</div>
      <div className="grid2" style={{ marginTop: 26 }}>
        <div className="box" style={{ borderColor: '#F3B79C' }}><div className="kick" style={{ color: C.orange }}>이 시장의 약점</div><div className="quote" style={{ fontSize: 22, marginTop: 10 }}>{ka.reframe.weak}</div></div>
        <div className="box" style={{ borderColor: C.green, background: C.greenSoft }}><div className="kick" style={{ color: C.green }}>뒤집기</div><div className="quote" style={{ fontSize: 22, marginTop: 10 }}>{ka.reframe.flip}</div></div></div>
      <div className="box" style={{ marginTop: 20 }}><div className="kick" style={{ marginBottom: 12 }}>이어지는 이야기</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr 28px 1fr', gap: 8, alignItems: 'start', fontSize: 17, lineHeight: 1.55 }}>
          {[['진단', ka.narrative.diagnosis], ['인사이트', ka.narrative.insight], ['전략', ka.narrative.strategy]].flatMap(([t, v], i) => [<div key={t}><b style={{ color: C.gold, fontSize: 12.5, letterSpacing: '.1em', display: 'block', marginBottom: 4 }}>{t}</b>{v}</div>, ...(i < 2 ? [<div key={t + '>'} style={{ color: C.gold, fontSize: 22, paddingTop: 18 }}>→</div>] : [])])}</div></div>
      {(() => { const words = topWords(k); return words.length ? <div className="box" style={{ marginTop: 16, padding: '16px 22px' }}><div className="kick" style={{ marginBottom: 8 }}>상위 10개 상품명이 이 사람에게 건네는 말</div><div>{words.map(([w, n]) => <span key={w} className="chip" style={{ fontSize: 15 + Math.min(6, n) }}>{w} <span style={{ color: C.muted, fontWeight: 500, fontSize: 12 }}>{n}</span></span>)}</div><div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>상위 10개 상품명에 2번 이상 쓰인 단어 — 검색하는 사람이 반응하는 말의 목록</div></div> : null; })()}
      <Foot k={k} n={3} /></div>;

    case 4: { const cm = k.contentMarket; const hasCm = cm.blog != null || cm.cafe != null || cm.youtube != null; const base = g * k.revenue.conv * k.revenue.aov; return <div className="pv3"><Top n={4} />
      <div className="kick">03 · Three Markets</div>
      <h2>검색 · 콘텐츠 · 광고, 세 시장</h2>
      <div className="lead">「{kw}」를 둘러싼 수요가 어디에 얼마나 있는지. 설계는 이 세 숫자에서 출발.</div>
      <div className="grid3" style={{ marginTop: 18 }}>
        <div className="box stat"><div className="kick">검색 시장</div><b style={{ marginTop: 10 }}>{g ? won(g) : '—'}</b><span>월 검색 · 메인 {won(k.volume.main)} + 연관 {k.volume.related.length}개</span></div>
        <div className="box stat"><div className="kick">콘텐츠 시장</div><b style={{ marginTop: 10 }}>{hasCm ? `${Math.round(((cm.blog ?? 0) + (cm.cafe ?? 0)) / 10000)}만` : '—'}</b><span>{hasCm ? `블로그·카페 글 수${cm.youtube != null ? ` · 유튜브 ${won(cm.youtube)}` : ''}` : '미측정'}</span></div>
        <div className="box stat"><div className="kick">광고 시장</div><b style={{ marginTop: 10 }}>{k.volume.comp === '높음' ? '치열' : k.volume.comp === '중간' ? '보통' : k.volume.comp === '낮음' ? '여유' : '—'}</b><span>검색광고 경쟁 · 1페이지 광고 {k.stats.adCount10}개 · 신규 등록 {k.stats.newRate}%</span></div></div>
      <div className="box" style={{ marginTop: 16, background: C.ink, color: C.paper, border: 0 }}>
        <div className="lead" style={{ fontSize: 17, marginBottom: 12, color: '#AEB6C6' }}>검색 시장에서 매달 오가는 돈 · 추정</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {[['1페이지 전체 (1~40위)', k.revenue.market, 100, C.green], ['상위 10개가 가져가는 몫', k.revenue.loss, ratio(k.revenue.loss / Math.max(1, k.revenue.market)), '#2E8B74'], ['3위 한 자리의 몫', base * ctr(3), ratio(ctr(3) / 0.634), C.mint], ['1위 한 자리의 몫', base * ctr(1), ratio(ctr(1) / 0.634), '#B5F0DA']].map(([l, v, w, c], i) => <div key={i}><div style={{ fontSize: 14.5, color: '#8E99AD', marginBottom: 4 }}>{l as string}</div><div style={{ height: 38, borderRadius: 8, background: c as string, width: `${w}%`, display: 'flex', alignItems: 'center', paddingLeft: 14, fontWeight: 800, fontSize: 19, color: i >= 2 ? '#052E16' : '#fff', whiteSpace: 'nowrap' }}>{eok(v as number)}</div></div>)}</div></div>
      <div className="box" style={{ marginTop: 14, padding: '16px 22px' }}><div style={{ fontSize: 16, lineHeight: 1.7, color: '#334155' }}><b>근거</b> — 월 검색 {won(g)}회 × 순위별 클릭 점유(1위 12% · 2~3위 7% · 4~5위 4% · 6~10위 2.5% · 11~40위 0.6%) × 전환 {(k.revenue.conv * 100).toFixed(1)}% × 객단가 {won(k.revenue.aov)}원(상위 10 평균) · 추정{k.volume.related.length ? ` · 연관: ${k.volume.related.map(r => `${r.keyword} ${won(r.total)}`).join(' · ')}` : ''}</div></div>
      <Foot k={k} n={4} /></div>; }

    case 5: return <div className="pv3"><Top n={5} />
      <div className="kick">04 · Advertising Design</div>
      <h2>{defend ? '지키는 순서, 넓히는 순서' : '새는 지점 하나, 그걸 막는 순서 셋'}</h2>
      <div className="lead">무기를 전부 미는 제안이 아니라, {s.store}의 {defend ? '자리' : '병목'} 순서대로 세운 3단계. 리딩은 <b>{s.lead}</b>.</div>
      <div className="box" style={{ marginTop: 14, borderLeft: `8px solid ${C.orange}`, padding: '16px 22px' }}><div className="kick" style={{ color: C.orange }}>{defend ? '지금 자리' : '가장 새는 지점'}</div><div className="quote" style={{ fontSize: 21, marginTop: 4 }}>{s.why[0]}</div></div>
      <div className="road" style={{ marginTop: 14 }}>
        {s.plan.map((pl, i) => <div key={pl.phase} className={`st ${i === 0 ? 'lead' : ''} ${i > 0 ? 'br' : ''}`}><div><div className="w">{pl.phase}단계 · {pl.when}</div><div className="h">{pl.title}{i === 0 ? ' · 리딩' : ''}</div></div><div><div>{pl.weapons.map(w => <span key={w} className={`chip ${w === s.lead ? 'now' : i === 0 ? 'pf' : 'br'}`}>{w}</span>)}</div><p>{ka.stages[i] ?? ''}</p></div></div>)}</div>
      <div className="box" style={{ marginTop: 10, padding: '14px 22px' }}><div className="kick" style={{ marginBottom: 6 }}>이번엔 안 쓰는 것</div>{s.skip.map((x, i) => <div key={i} style={{ fontSize: 15.5, lineHeight: 1.6, color: '#4A5262', display: 'flex', gap: 8, alignItems: 'baseline' }}><span className="chip off">{x.weapon}</span><span>{ka.skipWhy?.[i] || x.why}</span></div>)}</div>
      <Foot k={k} n={5} /></div>;

    case 6: { const top = k.top10.slice(0, 8); return <div className="pv3"><Top n={6} />
      <div className="kick">05 · What Moves Rank</div>
      <h2>순위를 가르는 건 리뷰 수가 아니라 <em>클릭지수</em></h2>
      <div className="lead">상위 10개 실측 — 리뷰가 많은 순서가 아닌 순위. 차이를 만드는 건 클릭지수 한 칸.</div>
      <div className="box" style={{ marginTop: 16, padding: '12px 18px' }}><table><thead><tr><th>순위</th><th style={{ textAlign: 'left' }}>상품</th><th>리뷰</th><th>가격</th><th>클릭지수</th></tr></thead><tbody>
        {top.map(t => <tr key={t.rank}><td><b>{t.rank}</b>{t.ad && <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>AD</span>}</td><td className="l">{t.title}</td><td>{won(t.reviews)}</td><td>{won(t.price)}</td><td style={{ color: C.green, fontWeight: 800 }}>{t.click.toFixed(1)}</td></tr>)}
        </tbody></table><div style={{ fontSize: 13, color: C.gold, marginTop: 8 }}>클릭지수 5점 만점 · 상위 {k.n}개 지수 실측 · {k.date}</div></div>
      <div className="grid3" style={{ marginTop: 14 }}>
        <div className="box stat" style={{ textAlign: 'center' }}><b style={{ color: C.green }}>{k.stats.avgClick10}</b><span>상위 10 클릭지수 평균</span></div>
        <div className="box stat" style={{ textAlign: 'center' }}><b>{k.stats.avgClickMid || '—'}</b><span>11~40위 평균</span></div>
        <div className="box stat" style={{ textAlign: 'center' }}><b className="hot">{k.stats.avgClickMid ? Math.round((k.stats.avgClick10 - k.stats.avgClickMid) * 10) / 10 : '—'}</b><span>이 차이가 순위를 가름</span></div></div>
      <div className="box" style={{ marginTop: 14, background: C.text, color: C.paper, border: 0 }}><div className="quote" style={{ fontSize: 24 }}>리뷰를 만드는 작업이 아니라,<br /><span style={{ color: C.mint }}>쌓인 리뷰가 클릭되게 만드는 작업</span></div><div className="lead" style={{ marginTop: 10, fontSize: 16.5, color: '#AEB6C6' }}>실사용자가 「{kw}」 검색 → 상품 클릭 유입을 매일 일정량. 매일 순위 확인, 변동은 당일 조정. 자리가 잡히면 유입량을 줄여도 유지되는 구조.</div></div>
      <Foot k={k} n={6} /></div>; }

    case 7: { const g6 = s.revenue.gain * 6; return <div className="pv3"><Top n={7} />
      <div className="kick">06 · Content & Projection</div>
      <h2>{s.store}만 할 수 있는 이야기 다섯</h2>
      <div className="lead">2·3단계에서 내보낼 콘텐츠. 형식은 서로 다르게, 앵글은 한 축으로.</div>
      <div style={{ marginTop: 10 }}>{ka.contents.slice(0, 5).map((c, i, a) => <div key={i} className="ph1" style={{ padding: '11px 0', ...(i === a.length - 1 ? { borderBottom: `1px solid ${C.line}` } : {}) }}><div className="t">{c.fmt}</div><div><b style={{ fontSize: 18.5 }}>{c.idea}</b></div></div>)}</div>
      <div className="box" style={{ marginTop: 14, background: '#FBFAF7', padding: '14px 20px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div style={{ fontSize: 16, fontWeight: 800 }}>월 {defend ? '확장' : '추가'} 매출 시뮬레이션 · 추정</div><div style={{ fontSize: 13, color: C.gold }}>{s.revenue.formula}</div></div>
        <svg width="930" height="170" viewBox="0 0 930 170" style={{ marginTop: 6 }}><line x1="0" y1="150" x2="930" y2="150" stroke={C.line} /><polyline fill="none" stroke={C.green} strokeWidth="5" strokeLinecap="round" points="0,148 150,96 300,70 450,60 600,54 750,50 930,48" /><polyline fill="none" stroke={C.orange} strokeWidth="5" strokeLinecap="round" points="0,148 150,96 300,64 450,40 600,26 750,16 930,10" /><text x="700" y="10" fontSize="14" fill={C.orange} fontWeight="800">3단계 통합 · 누적 {eok(g6 * 1.6)}</text><text x="760" y="44" fontSize="14" fill={C.green} fontWeight="800">1단계만 · 누적 {eok(g6)}</text>{[0, 1, 2, 3, 4, 5].map(i => <text key={i} x={i * 150} y="166" fontSize="12" fill={C.gold}>{i + 1}개월</text>)}</svg></div>
      <div className="grid3" style={{ marginTop: 12 }}>
        {defend ? <div className="box stat" style={{ textAlign: 'center', padding: 14 }}><b style={{ fontSize: 28 }}>{man(s.revenue.keep)}</b><span>지금 지키는 월 매출</span></div> : <div className="box stat" style={{ textAlign: 'center', padding: 14 }}><b style={{ fontSize: 28 }}>+{man(s.revenue.gain)}</b><span>{s.target}위 진입 시 월</span></div>}
        <div className="box stat" style={{ textAlign: 'center', padding: 14 }}><b style={{ fontSize: 28 }}>+{man(defend ? s.revenue.gain : s.revenue.gainMax)}</b><span>{defend ? '연관 키워드 확장 시 월' : '최대 (1위 기준) 월'}</span></div>
        <div className="box stat" style={{ textAlign: 'center', padding: 14 }}><b style={{ fontSize: 28 }}>{eok((defend ? s.revenue.gain : s.revenue.gainMax) * 6)}</b><span>6개월 누적</span></div></div>
      <Foot k={k} n={7} /></div>; }

    default: return <div className="pv3"><Top n={8} />
      <div className="kick">07 · How It Works</div>
      <h2>진행 방식 · 조합</h2>
      <div className="grid3" style={{ marginTop: 12 }}>
        <div className="box"><div className="kick">Basic</div><div className="serif" style={{ fontSize: 23, fontWeight: 900, margin: '6px 0 6px' }}>1단계</div><p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#4A5262' }}>리딩 무기 중심<br />10일 단위 · 매일 확인 · 종료 리포트</p></div>
        <div className="box" style={{ border: `2px solid ${C.green}`, background: C.greenSoft }}><div className="kick" style={{ color: C.green }}>Growth · 추천</div><div className="serif" style={{ fontSize: 23, fontWeight: 900, margin: '6px 0 6px' }}>1 + 2단계</div><p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#1F4A40' }}>노출 + 검색 밖 수요<br />월 리포트 · 전담 담당</p></div>
        <div className="box"><div className="kick">Integrated</div><div className="serif" style={{ fontSize: 23, fontWeight: 900, margin: '6px 0 6px' }}>3단계 통합</div><p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: '#4A5262' }}>전 단계 + 콘텐츠 5종 제작<br />주간 리포트</p></div></div>
      <div className="box faq" style={{ marginTop: 14, display: 'grid', gap: 11 }}>
        <div><b>효과는 언제부터</b><span>구동 다음 날부터 변동 시작. 보통 3~7일 안에 1페이지 진입 여부 확인. 경쟁도에 따른 차이.</span></div>
        <div><b>중간에 멈추면</b><span>10일 단위 진행. 결과 보고 연장 결정.</span></div>
        <div><b>준비할 것</b><span>상품 URL과 메인 키워드 1개. 키워드는 검색량·경쟁도 보고 함께 결정.</span></div>
        <div><b>리포트</b><span>매일 순위 확인, 변동은 리포트로 공유, 요청은 당일 반영.</span></div></div>
      <div className="box" style={{ marginTop: 16, background: C.ink, color: C.paper, border: 0 }}>
        <div className="quote" style={{ fontSize: 24 }}>카톡 주시면 「{kw}」 연관 키워드 순위까지 확인해 답장</div>
        <div style={{ marginTop: 10, fontSize: 17, color: '#AEB6C6', lineHeight: 1.7 }}>카카오톡 오픈채팅 · {brand.kakao.replace(/^https?:\/\//, '')}<br />상품 URL만 보내셔도 됩니다.</div></div>
      <div className="box" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px' }}><div><div className="serif" style={{ fontSize: 21, fontWeight: 900 }}>{brand.name}</div><div style={{ fontSize: 15, color: C.muted }}>네이버쇼핑 상위노출 · 카페 배포 · 인플루언서 · 쿠팡</div></div><div style={{ textAlign: 'right', fontSize: 15, color: '#4A5262', lineHeight: 1.6 }}>담당 {brand.owner}<br />{brand.phone}<br />{brand.email}</div></div>
      <div style={{ fontSize: 12.5, color: C.gold, marginTop: 10, lineHeight: 1.6 }}>※ 매출·시장 규모는 검색량·클릭 점유율·전환율 가정 기반 추정치. 구매자 묘사는 데이터에서 추론한 가설. 특정 순위 보장 없음. 금액은 키워드 경쟁도 확인 후 견적.</div>
      <Foot k={k} n={8} /></div>;
  }
}
