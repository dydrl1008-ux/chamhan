// 키워드 제안서 문서 — 서버/클라이언트 어디서나 렌더 (훅 없음). 각 .pd-page 가 A4 한 장. 인쇄·PNG·PDF 공용
// 구성: 표지 / 시장·상위상품 / 지수·포지셔닝 / (귀사 현재 위치) / 전략·진행 방안 / NEXT — 글은 한 줄씩, 숫자 위주
import type { Doc } from '@/lib/proposalDoc';
import { fmtWon, fmtCnt } from '@/lib/proposalDoc';

export const PD_CSS = `
.pd{word-break:keep-all;--ink:#0F172A;--muted:#64748B;--line:#E2E8F0;--soft:#F8FAFC;--blue:#2F4FC8;--blue-soft:#EEF2FD;--navy:#141B2D;--green:#2EB872;--orange:#E8740C;color:var(--ink);font-family:Pretendard,'IBM Plex Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
.pd *{box-sizing:border-box}
.pd mark{background:#FFF1A8;color:inherit;padding:0 4px;border-radius:3px;font-weight:700}
.pd-navy mark{background:rgba(111,212,151,.18);color:#6FD497}
.pd-fact mark{background:#DCE4FB}
.pd-page{width:827px;height:1170px;background:#fff;margin:0 auto 18px;padding:56px 60px 54px;position:relative;box-shadow:0 2px 14px rgba(0,0,0,.12);page-break-after:always;break-after:page;display:flex;flex-direction:column;gap:18px;overflow:hidden}
.pd-page.dark{background:linear-gradient(160deg,#101827,#1A2440);color:#fff}
.pd-foot{position:absolute;left:60px;right:60px;bottom:26px;display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}
.pd-muted{color:var(--muted)}
.pd-logo{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.08em;font-size:14px}
.pd-logo i{width:10px;height:10px;background:var(--blue);transform:rotate(45deg);display:inline-block}
.pd h1{font-size:40px;line-height:1.2;margin:14px 0 16px;letter-spacing:-.02em;font-weight:800}
/* 섹션 띠 */
.pd-sec{display:flex;align-items:center;gap:12px;border-bottom:2px solid var(--ink);padding-bottom:8px}
.pd-sec .n{width:30px;height:30px;border-radius:8px;background:var(--navy);color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none}
.pd-sec h2{font-size:20px;margin:0;font-weight:800;letter-spacing:-.01em}
.pd-sec .k{margin-left:auto;font-size:11px;letter-spacing:.14em;color:var(--blue);font-weight:700}
.pd-sub{font-size:12px;color:var(--muted);margin:-8px 0 0}
.pd-chip{display:inline-block;background:var(--blue-soft);color:var(--blue);font-weight:700;font-size:12px;padding:6px 14px;border-radius:999px}
.pd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.pd-stat{border:1px solid var(--line);border-radius:12px;padding:14px 12px;text-align:center}
.pd-stat .l{font-size:11px;color:var(--muted);font-weight:600}.pd-stat .v{font-size:26px;font-weight:800;margin:2px 0;font-variant-numeric:tabular-nums;line-height:1.2}.pd-stat .v small{font-size:12px;color:var(--muted);margin-left:2px}.pd-stat .d{font-size:11px;color:var(--muted)}
.pd-box{border:1px solid var(--line);border-radius:12px;padding:16px 20px}
.pd-box h4{margin:0 0 8px;font-size:13px;color:var(--muted);font-weight:700;letter-spacing:.02em}
.pd-tags span{display:inline-block;background:var(--blue);color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px;margin:0 6px 6px 0}
.pd-navy{background:var(--navy);color:#fff;border-radius:12px;padding:16px 22px;font-size:13px;line-height:1.6}
.pd-navy b.hl{color:#6FD497}
.pd-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.pd-g3 .l{font-size:11px;color:#A7B1C6;font-weight:600}.pd-g3 .v{font-size:22px;font-weight:800;color:#6FD497;margin:2px 0}.pd-g3 .d{font-size:11.5px;color:#C9D1E3;line-height:1.5}
.pd table{width:100%;border-collapse:collapse;font-size:12px}
.pd th{background:var(--navy);color:#fff;text-align:left;padding:8px 10px;font-weight:600;font-size:11px}
.pd td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.pd td.r,.pd th.r{text-align:right;font-variant-numeric:tabular-nums}
.pd tr.me td{background:var(--blue-soft);font-weight:700}
.pd-tbl{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.pd-th{width:34px;height:34px;border-radius:6px;object-fit:cover;background:var(--soft);border:1px solid var(--line);display:block}
.pd-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pd-big{font-size:24px;font-weight:800;line-height:1.2}.pd-big small{font-size:11px;color:var(--muted);font-weight:600;margin:0 4px}
.pd-idx{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pd-idx .c{border:1px solid var(--line);border-radius:10px;padding:12px 10px;text-align:center}
.pd-idx .c .v{font-size:22px;font-weight:800;color:var(--blue);line-height:1.1}.pd-idx .c .v small{font-size:11px;color:var(--muted);font-weight:600}
.pd-idx .c .bar{height:5px;background:var(--line);border-radius:3px;margin:8px 0 6px;overflow:hidden}.pd-idx .c .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--blue),#6FD497)}
.pd-idx .c .l{font-weight:700;font-size:12px}.pd-idx .c .d{font-size:10.5px;color:var(--muted)}
.pd-bars{display:flex;align-items:flex-end;gap:12px;height:96px;padding:6px 4px 0}
.pd-bars .b{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.pd-bars .b i{display:block;width:100%;background:#2E4A8C;border-radius:3px 3px 0 0}.pd-bars .b .n{font-size:11px;font-weight:700;margin-bottom:3px}.pd-bars .b .l{font-size:10px;color:var(--muted);margin-top:5px}
.pd-steps{display:grid;gap:8px}
.pd-steps .s{border:1px solid var(--line);border-radius:10px;padding:11px 16px;display:grid;grid-template-columns:64px 1fr;gap:12px;align-items:start}
.pd-steps .s b.k{color:var(--blue);font-size:11px;letter-spacing:.06em;padding-top:2px}
.pd-steps .s .t{font-weight:700;font-size:13px}.pd-steps .s .d{font-size:12px;color:#475569}
.pd-cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pd-cols3 .c{border:1px solid var(--line);border-radius:10px;padding:12px 14px}.pd-cols3 h5{color:var(--blue);font-size:14px;margin:0 0 2px}.pd-cols3 .d{font-size:11px;color:var(--muted);margin-bottom:6px}.pd-cols3 .i{font-size:12px;color:#334155}
.pd-now{display:grid;grid-template-columns:90px 1fr 170px;gap:16px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:16px}
.pd-now img,.pd-now .ph{width:90px;height:90px;border-radius:10px;object-fit:cover;background:var(--soft);border:1px solid var(--line);display:block}
.pd-now .nm{font-weight:700;font-size:14px;line-height:1.4}.pd-now .mt{display:flex;gap:14px;margin-top:6px;font-size:12.5px;color:#475569}.pd-now .mt b{color:var(--ink)}
.pd-now .rk{text-align:right;border-left:1px solid var(--line);padding-left:16px}.pd-now .rk .big{font-size:42px;font-weight:800;line-height:1}.pd-now .rk .big small{font-size:14px;color:var(--muted);font-weight:600}
.pd-fact{background:var(--soft);border-left:4px solid var(--blue);border-radius:6px;padding:9px 14px;font-size:12.5px}
.pd-opt{border:1px solid var(--line);border-radius:12px;padding:14px 16px}.pd-opt.rec{border-color:var(--blue);box-shadow:inset 0 0 0 1px var(--blue)}
.pd-opt .t{font-weight:800;font-size:14px;display:flex;align-items:center;gap:8px}.pd-opt .p{font-size:16px;font-weight:800;margin:4px 0 2px;color:var(--blue)}.pd-opt ul{margin:4px 0 0;padding-left:16px;font-size:12px;color:#475569}
.pd-next{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid rgba(255,255,255,.16);border-radius:12px;overflow:hidden;margin-top:30px}
.pd-next div{padding:18px 20px;border-right:1px solid rgba(255,255,255,.16)}.pd-next div:last-child{border-right:0}
.pd-next .l{font-size:11px;letter-spacing:.1em;color:#8FA0C6;font-weight:700;margin-bottom:6px}.pd-next .v{font-size:15px;font-weight:700}.pd-next .d{font-size:12px;color:#A7B1C6;margin-top:2px}
@media print{.pd-page{box-shadow:none;margin:0;height:297mm;width:210mm;padding:16mm}body{background:#fff}}
`;

