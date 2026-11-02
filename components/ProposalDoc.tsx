// 키워드 제안서 문서 — 서버/클라이언트 어디서나 렌더 (훅 없음). 각 .pd-page 가 A4 한 장. 인쇄·PNG·PDF 공용
import type { Doc } from '@/lib/proposalDoc';
import { fmtWon, fmtCnt } from '@/lib/proposalDoc';

export const PD_CSS = `
.pd{--ink:#0F172A;--muted:#64748B;--line:#E2E8F0;--soft:#F8FAFC;--blue:#2F4FC8;--blue-soft:#EEF2FD;--navy:#141B2D;--green:#2EB872;--green-soft:#E6F5EC;--orange:#E8740C;color:var(--ink);font-family:Pretendard,'IBM Plex Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;font-size:13px;line-height:1.55;-webkit-font-smoothing:antialiased}
.pd *{box-sizing:border-box}
.pd-page{width:827px;min-height:1170px;background:#fff;margin:0 auto 18px;padding:70px 70px 60px;position:relative;box-shadow:0 2px 14px rgba(0,0,0,.12);page-break-after:always;break-after:page;display:flex;flex-direction:column}
.pd-page.dark{background:linear-gradient(160deg,#101827,#1A2440);color:#fff}
.pd-page.dark .pd-muted{color:#A7B1C6}
.pd-foot{position:absolute;left:70px;right:70px;bottom:40px;display:flex;justify-content:space-between;font-size:10px;color:var(--muted);border-top:1px solid var(--line);padding-top:8px}
.pd-eyebrow{font-size:11px;letter-spacing:.14em;color:var(--blue);font-weight:700;text-transform:uppercase}
.pd h1{font-size:40px;line-height:1.2;margin:14px 0 18px;letter-spacing:-.02em;font-weight:800}
.pd h2{font-size:26px;margin:6px 0 10px;letter-spacing:-.01em;font-weight:800}
.pd-lead{font-size:15px;color:var(--muted);margin:0 0 28px}
.pd-muted{color:var(--muted)}
.pd-logo{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.08em;font-size:14px}
.pd-logo i{width:10px;height:10px;background:var(--blue);transform:rotate(45deg);display:inline-block}
.pd-chip{display:inline-block;background:var(--blue-soft);color:var(--blue);font-weight:700;font-size:12px;padding:6px 14px;border-radius:999px}
.pd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:0 0 24px}
.pd-stat{border:1px solid var(--line);border-radius:12px;padding:18px 14px;text-align:center}
.pd-stat .l{font-size:12px;color:var(--muted);font-weight:600}.pd-stat .v{font-size:30px;font-weight:800;margin:4px 0;font-variant-numeric:tabular-nums}.pd-stat .v small{font-size:13px;color:var(--muted);margin-left:2px}.pd-stat .d{font-size:11px;color:var(--muted)}
.pd-box{border:1px solid var(--line);border-radius:12px;padding:20px 24px;margin-bottom:18px}
.pd-box h4{margin:0 0 10px;font-size:14px}
.pd-tags span{display:inline-block;background:var(--blue);color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px;margin:0 6px 6px 0}
.pd-navy{background:var(--navy);color:#fff;border-radius:12px;padding:22px 26px;margin-bottom:18px}
.pd-navy h4{margin:0 0 14px;font-size:15px}
.pd-navy .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.pd-navy .g3 .l{font-size:12px;color:#A7B1C6;font-weight:600}.pd-navy .g3 .v{font-size:24px;font-weight:800;color:#6FD497;margin:2px 0 4px}.pd-navy .g3 .d{font-size:12px;color:#C9D1E3}
.pd-navy b.hl{color:#6FD497}
.pd table{width:100%;border-collapse:collapse;font-size:12px}
.pd th{background:var(--navy);color:#fff;text-align:left;padding:10px 12px;font-weight:600;font-size:11px}
.pd td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
.pd td.r,.pd th.r{text-align:right;font-variant-numeric:tabular-nums}
.pd tr.me td{background:var(--blue-soft);font-weight:700}
.pd-tbl{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:18px}
.pd-list{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:18px}
.pd-list .hd{background:#22C55E;color:#fff;padding:12px 18px;display:flex;align-items:center;gap:14px;font-weight:800;font-size:16px}
.pd-list .hd .q{flex:1;background:#fff;color:var(--ink);border-radius:999px;padding:6px 16px;font-size:13px;font-weight:500}
.pd-list .row{display:grid;grid-template-columns:28px 72px 1fr auto;gap:16px;align-items:center;padding:14px 18px;border-top:1px solid var(--line)}
.pd-list .row .n{width:24px;height:24px;border-radius:50%;background:#22C55E;color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center}
.pd-list .row img,.pd-list .row .ph{width:72px;height:72px;border-radius:8px;object-fit:cover;background:var(--soft);border:1px solid var(--line);display:block}
.pd-list .row .t{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-list .row .p{font-size:20px;font-weight:800;margin-top:2px}.pd-list .row .p small{font-size:12px;font-weight:600}
.pd-list .row .rv{font-size:12px;color:var(--orange);font-weight:600}
.pd-list .row .ad{background:#FFF1DD;color:var(--orange);font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px}
.pd-idx{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0}
.pd-idx .c{border:1px solid var(--line);border-radius:12px;padding:18px;text-align:center}
.pd-idx .c .v{font-size:30px;font-weight:800;color:var(--blue)}.pd-idx .c .v small{font-size:13px;color:var(--muted);font-weight:600}
.pd-idx .c .bar{height:6px;background:var(--line);border-radius:3px;margin:10px 0;overflow:hidden}.pd-idx .c .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--blue),#6FD497)}
.pd-idx .c .l{font-weight:700;font-size:13px}.pd-idx .c .d{font-size:11px;color:var(--muted)}
.pd-steps .s{border:1px solid var(--line);border-radius:12px;padding:16px 22px;display:grid;grid-template-columns:76px 1fr;gap:14px;margin-bottom:12px}
.pd-steps .s b.k{color:var(--blue);font-size:12px;letter-spacing:.06em;padding-top:2px}
.pd-steps .s .t{font-weight:700;font-size:14px;margin-bottom:3px}.pd-steps .s .d{font-size:12.5px;color:#475569}
.pd-steps .s .do{margin-top:8px;background:var(--soft);border-radius:8px;padding:8px 12px;font-size:12px}.pd-steps .s .do b{color:var(--blue);margin-right:8px}
.pd-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
.pd-two .pd-box{margin:0}
.pd-big{font-size:26px;font-weight:800}.pd-big small{font-size:12px;color:var(--muted);font-weight:600;margin:0 4px}
.pd-bars{display:flex;align-items:flex-end;gap:14px;height:120px;padding:10px 6px 0}
.pd-bars .b{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.pd-bars .b i{display:block;width:100%;background:#2E4A8C;border-radius:3px 3px 0 0}.pd-bars .b .n{font-size:12px;font-weight:700;margin-bottom:4px}.pd-bars .b .l{font-size:10px;color:var(--muted);margin-top:6px}
.pd-sc{background:var(--navy);color:#fff;border-radius:12px;padding:22px 26px;margin-bottom:18px}
.pd-sc h4{margin:0 0 10px;font-size:15px}
.pd-sc .r{display:grid;grid-template-columns:70px 1fr;gap:14px;padding:12px 0;border-top:1px solid rgba(255,255,255,.12);font-size:12.5px;color:#C9D1E3}.pd-sc .r b{color:#6FD497;font-size:13px}
.pd-cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}
.pd-cols3 .pd-box{margin:0}.pd-cols3 h4{color:var(--blue);font-size:16px;margin-bottom:2px}.pd-cols3 .d{font-size:12px;color:var(--muted);margin-bottom:10px}.pd-cols3 ul{margin:0;padding-left:18px;font-size:12.5px}.pd-cols3 li{margin:4px 0}
.pd-now{display:grid;grid-template-columns:100px 1fr 180px;gap:18px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
.pd-now img,.pd-now .ph{width:100px;height:100px;border-radius:10px;object-fit:cover;background:var(--soft);border:1px solid var(--line);display:block}
.pd-now .nm{font-weight:700;font-size:15px}.pd-now .mt{display:flex;gap:14px;margin-top:6px;font-size:13px;color:#475569}.pd-now .mt b{color:var(--ink)}
.pd-now .rk{text-align:right;border-left:1px solid var(--line);padding-left:18px}.pd-now .rk .big{font-size:44px;font-weight:800;line-height:1}.pd-now .rk .big small{font-size:14px;color:var(--muted);font-weight:600}
.pd-fact{background:var(--soft);border-left:4px solid var(--blue);border-radius:6px;padding:10px 14px;font-size:13px;margin-bottom:10px}
.pd-next{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid rgba(255,255,255,.16);border-radius:12px;overflow:hidden;margin-top:30px}
.pd-next div{padding:20px 22px;border-right:1px solid rgba(255,255,255,.16)}.pd-next div:last-child{border-right:0}
.pd-next .l{font-size:11px;letter-spacing:.1em;color:#8FA0C6;font-weight:700;margin-bottom:8px}.pd-next .v{font-size:15px;font-weight:700}.pd-next .d{font-size:12px;color:#A7B1C6;margin-top:2px}
@media print{.pd-page{box-shadow:none;margin:0;min-height:auto;height:297mm;width:210mm;padding:18mm}body{background:#fff}}
`;

