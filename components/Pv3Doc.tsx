// 제안서 v3 — 8장 HTML (워커 PC가 1080×1350 으로 캡처). 서버·클라이언트 공용, 외부 의존 없음
import { FUNNEL, LEAK_LABEL, ctr, man, eok, type KwData, type StoreData, type KwAi, type StoreAi } from '@/lib/proposalV3';

export const PV3_PAGES = 8;
export const PV3_STORE_PAGES = [1, 2, 5, 7];   // 업체별로 다른 장 (표지·진단·설계·시뮬레이션). 3·4·6·8 은 키워드 공통 (업체 정보 안 씀)
export const PV3_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@600;900&display=swap');
.pv3{font-family:'Noto Sans KR',sans-serif;color:#141A26;-webkit-font-smoothing:antialiased;word-break:keep-all;width:1080px;min-height:1350px;padding:72px 72px 56px;background:#F4F1EA;display:flex;flex-direction:column;box-sizing:border-box;position:relative}
.pv3 *{box-sizing:border-box}.pv3.ink{background:#0E1626;color:#F4F1EA}
.pv3 .serif,.pv3 h1,.pv3 h2,.pv3 .quote,.pv3 .num,.pv3 .stat b{font-family:'Noto Serif KR',serif}
.pv3 .kick{font-size:15px;letter-spacing:.22em;font-weight:700;color:#8A7B62;text-transform:uppercase}.pv3.ink .kick{color:#B7A98A}
.pv3 h1{font-size:58px;font-weight:900;line-height:1.3;letter-spacing:-.02em;margin:22px 0 18px}
.pv3 h2{font-size:42px;font-weight:900;line-height:1.3;letter-spacing:-.02em;margin:12px 0 10px}
.pv3 .lead{font-size:21px;line-height:1.7;color:#4A5262}.pv3.ink .lead{color:#AEB6C6}
.pv3 em{font-style:normal;color:#1F6F5F}.pv3.ink em{color:#7FD1B9}.pv3 .hot{color:#D9480F}
.pv3 .rule{height:2px;background:#141A26;margin:26px 0 22px;opacity:.9}.pv3.ink .rule{background:#F4F1EA;opacity:.35}
.pv3 .box{background:#fff;border:1px solid #E3DDD0;border-radius:6px;padding:26px 30px}.pv3.ink .box{background:#162238;border-color:#263551}
.pv3 .grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pv3 .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.pv3 .stat b{display:block;font-size:42px;font-weight:900;letter-spacing:-.03em}.pv3 .stat span{font-size:16px;color:#6B7280}.pv3.ink .stat span{color:#8E99AD}
.pv3 .quote{font-size:28px;font-weight:600;line-height:1.55;letter-spacing:-.01em}
.pv3 .tag{display:inline-block;font-size:14px;font-weight:700;letter-spacing:.12em;padding:6px 12px;border:1px solid currentColor;border-radius:999px}
.pv3 .step{display:grid;grid-template-columns:64px 1fr;gap:18px;align-items:start}.pv3 .step i{font-family:'Noto Serif KR',serif;font-style:normal;font-weight:900;font-size:34px;color:#1F6F5F;line-height:1}
.pv3 .step b{font-size:22px;display:block;margin-bottom:4px}.pv3 .step p{margin:0;font-size:17.5px;line-height:1.6;color:#4A5262}
.pv3 table{width:100%;border-collapse:collapse}.pv3 th{font-size:14px;letter-spacing:.08em;color:#8A7B62;font-weight:700;padding:8px 10px;border-bottom:2px solid #141A26;text-align:center}
.pv3 td{font-size:18px;padding:10px;border-bottom:1px solid #E3DDD0;text-align:center;font-variant-numeric:tabular-nums}.pv3 td.l{text-align:left;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv3 tr.me td{background:#FFF4EC;font-weight:800}
.pv3 .chip{display:inline-block;background:#fff;border:1px solid #E3DDD0;border-radius:999px;padding:7px 13px;font-size:15.5px;font-weight:700;margin:4px 6px 4px 0}
.pv3 .chip.pf{border-color:#1F6F5F;color:#1F6F5F}.pv3 .chip.br{border-color:#D9480F;color:#D9480F}.pv3 .chip.now{background:#1F6F5F;color:#fff;border-color:#1F6F5F}.pv3 .chip.off{color:#9AA3B2;border-style:dashed;text-decoration:line-through}
.pv3 .foot{margin-top:auto;padding-top:28px;display:flex;justify-content:space-between;font-size:14px;color:#8A7B62}.pv3.ink .foot{color:#6F7C94}
.pv3 .ph1{display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:start;padding:16px 0;border-top:1px solid #E3DDD0}
.pv3 .ph1 .t{font-size:15px;letter-spacing:.1em;color:#8A7B62;font-weight:700;padding-top:6px}.pv3 .ph1 b{font-size:21px;display:block;margin-bottom:6px}.pv3 .ph1 p{margin:0;font-size:17px;line-height:1.6;color:#4A5262}
.pv3 .ci{display:grid;grid-template-columns:150px 1fr;gap:14px;padding:13px 0;border-bottom:1px solid #E3DDD0;align-items:start}
.pv3 .ci span{font-size:14px;font-weight:800;letter-spacing:.06em;color:#fff;background:#141A26;border-radius:4px;padding:6px 8px;text-align:center}.pv3 .ci b{font-size:18.5px;line-height:1.5}
.pv3 .funnel{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.pv3 .funnel div{padding:16px 8px;text-align:center;border:1px solid #E3DDD0;background:#fff;border-radius:6px;font-size:17px;font-weight:700;color:#9AA3B2}
.pv3 .funnel div.on{background:#D9480F;color:#fff;border-color:#D9480F}.pv3 .funnel div.ok{color:#1F6F5F;border-color:#1F6F5F}
.pv3 .faq b{font-size:19px;display:block;margin-bottom:2px}.pv3 .faq span{font-size:16.5px;color:#4A5262;line-height:1.55}
`;

export type Pv3Props = { k: KwData; ka: KwAi; s: StoreData; sa: StoreAi; brand: { name: string; owner: string; phone: string; email: string; kakao: string }; page: number };
const Foot = ({ k, n }: { k: KwData; s?: StoreData; n: number }) => <div className="foot"><span>참한기획 · 「{k.keyword}」 광고 설계 제안 · {k.date}</span><span>{n} / {PV3_PAGES}</span></div>;
const Srch = ({ k, s, after }: { k: KwData; s: StoreData; after?: boolean }) => <div style={{ background: '#fff', border: `1px solid ${after ? '#1F6F5F' : '#E3DDD0'}`, borderRadius: 10, padding: '16px 18px' }}>
  <div style={{ fontSize: 14, color: after ? '#1F6F5F' : '#D9480F', fontWeight: 800, marginBottom: 8, letterSpacing: '.08em' }}>{after ? '목표' : '지금'}</div>
  <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: '10px 14px', fontSize: 17, marginBottom: 10, color: '#6B7280' }}>🔍 {k.keyword}</div>
  {[1, 2, 3, 4, 5].map(i => after && i === s.target ? <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 6px', fontSize: 16, background: '#E6F4EF', borderRadius: 8, color: '#1F6F5F', fontWeight: 800 }}>{i} &nbsp;{s.store} ↗</div>
    : <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 6px', fontSize: 16, color: '#9AA3B2', borderBottom: '1px solid #EEE9DF' }}>{i}<div style={{ flex: 1, height: 12, background: '#EEE9DF', borderRadius: 6 }} /></div>)}
  {!after && <div style={{ padding: '9px 6px', fontSize: 16, color: '#D9480F', fontWeight: 800, border: '1px dashed #F3B79C', borderRadius: 8, marginTop: 8 }}>{s.rank ? `${s.rank}위` : '1페이지 밖'} &nbsp;{s.store}</div>}
</div>;

export default function Pv3Doc(p: Pv3Props) {
  const { k, ka, s, sa, brand, page } = p; const kw = k.keyword; const g = k.volume.group;
  const ratio = (x: number) => g ? Math.max(8, Math.min(100, Math.round(100 * x))) : 0;
  const stageOf = (w: string) => s.plan.find(pl => pl.weapons.includes(w))?.phase;
  switch (page) {
    case 1: return <div className="pv3 ink">
      <div className="kick">Advertising Proposal · {s.store}</div>
      <h1>{sa.headline}</h1>
      <div className="lead">「{kw}」 상위 {k.n}개 상품 실측 데이터{g ? `와 월 검색량 ${g.toLocaleString('ko-KR')}회` : ''}를 기준으로, {s.store} 상품 하나만 놓고 쓴 광고 설계.</div>
      <div className="rule" />
      <div className="grid3">
        <div className="stat"><b>{s.rank ? `${s.rank}위` : '미진입'}</b><span>현재 순위 · 「{kw}」</span></div>
        <div className="stat"><b className="hot">{LEAK_LABEL[s.leak]}</b><span>새는 구간 (인지·탐색·비교·구매·재구매 중)</span></div>
        <div className="stat"><b style={{ color: '#7FD1B9' }}>+{man(s.revenue.gain)}</b><span>설계대로 진행 시 월 추가 매출 추정</span></div></div>
      <div className="box" style={{ marginTop: 40 }}><div className="kick" style={{ marginBottom: 12 }}>이 제안을 관통하는 한 줄</div><div className="quote">{sa.thesis}</div></div>
      <div style={{ marginTop: 32, fontSize: 17, color: '#8E99AD', lineHeight: 1.8 }}>① 진단 — 강점과 그러나 &nbsp;② 사는 사람 &nbsp;③ 시장 세 숫자 &nbsp;④ 광고 설계 3단계 &nbsp;⑤ 순위를 가르는 것 &nbsp;⑥ 콘텐츠 설계 &nbsp;⑦ 시뮬레이션·조합 &nbsp;⑧ 진행 방식</div>
      <Foot k={k} s={s} n={1} /></div>;

    case 2: return <div className="pv3">
      <div className="kick">01 · Diagnosis</div>
      <h2>{sa.have.length ? '가진 건 분명한 상품.' : '수요는 있는 키워드.'}<br />그러나 <span className="hot">{LEAK_LABEL[s.leak]} 구간에서 새는 구조</span></h2>
      <div className="lead">검색에서 구매까지 다섯 단계 중 {s.store}가 멈추는 자리.</div>
      <div className="funnel" style={{ marginTop: 18 }}>{FUNNEL.map((f, i) => <div key={f} className={i === s.stage ? 'on' : i < s.stage ? 'ok' : ''}>{f}{i === s.stage ? ' ✕' : i < s.stage ? ' ✓' : ''}</div>)}</div>
      <div className="grid2" style={{ marginTop: 22 }}>
        <div className="box"><div className="kick" style={{ marginBottom: 12 }}>가진 것</div>{(sa.have.length ? sa.have : ['—']).map((h, i) => <div key={i} className="ci" style={i === sa.have.length - 1 ? { border: 0 } : {}}><span>{['자산', '포지션', '수요'][i] ?? '강점'}</span><b>{h}</b></div>)}</div>
        <div className="box" style={{ borderColor: '#F3B79C', background: '#FFF4EC' }}><div className="kick" style={{ marginBottom: 12, color: '#D9480F' }}>새는 곳</div>{(sa.leak.length ? sa.leak : s.why.slice(0, 3)).map((h, i, a) => <div key={i} className="ci" style={i === a.length - 1 ? { border: 0 } : {}}><span style={{ background: '#D9480F' }}>{['구간', '원인', '결과'][i] ?? '문제'}</span><b>{h}</b></div>)}</div></div>
      <div className="grid2" style={{ marginTop: 20 }}><Srch k={k} s={s} /><Srch k={k} s={s} after /></div>
      <div className="box" style={{ marginTop: 20, background: '#141A26', color: '#F4F1EA', border: 0 }}><div className="quote" style={{ fontSize: 25 }}>진단 — {ka.narrative.diagnosis || `${LEAK_LABEL[s.leak]}부터 막아야 하는 순서`}</div></div>
      <Foot k={k} s={s} n={2} /></div>;

    case 3: return <div className="pv3">
      <div className="kick">02 · Who Is Searching</div>
      <h2>「{kw}」를 검색하는 사람</h2>
      <div className="lead">상품 스펙이 아니라 사람의 상황에서 출발한 설계. 검색량·가격대·리뷰 패턴에서 추론한 구매자의 모습.</div>
      <div style={{ marginTop: 20 }}>
        <div className="ph1"><div className="t">누구</div><div><b>{ka.buyer.who}</b></div></div>
        <div className="ph1"><div className="t">속마음</div><div><b>{ka.buyer.truth}</b></div></div>
        <div className="ph1" style={{ borderBottom: '1px solid #E3DDD0' }}><div className="t">결정 순간</div><div><b>{ka.buyer.moment}</b></div></div></div>
      <div className="grid2" style={{ marginTop: 26 }}>
        <div className="box" style={{ borderColor: '#F3B79C' }}><div className="kick" style={{ color: '#D9480F' }}>약점</div><div className="quote" style={{ fontSize: 23, marginTop: 10 }}>{ka.reframe.weak}</div></div>
        <div className="box" style={{ borderColor: '#1F6F5F', background: '#E6F4EF' }}><div className="kick" style={{ color: '#1F6F5F' }}>뒤집기</div><div className="quote" style={{ fontSize: 23, marginTop: 10 }}>{ka.reframe.flip}</div></div></div>
      <div className="box" style={{ marginTop: 22 }}><div className="kick" style={{ marginBottom: 10 }}>이어지는 이야기</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr 24px 1fr', gap: 8, alignItems: 'center', fontSize: 17.5, lineHeight: 1.5 }}>
          <div><b style={{ color: '#8A7B62', fontSize: 13, letterSpacing: '.1em', display: 'block' }}>진단</b>{ka.narrative.diagnosis}</div><div style={{ color: '#8A7B62', fontSize: 22 }}>→</div>
          <div><b style={{ color: '#8A7B62', fontSize: 13, letterSpacing: '.1em', display: 'block' }}>인사이트</b>{ka.narrative.insight}</div><div style={{ color: '#8A7B62', fontSize: 22 }}>→</div>
          <div><b style={{ color: '#8A7B62', fontSize: 13, letterSpacing: '.1em', display: 'block' }}>전략</b>{ka.narrative.strategy}</div></div></div>
      <Foot k={k} s={s} n={3} /></div>;

    case 4: { const cm = k.contentMarket; const hasCm = cm.blog != null || cm.cafe != null || cm.youtube != null; return <div className="pv3">
      <div className="kick">03 · Three Markets</div>
      <h2>검색 · 콘텐츠 · 광고, 세 시장</h2>
      <div className="lead">「{kw}」를 둘러싼 수요가 어디에 얼마나 있는지. 설계는 이 세 숫자에서 출발.</div>
      <div className="grid3" style={{ marginTop: 20 }}>
        <div className="box stat" style={{ textAlign: 'center' }}><div className="kick">검색 시장</div><b style={{ marginTop: 8 }}>{g ? g.toLocaleString('ko-KR') : '—'}</b><span>월 검색 · 메인 {k.volume.main.toLocaleString('ko-KR')} + 연관 {k.volume.related.length}개</span></div>
        <div className="box stat" style={{ textAlign: 'center' }}><div className="kick">콘텐츠 시장</div><b style={{ marginTop: 8 }}>{hasCm ? `${Math.round(((cm.blog ?? 0) + (cm.cafe ?? 0)) / 10000)}만` : '—'}</b><span>{hasCm ? `블로그·카페 글 수${cm.youtube != null ? ` · 유튜브 ${cm.youtube.toLocaleString('ko-KR')}` : ''}` : '미측정'}</span></div>
        <div className="box stat" style={{ textAlign: 'center' }}><div className="kick">광고 시장</div><b style={{ marginTop: 8 }}>{k.volume.comp === '높음' ? '치열' : k.volume.comp === '중간' ? '보통' : k.volume.comp === '낮음' ? '여유' : '—'}</b><span>검색광고 경쟁 · 1페이지 광고 {k.stats.adCount10}개</span></div></div>
      <div className="box" style={{ marginTop: 20, background: '#141A26', color: '#F4F1EA', border: 0 }}>
        <div className="lead" style={{ fontSize: 18, marginBottom: 14, color: '#AEB6C6' }}>검색 시장에서 매달 오가는 돈 · 추정</div>
        <div style={{ display: 'grid', gap: 12 }}>
          {[['1페이지 전체 (1~40위)', k.revenue.market, 100, '#1F6F5F'], ['상위 10개가 가져가는 몫', k.revenue.loss, ratio(k.revenue.loss / Math.max(1, k.revenue.market)), '#2E8B74'], ['3위 진입 시 가져올 몫', k.volume.group * k.revenue.conv * k.revenue.aov * ctr(3), ratio(ctr(3) / 0.634), '#7FD1B9']].map(([l, v, w, c], i) => <div key={i}><div style={{ fontSize: 16, color: '#8E99AD', marginBottom: 6 }}>{l as string}</div><div style={{ height: 44, borderRadius: 10, background: c as string, width: `${w}%`, display: 'flex', alignItems: 'center', paddingLeft: 16, fontWeight: 800, fontSize: 21, color: i === 2 ? '#052E16' : '#fff', whiteSpace: 'nowrap' }}>{i === 2 ? '+' : ''}{eok(v as number)}</div></div>)}</div></div>
      <div className="box" style={{ marginTop: 18 }}><div style={{ fontSize: 17.5, lineHeight: 1.7, color: '#334155' }}><b>근거</b> — 월 검색 {g.toLocaleString('ko-KR')}회 × 순위별 클릭 점유 × 전환 {k.revenue.conv * 100}% × 객단가 {k.revenue.aov.toLocaleString('ko-KR')}원(상위 10 평균) · 추정{k.volume.related.length ? ` · 연관: ${k.volume.related.map(r => r.keyword).join(' · ')}` : ''}</div></div>
      <Foot k={k} s={s} n={4} /></div>; }

    case 5: return <div className="pv3">
      <div className="kick">04 · Advertising Design</div>
      <h2>새는 지점 하나, 그걸 막는 순서 셋</h2>
      <div className="lead">무기를 전부 미는 제안이 아니라, {s.store}의 병목 순서대로 세운 3단계. 리딩은 <b>{s.lead}</b>.</div>
      <div className="box" style={{ marginTop: 16, borderLeft: '8px solid #D9480F' }}><div className="kick" style={{ color: '#D9480F' }}>가장 새는 지점</div><div className="quote" style={{ fontSize: 23, marginTop: 6 }}>{s.why[0]}</div></div>
      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {s.plan.map((pl, i) => <div key={pl.phase} className="box step" style={i === 0 ? { borderLeft: '8px solid #1F6F5F' } : {}}><i>{pl.phase}</i><div><b>{pl.title} — {pl.when}{i === 0 ? ' · 리딩' : ''}</b><p>{pl.weapons.map(w => <span key={w} className={`chip ${w === s.lead ? 'now' : i === 0 ? 'pf' : 'br'}`}>{w}</span>)}<br />{ka.stages[i] ?? ''}</p></div></div>)}</div>
      <div className="box" style={{ marginTop: 14, padding: '16px 22px' }}><div className="kick" style={{ marginBottom: 6 }}>이번엔 안 쓰는 것</div>{s.skip.map((x, i) => <div key={i} style={{ fontSize: 16.5, lineHeight: 1.6, color: '#4A5262' }}><span className="chip off">{x.weapon}</span> {ka.skipWhy?.[i] || x.why}</div>)}</div>
      <Foot k={k} s={s} n={5} /></div>;

    case 6: { const top = k.top10.slice(0, 8); return <div className="pv3">
      <div className="kick">05 · What Moves Rank</div>
      <h2>순위를 가르는 건 리뷰 수가 아니라 <em>클릭지수</em></h2>
      <div className="lead">상위 10개 실측 — 리뷰가 많은 순서가 아닌 순위. 차이를 만드는 건 클릭지수 한 칸.</div>
      <div className="box" style={{ marginTop: 18, padding: '14px 20px' }}><table><thead><tr><th>순위</th><th style={{ textAlign: 'left' }}>상품</th><th>리뷰</th><th>클릭지수</th></tr></thead><tbody>
        {top.map(t => <tr key={t.rank}><td><b>{t.rank}</b></td><td className="l">{t.title}</td><td>{t.reviews.toLocaleString('ko-KR')}</td><td style={{ color: '#1F6F5F', fontWeight: 800 }}>{t.click.toFixed(1)}</td></tr>)}
        </tbody></table>
        <div style={{ fontSize: 14, color: '#8A7B62', marginTop: 8 }}>클릭지수 5점 만점 · 상위 {k.n}개 지수 실측 · {k.date}</div></div>
      <div className="grid3" style={{ marginTop: 16 }}>
        <div className="box stat" style={{ textAlign: 'center' }}><b style={{ color: '#1F6F5F' }}>{k.stats.avgClick10}</b><span>상위 10 클릭지수 평균</span></div>
        <div className="box stat" style={{ textAlign: 'center' }}><b>{k.stats.avgClickMid || '—'}</b><span>11~40위 평균</span></div>
        <div className="box stat" style={{ textAlign: 'center' }}><b className="hot">{k.stats.avgClickMid ? Math.round((k.stats.avgClick10 - k.stats.avgClickMid) * 10) / 10 : '—'}</b><span>이 차이가 순위를 가름</span></div></div>
      <div className="box" style={{ marginTop: 16, background: '#141A26', color: '#F4F1EA', border: 0 }}><div className="quote" style={{ fontSize: 25 }}>리뷰를 만드는 작업이 아니라,<br /><span style={{ color: '#7FD1B9' }}>쌓인 리뷰가 클릭되게 만드는 작업</span></div><div className="lead" style={{ marginTop: 10, fontSize: 17.5, color: '#AEB6C6' }}>실사용자가 「{kw}」 검색 → 상품 클릭 유입을 매일 일정량. 매일 순위 확인, 변동은 당일 조정. 자리가 잡히면 유입량을 줄여도 유지되는 구조.</div></div>
      <Foot k={k} s={s} n={6} /></div>; }

    case 7: return <div className="pv3">
      <div className="kick">06 · Content Design</div>
      <h2>{s.store}만 할 수 있는 이야기 다섯</h2>
      <div className="lead">2·3단계에서 내보낼 콘텐츠. 형식은 서로 다르게, 앵글은 한 축으로.</div>
      <div style={{ marginTop: 16 }}>{ka.contents.slice(0, 5).map((c, i, a) => <div key={i} className="ph1" style={i === a.length - 1 ? { borderBottom: '1px solid #E3DDD0' } : {}}><div className="t">{c.fmt}</div><div><b>{c.idea}</b></div></div>)}</div>
      <div className="box" style={{ marginTop: 20, background: '#F8FAFC', border: 0 }}><div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>월 추가 매출 시뮬레이션 · 추정</div>
        <svg width="930" height="200" viewBox="0 0 930 200"><line x1="0" y1="178" x2="930" y2="178" stroke="#E3DDD0" /><polyline fill="none" stroke="#1F6F5F" strokeWidth="6" strokeLinecap="round" points="0,176 150,110 300,80 450,68 600,62 750,58 930,56" /><polyline fill="none" stroke="#D9480F" strokeWidth="6" strokeLinecap="round" points="0,176 150,110 300,74 450,46 600,30 750,20 930,12" /><text x="690" y="12" fontSize="15" fill="#D9480F" fontWeight="800">3단계 통합 · 누적 {eok(s.revenue.gain * 6 * 1.6)}</text><text x="750" y="50" fontSize="15" fill="#1F6F5F" fontWeight="800">1단계만 · 누적 {eok(s.revenue.gain * 6)}</text>{[0, 1, 2, 3, 4, 5].map(i => <text key={i} x={i * 150} y="196" fontSize="13" fill="#8A7B62">{i + 1}개월</text>)}</svg>
        <div style={{ fontSize: 14, color: '#8A7B62' }}>{s.revenue.formula} · 통합 곡선은 브랜딩 병행 시 검색량 증가 가정</div></div>
      <div className="grid3" style={{ marginTop: 14 }}>
        <div className="box stat" style={{ textAlign: 'center', padding: 16 }}><b style={{ fontSize: 30 }}>+{man(s.revenue.gain)}</b><span>설계대로 진행 시 월</span></div>
        <div className="box stat" style={{ textAlign: 'center', padding: 16 }}><b style={{ fontSize: 30 }}>+{man(s.revenue.gainMax)}</b><span>최대 (1위 기준) 월</span></div>
        <div className="box stat" style={{ textAlign: 'center', padding: 16 }}><b style={{ fontSize: 30 }}>{eok(s.revenue.gainMax * 6)}</b><span>6개월 누적 최대</span></div></div>
      <Foot k={k} s={s} n={7} /></div>;

    default: return <div className="pv3">
      <div className="kick">07 · How It Works</div>
      <h2>진행 방식 · 조합</h2>
      <div className="grid3" style={{ marginTop: 14 }}>
        <div className="box"><div className="kick">Basic</div><div className="serif" style={{ fontSize: 24, fontWeight: 900, margin: '6px 0 8px' }}>1단계</div><p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.7, color: '#4A5262' }}>리딩 무기 중심<br />10일 단위 · 매일 확인 · 종료 리포트</p></div>
        <div className="box" style={{ border: '2px solid #1F6F5F', background: '#E6F4EF' }}><div className="kick" style={{ color: '#1F6F5F' }}>Growth · 추천</div><div className="serif" style={{ fontSize: 24, fontWeight: 900, margin: '6px 0 8px' }}>1 + 2단계</div><p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.7, color: '#1F4A40' }}>노출 + 검색 밖 수요<br />월 리포트 · 전담 담당</p></div>
        <div className="box"><div className="kick">Integrated</div><div className="serif" style={{ fontSize: 24, fontWeight: 900, margin: '6px 0 8px' }}>3단계 통합</div><p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.7, color: '#4A5262' }}>전 단계 + 콘텐츠 5종 제작<br />주간 리포트</p></div></div>
      <div className="box faq" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div><b>효과는 언제부터</b><span>구동 다음 날부터 변동 시작. 보통 3~7일 안에 1페이지 진입 여부 확인. 경쟁도에 따른 차이.</span></div>
        <div><b>중간에 멈추면</b><span>10일 단위 진행. 결과 보고 연장 결정.</span></div>
        <div><b>준비할 것</b><span>상품 URL과 메인 키워드 1개. 키워드는 검색량·경쟁도 보고 함께 결정.</span></div></div>
      <div className="box" style={{ marginTop: 18, background: '#141A26', color: '#F4F1EA', border: 0 }}>
        <div className="quote" style={{ fontSize: 25 }}>카톡 주시면 「{kw}」 연관 키워드 순위까지 확인해 답장</div>
        <div style={{ marginTop: 12, fontSize: 17.5, color: '#AEB6C6', lineHeight: 1.7 }}>카카오톡 오픈채팅 · {brand.kakao.replace(/^https?:\/\//, '')}<br />상품 URL만 보내셔도 됩니다.</div></div>
      <div className="box" style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="serif" style={{ fontSize: 22, fontWeight: 900 }}>{brand.name}</div><div style={{ fontSize: 15.5, color: '#6B7280' }}>네이버쇼핑 상위노출 · 카페 배포 · 인플루언서 · 쿠팡</div></div><div style={{ textAlign: 'right', fontSize: 15.5, color: '#4A5262', lineHeight: 1.6 }}>담당 {brand.owner}<br />{brand.phone}<br />{brand.email}</div></div>
      <div style={{ fontSize: 13, color: '#8A7B62', marginTop: 12, lineHeight: 1.6 }}>※ 매출·시장 규모는 검색량·클릭 점유율·전환율 가정 기반 추정치. 구매자 묘사는 데이터에서 추론한 가설. 특정 순위 보장 없음. 금액은 키워드 경쟁도 확인 후 견적.</div>
      <Foot k={k} s={s} n={8} /></div>;
  }
}