/** 숫자·핵심어 자동 하이라이트: 12,300원 / 1,284개 / 47위 / 35% / 「…」 */
const Hl = ({ t }: { t: string }) => <>{t.split(/(\d[\d,.]*\s?(?:원|개|위|%|계단|일)|「[^」]+」)/g).map((x, i) => /^(\d|「)/.test(x) ? <mark key={i}>{x.replace(/[「」]/g, '')}</mark> : x)}</>;
const Sec = ({ n, k, t, sub }: { n: string; k: string; t: string; sub?: string }) => <><div className="pd-sec"><span className="n">{n}</span><h2>{t}</h2><span className="k">{k}</span></div>{sub && <p className="pd-sub">{sub}</p>}</>;

export default function ProposalDoc({ d, total, img = (u: string) => u }: { d: Doc; total?: number; img?: (u: string) => string }) {
  const T = total ?? docPageCount(d); const tgt = d.target; const ad = (p: any) => /광고|ad/i.test(String(p.상품유형 ?? ''));
  const foot = (i: number) => <div className="pd-foot"><span>{d.brand.name} · {d.keyword} 쇼핑 노출 제안</span><span>{i} / {T}</span></div>;
  const pages: JSX.Element[] = []; let pn = 1;

  // 1 표지
  pages.push(<div className="pd-page" key="cover" style={{ gap: 0 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div className="pd-logo"><i />{d.brand.nameEn}</div><span className="pd-muted" style={{ fontSize: 12 }}>{d.date}</span></div>
    <div style={{ marginTop: 150 }}>
      <span className="pd-chip">네이버쇼핑 노출 진단 &amp; 상위노출 제안</span>
      <h1>'{d.keyword}'<br />상위권까지 가는 순서</h1>
      <p className="pd-muted" style={{ fontSize: 16, lineHeight: 1.6, margin: '0 0 30px' }}>상위 {d.n}개 상품의 실제 데이터로 본<br />이 시장의 진입 기준과 단계별 실행안.</p>
      <div className="pd-box" style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(3,auto)', gap: 34, padding: '18px 30px' }}>
        <div><div className="pd-big">{d.n}<small>개</small></div><div className="pd-muted" style={{ fontSize: 11 }}>분석 상품</div></div>
        <div><div className="pd-big">{fmtWon(d.avgPrice10)}</div><div className="pd-muted" style={{ fontSize: 11 }}>상위 10개 평균가</div></div>
        <div><div className="pd-big">{fmtCnt(d.avgReview10)}<small>개</small></div><div className="pd-muted" style={{ fontSize: 11 }}>상위 10개 평균 리뷰</div></div>
      </div>
    </div>
    <div style={{ marginTop: 'auto', background: 'var(--soft)', margin: '0 -60px -54px', padding: '24px 60px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <div><div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--blue)', fontWeight: 700 }}>{tgt ? '수신' : '분석 대상'}</div><div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{tgt ? `${tgt.mallName} 귀중` : `'${d.keyword}' 쇼핑 시장`}</div><div className="pd-muted" style={{ fontSize: 12 }}>{tgt ? `'${d.keyword}' 검색 결과 현재 ${tgt.rank}위` : '네이버 쇼핑 상위 상품 분석'}</div></div>
      <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800 }}>{d.brand.name}</div><div className="pd-muted" style={{ fontSize: 12 }}>{d.brand.owner ? `담당 ${d.brand.owner}${d.brand.phone ? ' · ' + d.brand.phone : ''}` : d.brand.email}</div></div>
    </div>
  </div>);

  // 2 시장 + 상위 상품
  pn++;
  pages.push(<div className="pd-page" key="market">
    <Sec n="01" k="MARKET" t={`'${d.keyword}' 시장은 이렇습니다`} sub="네이버쇼핑 검색 결과 상위 상품 실측" />
    <div className="pd-stats">
      <div className="pd-stat"><div className="l">상위 10개 평균가</div><div className="v">{fmtCnt(d.avgPrice10)}<small>원</small></div><div className="d">범위 {fmtWon(d.minPrice10)}~{fmtWon(d.maxPrice10)}</div></div>
      <div className="pd-stat"><div className="l">상위 10개 평균 리뷰</div><div className="v">{fmtCnt(d.avgReview10)}<small>개</small></div><div className="d">중간값 {fmtCnt(d.medianReview10)}개</div></div>
      <div className="pd-stat"><div className="l">1페이지 광고 상품</div><div className="v">{d.adCount10}<small>/10</small></div><div className="d">나머지는 자연 노출</div></div>
      <div className="pd-stat"><div className="l">신상품 비율</div><div className="v">{d.newRate}<small>%</small></div><div className="d">최근 90일 등록</div></div>
    </div>
    <div className="pd-navy"><div className="pd-g3">
      <div><div className="l">경쟁 강도</div><div className="v">{d.competition.level}</div><div className="d"><Hl t={d.competition.why} /></div></div>
      <div><div className="l">진입 장벽</div><div className="v">{d.barrier.level}</div><div className="d"><Hl t={d.barrier.why} /></div></div>
      <div><div className="l">진입 타이밍</div><div className="v">{d.timing.level}</div><div className="d"><Hl t={d.timing.why} /></div></div>
    </div></div>
    {d.related.length > 0 && <div className="pd-box"><h4>함께 노출되는 연관 키워드</h4><div className="pd-tags">{d.related.map(t => <span key={t}>{t}</span>)}</div></div>}
    <Sec n="02" k="TOP 10" t="지금 1페이지에 있는 상품" />
    <div className="pd-tbl"><table><thead><tr><th style={{ width: 44 }}>순위</th><th style={{ width: 50 }}></th><th>상품</th><th className="r">가격</th><th className="r">리뷰</th><th style={{ width: 50 }}>구분</th></tr></thead><tbody>
      {d.top.map(p => <tr key={p.rank} className={tgt && p.rank === tgt.rank ? 'me' : ''}><td style={{ color: 'var(--muted)', fontWeight: 700 }}>{p.rank}</td><td>{p.imageUrl ? <img className="pd-th" src={img(p.imageUrl)} alt="" /> : <div className="pd-th" />}</td><td><div style={{ maxWidth: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{p.productTitle}</div><div className="pd-muted" style={{ fontSize: 10.5 }}>{p.mallName}</div></td><td className="r">{fmtWon(p.lowPrice)}</td><td className="r">{fmtCnt(p.reviewCount)}</td><td>{ad(p) ? <span style={{ color: 'var(--orange)', fontWeight: 700, fontSize: 11 }}>광고</span> : <span className="pd-muted" style={{ fontSize: 11 }}>자연</span>}</td></tr>)}
      {tgt && tgt.rank > 10 && <tr className="me"><td>{tgt.rank}</td><td>{tgt.image ? <img className="pd-th" src={img(tgt.image)} alt="" /> : <div className="pd-th" />}</td><td><div style={{ maxWidth: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tgt.title}</div><div style={{ fontSize: 10.5, fontWeight: 500 }}>{tgt.mallName} (귀사)</div></td><td className="r">{tgt.price ? fmtWon(tgt.price) : '-'}</td><td className="r">{fmtCnt(tgt.reviews)}</td><td></td></tr>}
    </tbody></table></div>
    {foot(pn)}
  </div>);

  // 3 지수 + 포지셔닝
  pn++;
  const R = 86, cx = 130, cy = 118; const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 6; const r = (v / 5) * R; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const mx = Math.max(...d.priceBands.map(b => b.count), 1);
  pages.push(<div className="pd-page" key="index">
    <Sec n="03" k="INDEX" t="상위 상품은 무엇이 강한가" sub="상위 10개 상품 지수 평균 (5점 만점)" />
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'center' }}>
      <svg width={260} height={240} viewBox="0 0 260 240">
        {[1, 2, 3, 4, 5].map(l => <polygon key={l} points={[0, 1, 2, 3, 4, 5].map(i => pt(i, l).join(',')).join(' ')} fill="none" stroke="#E2E8F0" />)}
        {[0, 1, 2, 3, 4, 5].map(i => <line key={i} x1={cx} y1={cy} x2={pt(i, 5)[0]} y2={pt(i, 5)[1]} stroke="#E2E8F0" />)}
        <polygon points={d.axes.map((a, i) => pt(i, a.v).join(',')).join(' ')} fill="rgba(47,79,200,.18)" stroke="#2F4FC8" strokeWidth={2} />
        {d.axes.map((a, i) => { const [x, y] = pt(i, a.v); const [lx, ly] = pt(i, 6.4); return <g key={a.key}><circle cx={x} cy={y} r={3} fill="#2F4FC8" /><text x={lx} y={ly - 3} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#0F172A">{a.label}</text><text x={lx} y={ly + 9} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#2F4FC8">{a.v}</text></g>; })}
      </svg>
      <div className="pd-idx">{d.axes.map(a => <div className="c" key={a.key}><div className="v">{a.v}<small> /5</small></div><div className="bar"><i style={{ width: `${(a.v / 5) * 100}%` }} /></div><div className="l">{a.label}</div><div className="d">{a.desc}</div></div>)}</div>
    </div>
    <div className="pd-navy">상위 상품은 <b className="hl">{d.strongAxis}</b>가 가장 높습니다. 신규 상품은 노출·클릭으로 {d.strongAxis}부터 올려야 1페이지 조건이 맞춰집니다.</div>
    <Sec n="04" k="POSITION" t="어느 가격·리뷰 구간에 들어가야 하나" />
    <div className="pd-two">
      <div className="pd-box"><h4>가격 분포 (상위 {d.n}개 · 구간별 상품 수)</h4><div className="pd-bars">{d.priceBands.map((b, i) => <div className="b" key={i}><div className="n">{b.count}</div><i style={{ height: `${Math.max(4, (b.count / mx) * 66)}px` }} /><div className="l">{b.label}</div></div>)}</div></div>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="pd-box"><h4>진입 가격대</h4><div className="pd-big">{fmtWon(d.minPrice10)}<small>~</small>{fmtWon(d.avgPrice10)}</div><div style={{ fontSize: 11.5 }}><Hl t="「상위 10개 최저가 ~ 평균가」 안에 두는 것이 안전" /></div></div>
        <div className="pd-box"><h4>리뷰 장벽</h4><div className="pd-big">{fmtCnt(d.avgReview10)}개<small>상위 평균</small></div><div style={{ fontSize: 11.5 }}><Hl t="이 수준에 가까워질수록 「자연 순위가 안정」" /></div></div>
      </div>
    </div>
    <div className="pd-steps">
      <div className="s"><b className="k">진입기</b><div><div className="t"><Hl t="가격을 진입 가격대에 맞추고, 「노출로 첫 구매」를 만든다" /></div></div></div>
      <div className="s"><b className="k">성장기</b><div><div className="t"><Hl t={`구매를 리뷰로 쌓아 ${fmtCnt(d.avgReview10)}개 수준에 가까이 간다`} /></div></div></div>
      <div className="s"><b className="k">안정기</b><div><div className="t"><Hl t="자연 순위가 자리 잡으면 「연관 키워드」로 노출을 넓힌다" /></div></div></div>
    </div>
    {foot(pn)}
  </div>);

  // 4 귀사 현재 위치
  if (tgt) { pn++;
    pages.push(<div className="pd-page" key="you">
      <Sec n="05" k="YOUR POSITION" t={`${tgt.mallName} 현재 위치`} sub={`'${d.keyword}' 검색 결과 기준`} />
      <div className="pd-now">{tgt.image ? <img src={img(tgt.image)} alt="" /> : <div className="ph" />}<div style={{ minWidth: 0 }}><div className="nm">{tgt.title}</div><div className="mt"><span>가격 <b>{tgt.price ? fmtWon(tgt.price) : '-'}</b></span><span>리뷰 <b>{fmtCnt(tgt.reviews)}</b></span></div></div><div className="rk"><div className="pd-muted" style={{ fontSize: 11 }}>현재 순위</div><div className="big">{tgt.rank}<small>위</small></div><div className="pd-muted" style={{ fontSize: 11 }}>{tgt.rank > 40 ? '1페이지(40위) 밖' : tgt.rank > 10 ? '1페이지 · 10위 밖' : '상위 10위'}</div></div></div>
      <div className="pd-tbl"><table><thead><tr><th></th><th className="r">귀사</th><th className="r">상위 10개 평균</th><th className="r">차이</th></tr></thead><tbody>
        <tr><td>가격</td><td className="r" style={{ fontWeight: 700 }}>{tgt.price ? fmtWon(tgt.price) : '-'}</td><td className="r">{fmtWon(d.avgPrice10)}</td><td className="r">{tgt.price ? (tgt.price <= d.avgPrice10 ? '평균 이하 · 경쟁력 있음' : `+${fmtWon(tgt.price - d.avgPrice10)}`) : '-'}</td></tr>
        <tr><td>리뷰</td><td className="r" style={{ fontWeight: 700 }}>{fmtCnt(tgt.reviews)}개</td><td className="r">{fmtCnt(d.avgReview10)}개</td><td className="r">{tgt.reviews >= d.avgReview10 ? '평균 이상' : `-${fmtCnt(d.avgReview10 - tgt.reviews)}개`}</td></tr>
        <tr><td>순위</td><td className="r" style={{ fontWeight: 700 }}>{tgt.rank}위</td><td className="r">1~10위</td><td className="r">{tgt.rank > 10 ? `${tgt.rank - 10}계단` : '진입'}</td></tr>
      </tbody></table></div>
      <div style={{ display: 'grid', gap: 8 }}>{d.targetFacts.map((f, i) => <div className="pd-fact" key={i}><Hl t={f} /></div>)}</div>
      <div className="pd-two">
        {[{ l: '가격', a: tgt.price, b: d.avgPrice10, f: fmtWon, good: tgt.price > 0 && tgt.price <= d.avgPrice10 * 1.1 }, { l: '리뷰', a: tgt.reviews, b: d.avgReview10, f: (n: number) => fmtCnt(n) + '개', good: tgt.reviews >= d.avgReview10 * 0.7 }].map(c => { const m = Math.max(c.a, c.b, 1); return <div className="pd-box" key={c.l}><h4>{c.l} 비교</h4>
          {[['귀사', c.a, 'var(--blue)'], ['상위 10개 평균', c.b, '#CBD5E1']].map(([n, v, col]) => <div key={String(n)} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 80px', gap: 8, alignItems: 'center', fontSize: 12, margin: '6px 0' }}><span className="pd-muted">{n}</span><div style={{ height: 14, background: 'var(--soft)', borderRadius: 7, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${(Number(v) / m) * 100}%`, background: String(col), borderRadius: 7 }} /></div><b style={{ textAlign: 'right' }}>{c.f(Number(v))}</b></div>)}
          <div style={{ fontSize: 12, marginTop: 6 }}>{c.good ? <mark>상위권과 같은 구간</mark> : <span className="pd-muted">상위권과 차이 있음 — 노출 후 보완</span>}</div></div>; })}
      </div>
      <div className="pd-navy">차이는 상품이 아니라 <b className="hl">검색 결과에서 보이는 위치</b>입니다. 위치가 올라가면 같은 상품으로 클릭·구매·리뷰가 따라옵니다.</div>
      <div className="pd-two" style={{ marginTop: 'auto' }}>
        <div className="pd-box"><h4>이 상품에 제안하는 순서</h4><div className="pd-steps" style={{ gap: 6 }}>
          <div className="s" style={{ padding: '8px 12px', gridTemplateColumns: '44px 1fr' }}><b className="k">1단계</b><div><div className="t"><Hl t={`「${d.keyword}」 ${tgt.rank}위 → 1페이지 진입`} /></div></div></div>
          <div className="s" style={{ padding: '8px 12px', gridTemplateColumns: '44px 1fr' }}><b className="k">2단계</b><div><div className="t"><Hl t={`노출로 생긴 구매를 리뷰로 — 상위 평균 ${fmtCnt(d.avgReview10)}개 방향`} /></div></div></div>
          <div className="s" style={{ padding: '8px 12px', gridTemplateColumns: '44px 1fr' }}><b className="k">3단계</b><div><div className="t"><Hl t="「연관 키워드」로 노출 범위 확장" /></div></div></div>
        </div></div>
        <div className="pd-box"><h4>추가로 노출될 수 있는 키워드</h4>{d.related.length ? <div className="pd-tags">{d.related.map(t => <span key={t}>{t}</span>)}</div> : <div className="pd-muted" style={{ fontSize: 12 }}>상담 시 함께 확인</div>}<div className="pd-muted" style={{ fontSize: 11.5, marginTop: 4 }}>회신 주시면 이 키워드들의 현재 순위를 무료로 확인해 드립니다.</div></div>
      </div>
      {foot(pn)}
    </div>);
  }

  // 5 전략 + 진행 방안
  pn++; const s1 = tgt ? '06' : '05', s2 = tgt ? '07' : '06';
  pages.push(<div className="pd-page" key="plan">
    <Sec n={s1} k="HOW RANKING WORKS" t="순위는 세 가지로 정해집니다" />
    <div className="pd-cols3">
      <div className="c"><h5>적합도</h5><div className="d">검색어와 상품이 맞는가</div><div className="i">상품명 키워드 · 카테고리 · 속성</div></div>
      <div className="c"><h5>인기도</h5><div className="d">사람들이 찾는가</div><div className="i">클릭 · 찜 · 판매 · 리뷰 수</div></div>
      <div className="c"><h5>신뢰도</h5><div className="d">믿고 사는가</div><div className="i">평점 · 스토어 지수 · 페널티</div></div>
    </div>
    <div className="pd-navy">이 시장 1페이지는 평균 리뷰 <b className="hl">{fmtCnt(d.avgReview10)}개</b>로 인기도·신뢰도가 이미 높습니다. 신규는 <b className="hl">노출 → 클릭·구매(인기도) → 리뷰(신뢰도)</b> 순서로 채워야 합니다.</div>
    <Sec n={s2} k="HOW IT WORKS" t="상위노출, 이렇게 진행합니다" sub="실제 검색 유입으로 인기도 신호를 만들어 자연 검색 순위에 반영하는 방식 · 광고 영역 아님" />
    <div className="pd-steps">
      <div className="s"><b className="k">시작</b><div><div className="t">상품·키워드 등록, 시작 순위 기록</div><div className="d">대표 키워드 1개 + 필요 시 연관 키워드</div></div></div>
      <div className="s"><b className="k">매일</b><div><div className="t"><Hl t={`「${d.keyword} 검색 유입」 진행 · 매일 아침 순위 확인`} /></div><div className="d">실제 사용자가 검색해 귀사 상품으로 들어가는 유입을 매일 일정량</div></div></div>
      <div className="s"><b className="k">진행 중</b><div><div className="t">순위 변동 시 담당자 연락</div><div className="d">크게 움직이면 바로 안내 · 궁금한 건 언제든 확인</div></div></div>
      <div className="s"><b className="k">종료일</b><div><div className="t"><Hl t="「기간 리포트」 전달" /></div><div className="d">시작 → 현재 순위 · 최고 순위 · 일별 순위표 · 연장은 리포트 보고 결정</div></div></div>
    </div>
    <div className="pd-box" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'center' }}>
      <div><h4 style={{ marginBottom: 4 }}>종료일에 받으시는 리포트 (양식 예시)</h4><div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>시작 순위 → 현재 순위, 기간 중 최고 순위, 날짜별 순위표가 한 장으로 정리됩니다.<br /><Hl t="연장 여부는 「리포트를 보고」 결정하시면 됩니다." /></div></div>
      <svg viewBox="0 0 300 110" style={{ width: 300, height: 110, display: 'block', background: 'var(--soft)', borderRadius: 8 }}>
        <text x="10" y="16" fontSize="10" fill="#64748B">순위 추이 (양식 예시)</text>
        {[1, 20, 40].map(v => <g key={v}><line x1="34" x2="290" y1={22 + (v - 1) * 1.6} y2={22 + (v - 1) * 1.6} stroke="#E2E8F0" /><text x="30" y={25 + (v - 1) * 1.6} fontSize="9" textAnchor="end" fill="#94A3B8">{v}위</text></g>)}
        <polyline fill="none" stroke="#2F4FC8" strokeWidth="2" points="40,90 68,84 96,74 124,60 152,46 180,38 208,32 236,30 264,28 288,28" />
        <circle cx="288" cy="28" r="3" fill="#2F4FC8" /><text x="40" y="104" fontSize="9" fill="#64748B">시작</text><text x="288" y="104" fontSize="9" fill="#64748B" textAnchor="end">종료</text>
      </svg>
    </div>
    <div className="pd-two">
      <div className="pd-opt"><div className="t">기본</div><div className="p">담당자 안내</div><ul><li>키워드 1개 · 10일</li><li>일일 순위 확인 · 종료 리포트</li></ul></div>
      <div className="pd-opt rec"><div className="t">권장 <span className="pd-chip" style={{ padding: '2px 10px', fontSize: 11 }}>같은 키워드 다수 진행</span></div><div className="p">담당자 안내</div><ul><li>키워드 1개 · 10일 · 유입량 상향</li><li>연관 키워드 1개 순위 추적 포함</li></ul></div>
    </div>
    <div className="pd-muted" style={{ fontSize: 10.5, marginTop: 'auto' }}>※ 결과는 키워드 경쟁도·상품 반응에 따라 다르며, 특정 순위를 보장하는 서비스가 아닙니다.</div>
    {foot(pn)}
  </div>);

  // 6 NEXT
  pages.push(<div className="pd-page dark" key="next" style={{ gap: 0 }}>
    <div style={{ marginTop: 300 }}>
      <span style={{ display: 'inline-block', border: '1px solid rgba(255,255,255,.3)', borderRadius: 999, padding: '7px 18px', fontSize: 11, letterSpacing: '.14em', fontWeight: 700 }}>NEXT STEP</span>
      <h1 style={{ fontSize: 40 }}>지금이 시작 타이밍입니다</h1>
      <p style={{ fontSize: 16, lineHeight: 1.7, maxWidth: 520, color: '#A7B1C6', margin: 0 }}>{tgt ? `'${d.keyword}' ${tgt.rank}위에서 상위권까지, 어떤 순서로 올릴지` : `'${d.keyword}' 시장에서 어떤 순서로 상위권에 올릴지`}<br />이 자료를 놓고 10분만 이야기 나눠 보시길 제안드립니다.</p>
      <div className="pd-next"><div><div className="l">무료 확인</div><div className="v">연관 키워드 현재 순위</div><div className="d">회신 주시면 함께 확인해 드립니다</div></div><div><div className="l">첫 상담</div><div className="v">10분 · 전화 또는 카톡</div></div><div><div className="l">문의</div><div className="v">{d.brand.name}{d.brand.owner ? ` · ${d.brand.owner}` : ''}</div><div className="d">{d.brand.phone || d.brand.email}</div></div></div>
      <div style={{ marginTop: 30, fontWeight: 800 }}>◆ {d.brand.nameEn} · {d.brand.name}</div>
    </div>
    <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 12, fontSize: 11, color: '#A7B1C6' }}>본 자료는 네이버 쇼핑 검색 결과의 공개 데이터를 바탕으로 작성되었습니다.</div>
  </div>);

  return <div className="pd">{pages}</div>;
}
export function docPageCount(d: Doc) { return d.target ? 6 : 5; }