export default function ProposalDoc({ d, total, img = (u: string) => u }: { d: Doc; total?: number; img?: (u: string) => string }) {
  const pages: JSX.Element[] = [];
  const foot = (i: number) => <div className="pd-foot"><span>{d.brand.name} · 쇼핑 노출 진단</span><span>{i} / {total ?? 'N'}</span></div>;
  const H = ({ n, k, t, lead }: { n: string; k: string; t: string; lead: string }) => <><div className="pd-eyebrow">{n} · {k}</div><h2>{t}</h2><p className="pd-lead">{lead}</p></>;
  const ad = (p: any) => /광고|ad/i.test(String(p.상품유형 ?? ''));
  const tgt = d.target;

  // 1 표지
  pages.push(<div className="pd-page" key="cover">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div className="pd-logo"><i />{d.brand.nameEn}</div><span className="pd-muted" style={{ fontSize: 12 }}>{d.date}</span></div>
    <div style={{ marginTop: 110 }}>
      <span className="pd-chip">쇼핑 노출 진단 &amp; 상위노출 제안서</span>
      <h1>노출부터 매출까지,<br />쇼핑 마케팅 전 단계 설계</h1>
      <p className="pd-lead" style={{ fontSize: 17, lineHeight: 1.6 }}>노출만으로는 매출이 나지 않는다.<br />키워드·상품 최적화, 노출·리뷰·전환까지 —<br />이 시장에 맞는 단계별 실행 전략.</p>
      <div className="pd-box" style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(3,auto)', gap: 34, padding: '22px 34px' }}>
        <div><div className="pd-big">{d.n}<small>개</small></div><div className="pd-muted" style={{ fontSize: 12 }}>분석 상품(상위)</div></div>
        <div><div className="pd-big">{fmtWon(d.avgPrice)}</div><div className="pd-muted" style={{ fontSize: 12 }}>평균가</div></div>
        <div><div className="pd-big">{fmtCnt(d.avgReview)}<small>개</small></div><div className="pd-muted" style={{ fontSize: 12 }}>평균 리뷰</div></div>
      </div>
      <div className="pd-muted" style={{ fontSize: 12, fontWeight: 600, margin: '26px 0 10px' }}>핵심 포인트</div>
      <div>{['시장·상품 분석', '경쟁력 지수', '노출 알고리즘', '가격·리뷰 포지셔닝', '단계별 전략', '상위노출 진행 방안'].map(t => <span key={t} style={{ display: 'inline-block', border: '1px solid var(--line)', borderRadius: 999, padding: '7px 16px', fontSize: 12, fontWeight: 600, margin: '0 8px 8px 0' }}>{t}</span>)}</div>
    </div>
    <div style={{ marginTop: 'auto', background: 'var(--soft)', margin: '40px -70px -60px', padding: '26px 70px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <div><div className="pd-eyebrow" style={{ fontSize: 10 }}>{tgt ? '수신' : '분석 대상'}</div><div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{tgt ? `${tgt.mallName} 귀중` : `${d.keyword} 쇼핑 시장`}</div><div className="pd-muted" style={{ fontSize: 12 }}>{tgt ? `'${d.keyword}' 검색 결과 현재 ${tgt.rank}위 · 네이버 쇼핑 상위 상품 분석` : '네이버 쇼핑 상위 상품 분석'}</div></div>
      <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800 }}>{d.brand.name}</div><div className="pd-muted" style={{ fontSize: 12 }}>{d.brand.owner ? `담당 ${d.brand.owner}${d.brand.phone ? ' · ' + d.brand.phone : ''}` : d.brand.email}</div></div>
    </div>
  </div>);

  // 2 시장 분석
  pages.push(<div className="pd-page" key="market">
    <H n="01" k="SHOP MARKET" t={`${d.keyword} 쇼핑 시장 분석`} lead={`네이버 쇼핑에서 「${d.keyword}」로 판매 중인 상위 상품의 실측 데이터.`} />
    <div className="pd-stats">
      <div className="pd-stat"><div className="l">분석 상품</div><div className="v">{d.n}<small>개</small></div><div className="d">상위 노출 기준</div></div>
      <div className="pd-stat"><div className="l">평균가</div><div className="v">{fmtCnt(d.avgPrice)}<small>원</small></div><div className="d">상위10개 {fmtWon(d.avgPrice10)}</div></div>
      <div className="pd-stat"><div className="l">평균 리뷰</div><div className="v">{fmtCnt(d.avgReview)}<small>개</small></div><div className="d">진입 장벽 지표</div></div>
      <div className="pd-stat"><div className="l">신상품 비율</div><div className="v">{d.newRate}<small>%</small></div><div className="d">최근 90일</div></div>
    </div>
    {d.related.length > 0 && <div className="pd-box"><h4>함께 공략할 연관 키워드</h4><div className="pd-tags">{d.related.map(t => <span key={t}>{t}</span>)}</div><div className="pd-muted" style={{ fontSize: 12, marginTop: 6 }}>상위 상품들이 실제로 노출되는 연관 검색어입니다. 대표 키워드와 함께 공략하면 유입 범위가 넓어집니다.</div></div>}
    <div className="pd-navy"><h4>이 시장, 이렇게 읽습니다</h4><div className="g3">
      <div><div className="l">경쟁 강도</div><div className="v">{d.competition.level}</div><div className="d">{d.competition.why}</div></div>
      <div><div className="l">진입 장벽</div><div className="v">{d.barrier.level}</div><div className="d">{d.barrier.why}</div></div>
      <div><div className="l">진입 타이밍</div><div className="v">{d.timing.level}</div><div className="d">{d.timing.why}</div></div>
    </div></div>
    {foot(2)}
  </div>);

  // 3 상위 노출 상품
  pages.push(<div className="pd-page" key="top">
    <H n="02" k="TOP PRODUCTS" t="상위 노출 상품 분석" lead="가격·리뷰·상품 점수로 보는 상위권 진입 기준." />
    <div className="pd-list"><div className="hd">N 쇼핑 <span className="q">{d.keyword}</span>🔍</div>
      {d.top.slice(0, 3).map(p => <div className="row" key={p.rank}><div className="n">{p.rank}</div>{p.imageUrl ? <img src={img(p.imageUrl)} alt="" /> : <div className="ph" />}<div style={{ minWidth: 0 }}><div className="t">{p.productTitle}</div><div className="p">{fmtCnt(p.lowPrice)}<small>원</small></div><div className="rv">★ 리뷰 {fmtCnt(p.reviewCount)}</div></div>{ad(p) ? <span className="ad">광고</span> : <span />}</div>)}
    </div>
    <div className="pd-tbl"><table><thead><tr><th style={{ width: 50 }}>순위</th><th>상품</th><th className="r">가격</th><th className="r">리뷰</th><th className="r">상품점수</th></tr></thead><tbody>
      {d.top.map(p => <tr key={p.rank} className={tgt && p.rank === tgt.rank ? 'me' : ''}><td style={{ color: 'var(--muted)', fontWeight: 700 }}>{p.rank}</td><td><div style={{ maxWidth: 380, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{p.productTitle}</div><div className="pd-muted" style={{ fontSize: 11 }}>{p.mallName}</div></td><td className="r">{fmtWon(p.lowPrice)}</td><td className="r">{fmtCnt(p.reviewCount)}</td><td className="r" style={{ color: 'var(--blue)', fontWeight: 700 }}>{p.종합점수 ? p.종합점수.toFixed(2) : '-'}</td></tr>)}
      {tgt && tgt.rank > 10 && <tr className="me"><td>{tgt.rank}</td><td><div style={{ maxWidth: 380, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tgt.title}</div><div style={{ fontSize: 11, fontWeight: 500 }}>{tgt.mallName} (귀사)</div></td><td className="r">{tgt.price ? fmtWon(tgt.price) : '-'}</td><td className="r">{fmtCnt(tgt.reviews)}</td><td className="r">-</td></tr>}
    </tbody></table></div>
    <div className="pd-navy" style={{ padding: '16px 22px', fontSize: 13 }}>{d.facts[0].split(/(\d[\d,]*원|\d[\d,]*개)/).map((s, i) => /^\d/.test(s) ? <b className="hl" key={i}>{s}</b> : s)}</div>
    {foot(3)}
  </div>);

  // 4 경쟁력 지수 (레이더)
  const R = 110, cx = 160, cy = 150; const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 6; const r = (v / 5) * R; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  pages.push(<div className="pd-page" key="index">
    <H n="03" k="INDEX" t="상위 상품 경쟁력 지수" lead="상위 상품 지수(각 5점 만점)로 보는 상위 노출의 핵심 요소." />
    <div style={{ display: 'flex', justifyContent: 'center' }}><svg width={320} height={300} viewBox="0 0 320 300">
      {[1, 2, 3, 4, 5].map(l => <polygon key={l} points={[0, 1, 2, 3, 4, 5].map(i => pt(i, l).join(',')).join(' ')} fill="none" stroke="#E2E8F0" />)}
      {[0, 1, 2, 3, 4, 5].map(i => <line key={i} x1={cx} y1={cy} x2={pt(i, 5)[0]} y2={pt(i, 5)[1]} stroke="#E2E8F0" />)}
      <polygon points={d.axes.map((a, i) => pt(i, a.v).join(',')).join(' ')} fill="rgba(47,79,200,.18)" stroke="#2F4FC8" strokeWidth={2} />
      {d.axes.map((a, i) => { const [x, y] = pt(i, a.v); const [lx, ly] = pt(i, 6.3); return <g key={a.key}><circle cx={x} cy={y} r={3.5} fill="#2F4FC8" /><text x={lx} y={ly - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0F172A">{a.label}</text><text x={lx} y={ly + 10} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2F4FC8">{a.v}</text></g>; })}
    </svg></div>
    <div className="pd-idx">{d.axes.map(a => <div className="c" key={a.key}><div className="v">{a.v}<small> / 5</small></div><div className="bar"><i style={{ width: `${(a.v / 5) * 100}%` }} /></div><div className="l">{a.label}</div><div className="d">{a.desc}</div></div>)}</div>
    <div className="pd-navy" style={{ padding: '16px 22px', fontSize: 13 }}>상위 상품은 특히 <b className="hl">{d.strongAxis}</b> 지표가 두드러집니다. 신규 상품이 이 시장에 진입하려면 {d.strongAxis}부터 노출·리뷰로 끌어올려 상위 노출 조건을 맞춰야 합니다.</div>
    {foot(4)}
  </div>);

  // 5 가격·리뷰 포지셔닝
  const mx = Math.max(...d.priceBands.map(b => b.count), 1);
  pages.push(<div className="pd-page" key="pos">
    <H n="04" k="POSITION" t="가격·리뷰 포지셔닝" lead="상위 상품 가격대·리뷰 기준 진입 포지션." />
    <div className="pd-box"><h4>가격 분포 (구간별 상품 수)</h4><div className="pd-bars">{d.priceBands.map((b, i) => <div className="b" key={i}><div className="n">{b.count}</div><i style={{ height: `${Math.max(4, (b.count / mx) * 90)}px` }} /><div className="l">{b.label}</div></div>)}</div></div>
    <div className="pd-two">
      <div className="pd-box"><h4>시장 가격대</h4><div className="pd-big"><small>최저</small>{fmtWon(d.minPrice10)}<small>~</small>{fmtWon(d.avgPrice10)}<small>상위</small></div><div className="pd-muted" style={{ fontSize: 12, marginTop: 6 }}>상위 10개 평균 {fmtWon(d.avgPrice10)}. 이 대역 안에 들어야 가격 경쟁에서 밀리지 않습니다. 너무 낮으면 저품질로, 너무 높으면 클릭이 안 됩니다.</div></div>
      <div className="pd-box"><h4>리뷰 장벽</h4><div className="pd-big">{fmtCnt(d.avgReview10)}개<small>평균</small></div><div className="pd-muted" style={{ fontSize: 12, marginTop: 6 }}>상위 상품 평균 리뷰 {fmtCnt(d.avgReview10)}개. 리뷰가 이보다 크게 적으면 자연 순위로는 상위 진입이 어렵습니다. 초기엔 노출을 먼저 만들어 구매·리뷰를 쌓아야 합니다.</div></div>
    </div>
    <div className="pd-navy" style={{ padding: '14px 22px', fontSize: 13 }}>신상품 비율 <b className="hl">{d.newRate}%</b> — {d.newRate >= 20 ? '신규 상품이 계속 들어오는 시장입니다. 먼저 노출을 잡는 쪽이 자리를 가져갑니다.' : '기존 상품이 자리를 굳힌 시장입니다. 노출을 확보하지 않으면 신규는 묻힙니다.'}</div>
    <div className="pd-sc"><h4>신규 진입 3단계 시나리오</h4>
      <div className="r"><b>진입기</b><div>가격을 상위 대역({d.entry.price}) 안에 맞추고, 상위노출로 검색 결과 상단 노출을 확보합니다. 리뷰가 적어도 첫 구매를 만드는 단계입니다.</div></div>
      <div className="r"><b>성장기</b><div>노출로 생긴 구매를 리뷰로 쌓아 {d.entry.review} 수준에 근접시킵니다. 리뷰가 붙으면 자연 순위가 안정됩니다.</div></div>
      <div className="r"><b>안정기</b><div>자연 순위 상위권에 오르면 연관 키워드로 노출을 넓히고, 전환 높은 키워드에 집중합니다.</div></div>
    </div>
    {foot(5)}
  </div>);

  // 6 알고리즘
  pages.push(<div className="pd-page" key="algo">
    <H n="05" k="ALGORITHM" t="쇼핑 노출 알고리즘" lead="네이버 쇼핑 순위를 정하는 적합도·인기도·신뢰도 세 축." />
    <div className="pd-cols3">
      <div className="pd-box"><h4>적합도</h4><div className="d">검색어와 상품이 얼마나 맞는가</div><ul><li>상품명 키워드 정확도</li><li>카테고리 일치</li><li>속성·태그 정보</li></ul></div>
      <div className="pd-box"><h4>인기도</h4><div className="d">사람들이 얼마나 찾는가</div><ul><li>클릭수·찜수</li><li>판매 실적</li><li>리뷰수</li><li>최신성</li></ul></div>
      <div className="pd-box"><h4>신뢰도</h4><div className="d">믿고 살 수 있는가</div><ul><li>리뷰 평점</li><li>스토어 지수</li><li>페널티 여부</li></ul></div>
    </div>
    <div className="pd-navy" style={{ padding: '16px 22px', fontSize: 13 }}>이 시장 상위 상품은 평균 리뷰 <b className="hl">{fmtCnt(d.avgReview10)}개</b>로 <b className="hl">인기도·신뢰도</b>가 이미 높습니다. 신규 상품은 클릭·판매(인기도)를 먼저 만들고, 리뷰(신뢰도)를 빠르게 쌓는 것이 상위 진입의 핵심입니다.</div>
    <div className="pd-sc"><h4>세 축을 어떻게 끌어올리나</h4>
      <div className="r"><b>적합도</b><div>상품명에 핵심·연관 키워드를 정확히 배치하고 카테고리·속성을 맞춰, 검색될 때 먼저 걸리게 만듭니다.</div></div>
      <div className="r"><b>인기도</b><div>상위노출로 실제 검색 유입·클릭을 만들고 구매·찜을 늘려, 부족한 반응 신호를 초기에 메웁니다.</div></div>
      <div className="r"><b>신뢰도</b><div>구매 고객에게 포토리뷰를 유도해 평점과 리뷰 수를 쌓고, 스토어 응대·배송 지표를 관리합니다.</div></div>
    </div>
    {foot(6)}
  </div>);

  // 7 귀사 현재 위치 (대상 있을 때)
  if (tgt) pages.push(<div className="pd-page" key="you">
    <H n="06" k="YOUR POSITION" t={`${tgt.mallName} 현재 위치`} lead={`'${d.keyword}' 검색 결과에서 귀사 상품이 어디에 있는지, 상위 10개와 무엇이 다른지.`} />
    <div className="pd-now">{tgt.image ? <img src={img(tgt.image)} alt="" /> : <div className="ph" />}<div style={{ minWidth: 0 }}><div className="nm">{tgt.title}</div><div className="mt"><span>가격 <b>{tgt.price ? fmtWon(tgt.price) : '-'}</b></span><span>리뷰 <b>{fmtCnt(tgt.reviews)}</b></span><span>스토어 <b>{tgt.mallName}</b></span></div></div><div className="rk"><div className="pd-muted" style={{ fontSize: 12 }}>현재 순위</div><div className="big">{tgt.rank}<small>위</small></div><div className="pd-muted" style={{ fontSize: 12 }}>{tgt.rank > 40 ? '상위 40위 밖' : tgt.rank > 10 ? '1페이지 · 10위 밖' : '상위 10위'}</div></div></div>
    <div className="pd-tbl"><table><thead><tr><th></th><th className="r">귀사</th><th className="r">상위 10개 평균</th><th className="r">상위 10개 범위</th></tr></thead><tbody>
      <tr><td>가격</td><td className="r" style={{ fontWeight: 700 }}>{tgt.price ? fmtWon(tgt.price) : '-'}</td><td className="r">{fmtWon(d.avgPrice10)}</td><td className="r">{fmtWon(d.minPrice10)} ~ {fmtWon(d.maxPrice10)}</td></tr>
      <tr><td>리뷰</td><td className="r" style={{ fontWeight: 700 }}>{fmtCnt(tgt.reviews)}개</td><td className="r">{fmtCnt(d.avgReview10)}개</td><td className="r">중간값 {fmtCnt(d.medianReview10)}개</td></tr>
      <tr><td>순위</td><td className="r" style={{ fontWeight: 700 }}>{tgt.rank}위</td><td className="r">1~10위</td><td className="r">광고 {d.adCount10}개 포함</td></tr>
    </tbody></table></div>
    {d.targetFacts.map((f, i) => <div className="pd-fact" key={i}>{f}</div>)}
    <div className="pd-navy" style={{ padding: '16px 22px', fontSize: 13, marginTop: 8 }}>차이는 상품이 아니라 <b className="hl">검색 결과에서 보이는 위치</b>입니다. 노출 위치가 올라가면 같은 상품으로 클릭·구매·리뷰가 따라옵니다.</div>
    {foot(7)}
  </div>);

  // 8 단계별 전략 + 진행 방안
  const pn = tgt ? 8 : 7;
  pages.push(<div className="pd-page" key="strategy">
    <H n={tgt ? '07' : '06'} k="STRATEGY" t="단계별 마케팅 전략" lead={`노출 → 클릭 → 구매 → 재구매. 「${d.keyword}」 상위 노출과 매출까지 단계별 실행 순서.`} />
    <div className="pd-steps">
      <div className="s"><b className="k">STEP 1</b><div><div className="t">상품·시장 분석</div><div className="d">경쟁 상품 대비 차별점을 잡고, 전환 가능성 높은 키워드를 조회수·경쟁강도로 선별합니다.{d.related.length ? ` (${d.related.slice(0, 3).join(', ')})` : ''}</div></div></div>
      <div className="s"><b className="k">STEP 2</b><div><div className="t">상품명·상세페이지 최적화</div><div className="d">상품명에 핵심·연관 키워드를 정확히 배치(적합도), 썸네일·상세페이지로 클릭률과 체류시간을 높입니다.</div></div></div>
      <div className="s"><b className="k">STEP 3</b><div><div className="t">상위노출로 초기 노출 확보</div><div className="d">리뷰·판매가 부족한 초기, 검색 결과 상단 노출을 확보해 클릭·구매(인기도 신호)를 만듭니다.</div><div className="do"><b>실행</b>상품·키워드 등록 → 매일 검색 유입 진행 → 아침 순위 확인 → 종료일 리포트</div></div></div>
      <div className="s"><b className="k">STEP 4</b><div><div className="t">리뷰·평점 확보</div><div className="d">구매 후 포토리뷰를 유도해 평균 {fmtCnt(d.avgReview10)}개 수준까지 리뷰를 쌓습니다. 신뢰도가 오르면 자연 순위가 따라 오릅니다.</div></div></div>
      <div className="s"><b className="k">STEP 5</b><div><div className="t">연관 키워드 확장</div><div className="d">대표 키워드가 안정되면 연관 키워드로 노출을 넓혀 유입 범위를 키웁니다.</div></div></div>
      <div className="s"><b className="k">STEP 6</b><div><div className="t">전환 측정·재구매</div><div className="d">어떤 키워드가 구매로 이어지는지 측정해 집중하고, 재구매 고객으로 매출을 누적시킵니다.</div></div></div>
    </div>
    {foot(pn)}
  </div>);

  // 9 진행 방안 (리워드)
  pages.push(<div className="pd-page" key="service">
    <H n={tgt ? '08' : '07'} k="HOW IT WORKS" t="상위노출 진행 방안" lead="실제 검색 유입으로 상품 반응 지표를 만들어 자연 검색 순위에 반영하는 방식." />
    <div className="pd-steps">
      <div className="s"><b className="k">시작</b><div><div className="t">상품·키워드 등록, 시작 순위 기록</div><div className="d">대표 키워드 1개(필요 시 연관 키워드 추가)와 상품을 등록하고 시작 시점 순위를 남깁니다.</div></div></div>
      <div className="s"><b className="k">매일</b><div><div className="t">검색 유입 진행 · 아침 순위 확인</div><div className="d">실제 사용자가 「{d.keyword}」를 검색해 귀사 상품으로 들어가는 유입을 매일 일정량 만듭니다. 광고 영역이 아니라 자연 검색 순위에 반영됩니다.</div></div></div>
      <div className="s"><b className="k">진행 중</b><div><div className="t">순위 변동 시 담당자 연락</div><div className="d">순위가 크게 움직이면 담당자가 바로 안내합니다. 궁금한 건 담당자에게 언제든 확인 가능합니다.</div></div></div>
      <div className="s"><b className="k">종료일</b><div><div className="t">기간 리포트 전달</div><div className="d">시작 순위 → 현재 순위, 기간 중 최고 순위, 일별 순위 표를 리포트로 드립니다. 연장 여부는 리포트를 보고 결정하시면 됩니다.</div></div></div>
    </div>
    <div className="pd-two" style={{ marginTop: 6 }}>
      <div className="pd-box"><h4>기본</h4><div className="pd-big" style={{ fontSize: 18 }}>담당자 안내</div><ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: '#475569' }}><li>키워드 1개 · 10일</li><li>일일 순위 확인 · 종료 리포트</li></ul></div>
      <div className="pd-box" style={{ borderColor: 'var(--blue)', boxShadow: 'inset 0 0 0 1px var(--blue)' }}><h4>권장 <span className="pd-chip" style={{ padding: '2px 10px', fontSize: 11, marginLeft: 6 }}>같은 키워드 다수 진행</span></h4><div className="pd-big" style={{ fontSize: 18 }}>담당자 안내</div><ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: '#475569' }}><li>키워드 1개 · 10일 · 유입량 상향</li><li>연관 키워드 1개 순위 추적 포함</li><li>일일 순위 확인 · 종료 리포트</li></ul></div>
    </div>
    <div className="pd-muted" style={{ fontSize: 11 }}>※ 결과는 키워드 경쟁도·상품 반응에 따라 다르며, 특정 순위를 보장하는 서비스가 아닙니다.</div>
    {foot(pn + 1)}
  </div>);

  // 10 NEXT STEP
  pages.push(<div className="pd-page dark" key="next">
    <div style={{ marginTop: 300 }}>
      <span style={{ display: 'inline-block', border: '1px solid rgba(255,255,255,.3)', borderRadius: 999, padding: '7px 18px', fontSize: 11, letterSpacing: '.14em', fontWeight: 700 }}>NEXT STEP</span>
      <h1 style={{ fontSize: 42 }}>지금이 시작 타이밍입니다</h1>
      <p className="pd-muted" style={{ fontSize: 16, lineHeight: 1.7, maxWidth: 520 }}>{tgt ? `'${d.keyword}' ${tgt.rank}위에서 상위권까지, 어떤 순서로 올릴지 이 자료를 놓고 10분만 이야기 나눠 보시길 제안드립니다.` : `'${d.keyword}' 시장에서 어떤 순서로 상위권에 올릴지, 이 자료를 놓고 10분만 이야기 나눠 보시길 제안드립니다.`}</p>
      <div className="pd-next"><div><div className="l">무료 확인</div><div className="v">연관 키워드 현재 순위</div><div className="d">회신 주시면 함께 확인해 드립니다</div></div><div><div className="l">첫 상담</div><div className="v">10분 · 전화 또는 카톡</div></div><div><div className="l">문의</div><div className="v">{d.brand.name}{d.brand.owner ? ` · ${d.brand.owner}` : ''}</div><div className="d">{d.brand.phone || d.brand.email}</div></div></div>
      <div style={{ marginTop: 34, fontWeight: 800 }}>◆ {d.brand.nameEn} · {d.brand.name}</div>
    </div>
    <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 14, fontSize: 11, color: '#A7B1C6' }}>본 자료는 네이버 쇼핑 검색 결과의 공개 데이터를 바탕으로 작성되었습니다. 상품·키워드 정보를 함께 확인하면 더 정확한 안을 드릴 수 있습니다.</div>
  </div>);

  return <div className="pd">{pages}</div>;
}
export function docPageCount(d: Doc) { return d.target ? 10 : 9; }
