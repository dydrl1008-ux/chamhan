// 키워드 제안서 — 설득 구조(문제 → 증거 → 조건 → 해결·옵션 → 행동) 6장. 서버/클라이언트 공용, 훅 없음. .pd-page = A4 한 장
import type { Doc } from '@/lib/proposalDoc';
import { fmtWon, fmtCnt } from '@/lib/proposalDoc';

export const PD_CSS = `
.pd{word-break:keep-all;--ink:#111111;--ink2:#333333;--muted:#777777;--line:#E8E8E8;--soft:#F5F6F7;--blue:#03C75A;--blue-soft:#E8F8EE;--navy:#141414;--lime:#03C75A;--mark:#03C75A;--red:#E5484D;--red-soft:#FDECEC;--green:#03C75A;--green-soft:#E8F8EE;color:var(--ink);font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
.pd *{box-sizing:border-box}
.pd-page{width:827px;height:1170px;background:#fff;margin:0 auto 18px;padding:0;position:relative;box-shadow:0 2px 14px rgba(0,0,0,.12);page-break-after:always;break-after:page;overflow:hidden;display:flex;flex-direction:column}
.pd-page.dark{background:#111;color:#fff}
.pd-in{padding:52px 60px 16px;display:flex;flex-direction:column;gap:18px;flex:1;justify-content:space-between}
.pd-foot{margin-top:auto;padding:14px 60px 22px;display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);border-top:1px solid var(--line)}
.pd-page.dark .pd-foot{border-color:rgba(255,255,255,.12);color:#8E97AD}
.pd mark{background:var(--mark);color:#fff;padding:1px 6px;border-radius:3px;font-weight:800;white-space:nowrap}
.pd-navy mark,.pd-page.dark mark{background:var(--lime);color:#fff}
.pd-fact mark{background:var(--blue-soft);color:#027A38}
/* 섹션 헤더 */
.pd-sec{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:end;border-bottom:3px solid var(--ink);padding-bottom:10px}
.pd-sec .n{font-size:11px;letter-spacing:.14em;color:#fff;background:var(--blue);font-weight:800;padding:4px 10px;border-radius:4px;align-self:center}
.pd-sec h2{font-size:24px;margin:0;font-weight:800;letter-spacing:-.02em;line-height:1.2}
.pd-sec .k{font-size:11px;color:var(--muted)}
.pd-lead{font-size:13.5px;color:var(--ink2);margin:-6px 0 0;line-height:1.6}
.pd-muted{color:var(--muted)}
.pd-logo{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.1em;font-size:13px}
.pd-logo i{width:9px;height:9px;background:var(--blue);transform:rotate(45deg);display:inline-block}
.pd-page.dark .pd-logo i{background:var(--lime)}
.pd-huge{font-size:120px;font-weight:900;letter-spacing:-.04em;line-height:.95;font-variant-numeric:tabular-nums}
.pd-huge small{font-size:30px;letter-spacing:0;margin-left:6px;font-weight:800}
/* 블록 */
.pd-box{border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.pd-box h4{margin:0 0 10px;font-size:11px;letter-spacing:.1em;color:var(--muted);font-weight:800;text-transform:uppercase}
.pd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--line);border-radius:14px;overflow:hidden}
.pd-stat{padding:16px 18px;border-right:1px solid var(--line)}.pd-stat:last-child{border-right:0}
.pd-stat .l{font-size:11px;color:var(--muted);font-weight:700}.pd-stat .v{font-size:28px;font-weight:900;margin:2px 0;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.15}.pd-stat .v small{font-size:12px;color:var(--muted);margin-left:2px;font-weight:700}.pd-stat .d{font-size:11px;color:var(--muted)}
.pd-navy{background:var(--navy);color:#fff;border-radius:14px;padding:18px 22px;font-size:13.5px;line-height:1.65}
.pd-navy .t{font-size:11px;letter-spacing:.14em;color:var(--lime);font-weight:800;margin-bottom:6px}
.pd-phone{width:300px;background:#111;border-radius:34px;padding:12px;box-shadow:0 20px 50px rgba(0,0,0,.5);border:3px solid #2a2a2a}
.pd-phone .scr{background:#fff;border-radius:24px;overflow:hidden;color:#111}
.pd-phone .q{margin:16px 14px 8px;border:2px solid #03C75A;border-radius:10px;padding:9px 12px;font-size:14px;font-weight:700}
.pd-phone .tabs{display:flex;gap:12px;padding:0 14px 8px;font-size:11px;color:#999;border-bottom:1px solid #eee}.pd-phone .tabs b{color:#111;border-bottom:2px solid #111;padding-bottom:6px}
.pd-phone .hd{display:flex;justify-content:space-between;padding:10px 14px 4px;font-size:12px;font-weight:800}.pd-phone .hd span{color:#03C75A;font-size:10px}
.pd-phone .row{display:grid;grid-template-columns:22px 40px 1fr;gap:8px;align-items:center;padding:7px 14px;border-bottom:1px solid #F0F0F0;font-size:10.5px}
.pd-phone .row .rk{font-weight:900;color:#999;font-size:11px}.pd-phone .row .th{width:40px;height:40px;border-radius:6px;background:#EEE;object-fit:cover}
.pd-phone .row .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}.pd-phone .row .m{color:#888;font-size:9.5px}
.pd-phone .row.me{background:#E8F8EE;outline:2px solid #03C75A;outline-offset:-2px}.pd-phone .row.me .rk{color:#03C75A}
.pd-phone .gap{text-align:center;color:#BBB;font-size:10px;letter-spacing:.3em;padding:6px}
.pd-phone .tag{margin:10px auto 14px;width:max-content;background:#111;color:#fff;font-size:11px;font-weight:800;padding:7px 14px;border-radius:6px}
.pd-fact{background:var(--soft);border-radius:10px;padding:11px 14px;font-size:12.5px;display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:start}
.pd-fact i{width:18px;height:18px;border-radius:50%;background:var(--ink);color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;font-style:normal;margin-top:1px}
.pd-fact.ok i{background:var(--green)}.pd-fact.no i{background:var(--red)}
.pd table{width:100%;border-collapse:collapse;font-size:12px}
.pd th{text-align:left;padding:8px 10px;font-weight:700;font-size:10.5px;color:var(--muted);border-bottom:2px solid var(--ink);letter-spacing:.04em}
.pd td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.pd td.r,.pd th.r{text-align:right;font-variant-numeric:tabular-nums}
.pd tr.me td{background:var(--mark)}
.pd-th{width:32px;height:32px;border-radius:6px;object-fit:cover;background:var(--soft);border:1px solid var(--line);display:block}
.pd-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pd-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.pd-big{font-size:26px;font-weight:900;letter-spacing:-.02em;line-height:1.15}.pd-big small{font-size:11px;color:var(--muted);font-weight:700;margin:0 4px;letter-spacing:0}
.pd-bar{display:grid;grid-template-columns:96px 1fr 84px;gap:10px;align-items:center;font-size:12px;margin:7px 0}
.pd-bar .tr{height:12px;background:var(--soft);border-radius:6px;overflow:hidden}.pd-bar .tr i{display:block;height:100%;border-radius:6px}
.pd-bar b{text-align:right;font-variant-numeric:tabular-nums}
.pd-idx{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pd-idx .c{border:1px solid var(--line);border-radius:10px;padding:10px 10px;text-align:center}
.pd-idx .c .v{font-size:20px;font-weight:900;line-height:1.1}.pd-idx .c .v small{font-size:10px;color:var(--muted);font-weight:700}
.pd-idx .c .bar{height:4px;background:var(--line);border-radius:2px;margin:7px 0 5px;overflow:hidden}.pd-idx .c .bar i{display:block;height:100%;background:var(--blue)}
.pd-idx .c .l{font-weight:800;font-size:11.5px}.pd-idx .c .d{font-size:10px;color:var(--muted)}
.pd-bars{display:flex;align-items:flex-end;gap:10px;height:90px;padding:4px 2px 0}
.pd-bars .b{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.pd-bars .b i{display:block;width:100%;background:var(--ink);border-radius:3px 3px 0 0}.pd-bars .b .n{font-size:11px;font-weight:800;margin-bottom:3px}.pd-bars .b .l{font-size:10px;color:var(--muted);margin-top:5px}
.pd-tl{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative}
.pd-tl:before{content:"";position:absolute;left:12%;right:12%;top:13px;height:2px;background:var(--line)}
.pd-tl .s{text-align:center;padding:0 8px;position:relative}
.pd-tl .s i{width:26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;font-style:normal;position:relative}
.pd-tl .s .t{font-weight:800;font-size:12.5px;margin-top:8px}.pd-tl .s .d{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.45}
.pd-opt{border:1.5px solid var(--line);border-radius:14px;padding:16px 18px;position:relative}
.pd-opt.rec{border-color:#111;background:#111;color:#fff}
.pd-opt .tag{position:absolute;top:-10px;left:16px;background:var(--lime);color:#fff;font-size:10.5px;font-weight:800;padding:2px 10px;border-radius:999px}
.pd-opt .t{font-weight:800;font-size:13px;letter-spacing:.04em}.pd-opt .p{font-size:22px;font-weight:900;margin:4px 0 6px;letter-spacing:-.02em}
.pd-opt ul{margin:0;padding-left:16px;font-size:12px;line-height:1.7}.pd-opt.rec ul{color:#C9D0E3}.pd-opt .pd-muted{color:#8E97AD}
.pd-faq{display:grid;gap:6px}.pd-faq div{display:grid;grid-template-columns:18px 1fr;gap:8px;font-size:12px;align-items:start}.pd-faq b{color:var(--blue)}
.pd-cta{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-top:26px}
.pd-cta .c{border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:22px 24px}
.pd-cta .l{font-size:11px;letter-spacing:.14em;color:var(--lime);font-weight:800;margin-bottom:8px}
.pd-cta .c.g{background:var(--lime);border-color:var(--lime)}.pd-cta .c.g .l{color:#fff;opacity:.85}.pd-cta .c.g .d{color:#F0FFF5}.pd-cta .v{font-size:20px;font-weight:800;line-height:1.3}.pd-cta .d{font-size:12.5px;color:#A9B1C6;margin-top:8px;line-height:1.6}
@media print{.pd-page{box-shadow:none;margin:0;height:297mm;width:210mm}body{background:#fff}}
`;

/** 숫자·핵심어 자동 하이라이트: 12,300원 / 1,284개 / 47위 / 35% / 「…」 */
const Hl = ({ t }: { t: string }) => <>{t.split(/(\d[\d,.]*\s?(?:원|개|위|%|계단|일)|「[^」]+」)/g).map((x, i) => /^(\d|「)/.test(x) ? <mark key={i}>{x.replace(/[「」]/g, '')}</mark> : x)}</>;
const Sec = ({ n, t, k, lead }: { n: string; t: string; k: string; lead?: string }) => <><div className="pd-sec"><span className="n">{n}</span><h2>{t}</h2><span className="k">{k}</span></div>{lead && <p className="pd-lead"><Hl t={lead} /></p>}</>;

export default function ProposalDoc({ d, total, img = (u: string) => u }: { d: Doc; total?: number; img?: (u: string) => string }) {
  const T = total ?? docPageCount(d); const tgt = d.target; const ad = (p: any) => /광고|ad/i.test(String(p.상품유형 ?? ''));
  const foot = (i: number) => <div className="pd-foot"><span>{d.brand.name} · '{d.keyword}' 상위노출 제안</span><span>{i} / {T}</span></div>;
  const pages: JSX.Element[] = []; let pn = 1;
  const price = (v: string) => v || '담당자 안내';

  // 1 표지 — 검정 + 초록, 헤드라인 + 폰 목업
  const phone = <div className="pd-phone"><div className="scr">
    <div className="q">{d.keyword}</div>
    <div className="tabs"><b>통합</b><span>쇼핑</span><span>블로그</span><span>카페</span><span>이미지</span></div>
    <div className="hd">쇼핑 <span>{tgt ? '현재 순위' : '상위 상품'}</span></div>
    {d.top.slice(0, 4).map(p => <div className="row" key={p.rank}><span className="rk">{p.rank}</span>{p.imageUrl ? <img className="th" src={img(p.imageUrl)} alt="" /> : <div className="th" />}<div style={{ minWidth: 0 }}><div className="t">{p.productTitle}</div><div className="m">{fmtWon(p.lowPrice)} · 리뷰 {fmtCnt(p.reviewCount)}</div></div></div>)}
    {tgt ? <><div className="gap">· · ·</div><div className="row me"><span className="rk">{tgt.rank > 100 ? '100+' : tgt.rank}</span>{tgt.image ? <img className="th" src={img(tgt.image)} alt="" /> : <div className="th" />}<div style={{ minWidth: 0 }}><div className="t">{tgt.title}</div><div className="m">{tgt.price ? fmtWon(tgt.price) + ' · ' : ''}리뷰 {fmtCnt(tgt.reviews)} · 귀사</div></div></div></> : <div className="row"><span className="rk">5</span><div className="th" /><div style={{ minWidth: 0 }}><div className="t">{d.top[4]?.productTitle ?? ''}</div><div className="m">{d.top[4] ? fmtWon(d.top[4].lowPrice) + ' · 리뷰 ' + fmtCnt(d.top[4].reviewCount) : ''}</div></div></div>}
    <div className="tag">{tgt ? `${tgt.rank > 100 ? '100위 밖' : tgt.rank + '위'} → 첫 화면` : '첫 화면 진입 조건'}</div>
  </div></div>;
  pages.push(<div className="pd-page dark" key="cover">
    <div className="pd-in" style={{ gap: 0, justifyContent: 'flex-start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div className="pd-logo"><i />{d.brand.nameEn}</div><span style={{ fontSize: 12, color: '#8E97AD' }}>{d.date}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 30, alignItems: 'center', margin: 'auto 0' }}>
        <div>
          <div style={{ display: 'inline-block', background: 'var(--lime)', color: '#fff', fontSize: 11, letterSpacing: '.14em', fontWeight: 800, padding: '6px 12px', borderRadius: 4 }}>{tgt ? `${tgt.mallName} 귀중` : '네이버쇼핑 상위노출'}</div>
          <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.18, letterSpacing: '-.03em', margin: '22px 0 18px' }}>{tgt ? <>'{d.keyword}' {tgt.rank > 100 ? '100위 밖' : `${tgt.rank}위`},<br /><span style={{ color: 'var(--lime)' }}>{d.meetsPrice && d.meetsReview ? '조건은 됐고 순위만 뒤' : '유입부터 채울 차례'}</span></> : <>'{d.keyword}'<br /><span style={{ color: 'var(--lime)' }}>첫 화면 진입 조건</span></>}</div>
          <div style={{ fontSize: 15, color: '#D0D0D0', lineHeight: 1.75 }}>
            {tgt ? <><mark>가격 {tgt.price ? fmtWon(tgt.price) : '-'} · 리뷰 {fmtCnt(tgt.reviews)}개</mark> vs 상위 10개 평균 {fmtWon(d.avgPrice10)} · {fmtCnt(d.avgReview10)}개<br />유입 반영도 <b style={{ color: '#fff' }}>{d.traffic.verdict}</b> — 클릭·유입이 순위를 가르는 정도</> : <>상위 10개 평균 {fmtWon(d.avgPrice10)} · 리뷰 {fmtCnt(d.avgReview10)}개<br />유입 반영도 <b style={{ color: '#fff' }}>{d.traffic.verdict}</b> — 클릭·유입이 순위를 가르는 정도</>}
          </div>
          <div style={{ marginTop: 26, display: 'grid', gap: 6, fontSize: 13, color: '#BBB' }}>
            <div><span style={{ color: 'var(--lime)' }}>■</span> 현재 위치 · 조건 체크</div><div><span style={{ color: 'var(--lime)' }}>■</span> 유입으로 올릴 수 있는 시장인지 — 데이터 근거</div><div><span style={{ color: 'var(--lime)' }}>■</span> 진행 방식 · 10일 단위 · 종료 리포트</div>
          </div>
        </div>
        {phone}
      </div>
    </div>
    <div className="pd-foot"><span style={{ color: '#fff', fontWeight: 700 }}>{d.brand.name}{d.brand.owner ? ` · ${d.brand.owner}` : ''}{d.brand.phone ? ` · ${d.brand.phone}` : ''}</span><span>상위 {d.n}개 상품 데이터 기준</span></div>
  </div>);

  // 2 현재 위치 / 시장
  pn++;
  const tick = (ok: boolean | null) => <span style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', background: ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : '#B8BFCF' }}>{ok === true ? '✓' : ok === false ? '✕' : '△'}</span>;
  pages.push(<div className="pd-page" key="position">
    <div className="pd-in">
      {tgt ? <>
        <Sec n="01" t="현재 위치" k="YOUR POSITION" lead={`'${d.keyword}' ${tgt.rank > 100 ? '100위 밖' : `${tgt.rank}위`} — ${tgt.rank > 40 ? '첫 화면(40위) 밖' : tgt.rank > 10 ? '첫 화면 안 · 10위 밖' : '상위 10위'}`} />
        <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr 170px', gap: 16, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
          {tgt.image ? <img src={img(tgt.image)} alt="" style={{ width: 96, height: 96, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--line)' }} /> : <div style={{ width: 96, height: 96, borderRadius: 10, background: 'var(--soft)' }} />}
          <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.4 }}>{tgt.title}</div><div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12.5, color: 'var(--ink2)' }}><span>가격 <b>{tgt.price ? fmtWon(tgt.price) : '-'}</b></span><span>리뷰 <b>{fmtCnt(tgt.reviews)}개</b></span><span>스토어 <b>{tgt.mallName}</b></span></div></div>
          <div style={{ textAlign: 'right', borderLeft: '1px solid var(--line)', paddingLeft: 16 }}><div className="pd-muted" style={{ fontSize: 11 }}>현재 순위</div><div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, letterSpacing: '-.03em' }}>{tgt.rank > 100 ? '100+' : tgt.rank}<span style={{ fontSize: 14, color: 'var(--muted)' }}>위</span></div><div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>{tgt.rank > 100 ? '100위 밖' : `상위 10위까지 ${d.gapTop10}계단`}</div></div>
        </div>
        <div className="pd-two">
          {[{ l: '가격', a: tgt.price, b: d.avgPrice10, f: fmtWon, ok: d.meetsPrice, okT: '상위권 수준', noT: '상위권보다 높음' }, { l: '리뷰', a: tgt.reviews, b: d.avgReview10, f: (n: number) => fmtCnt(n) + '개', ok: d.meetsReview, okT: '상위권 수준', noT: '상위권보다 적음' }].map(c => { const m = Math.max(c.a, c.b, 1); return <div className="pd-box" key={c.l}><h4>{c.l} — 귀사 vs 상위 10개 평균</h4>
            <div className="pd-bar"><span className="pd-muted">귀사</span><div className="tr"><i style={{ width: `${(c.a / m) * 100}%`, background: 'var(--blue)' }} /></div><b>{c.f(c.a)}</b></div>
            <div className="pd-bar"><span className="pd-muted">상위 10개 평균</span><div className="tr"><i style={{ width: `${(c.b / m) * 100}%`, background: '#C7CCDA' }} /></div><b>{c.f(c.b)}</b></div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: c.ok ? 'var(--green)' : 'var(--red)' }}>{c.ok ? '✓ ' + c.okT : '△ ' + c.noT}</div></div>; })}
        </div>
        <div className="pd-box"><h4>상위 10위 조건 체크</h4>
          {d.checklist.map(c => <div key={c.label} style={{ display: 'grid', gridTemplateColumns: '24px 150px 1fr', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)', fontSize: 12.5 }}>{tick(c.ok)}<b>{c.label}</b><span style={{ color: 'var(--ink2)' }}>{c.note}</span></div>)}
        </div>
        <div className="pd-navy"><div className="t">요약</div>{(() => { const need = d.checklist.filter(c => c.ok === false).map(c => c.label); const okc = d.checklist.filter(c => c.ok === true).map(c => c.label); return need.length === 0 ? <>조건 충족 / <mark>순위만 차이</mark> → 유입으로 채움</> : need.length === 1 && need[0].startsWith('클릭') ? <>{okc.join('·')} 충족 / 부족한 건 <mark>클릭·유입 하나</mark> → 리워드로 채우는 항목</> : <>{okc.length ? okc.join('·') + ' 충족 / ' : ''}부족: {need.join('·')} — <mark>유입 → 구매 → 리뷰</mark> 순서로 채움</>; })()}</div>
      </> : <>
        <Sec n="01" t={`'${d.keyword}' 시장`} k="MARKET" lead={`상위 ${d.n}개 기준`} />
        <div className="pd-stats">
          <div className="pd-stat"><div className="l">상위 10개 평균가</div><div className="v">{fmtCnt(d.avgPrice10)}<small>원</small></div><div className="d">{fmtWon(d.minPrice10)} ~ {fmtWon(d.maxPrice10)}</div></div>
          <div className="pd-stat"><div className="l">상위 10개 평균 리뷰</div><div className="v">{fmtCnt(d.avgReview10)}<small>개</small></div><div className="d">중간값 {fmtCnt(d.medianReview10)}개</div></div>
          <div className="pd-stat"><div className="l">클릭지수 상위 10</div><div className="v">{d.traffic.hitTop}<small>/5</small></div><div className="d">11~40위 {d.traffic.hitMid}</div></div>
          <div className="pd-stat"><div className="l">신상품 비율</div><div className="v">{d.newRate}<small>%</small></div><div className="d">최근 90일 등록</div></div>
        </div>
        <div className="pd-g3">
          {[['경쟁 강도', d.competition], ['진입 장벽', d.barrier], ['진입 타이밍', d.timing]].map(([l, x]: any) => <div className="pd-box" key={l}><h4>{l}</h4><div className="pd-big">{x.level}</div><div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>{x.why}</div></div>)}
        </div>
        {d.related.length > 0 && <div className="pd-box"><h4>함께 노출되는 연관 키워드</h4><div>{d.related.map(t => <span key={t} style={{ display: 'inline-block', background: 'var(--ink)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, margin: '0 6px 6px 0' }}>{t}</span>)}</div></div>}
        <div className="pd-navy"><div className="t">요약</div>상위 10개 평균 리뷰 <mark>{fmtCnt(d.avgReview10)}개</mark> · 클릭지수 <mark>{d.traffic.hitTop}</mark> — 11~40위와의 차이가 진입 조건</div>
      </>}
    </div>{foot(pn)}
  </div>);

  // 3 유입으로 올릴 수 있는가 — 근거
  pn++;
  const tr = d.traffic; const medTop = d.medianReview10;
  pages.push(<div className="pd-page" key="traffic">
    <div className="pd-in">
      <Sec n="02" t="유입으로 올릴 수 있는 시장인가" k="TRAFFIC SENSITIVITY" lead={`'${d.keyword}' 순위가 리뷰 순이 아니라 클릭·유입 순으로 움직이는지 — 상위 ${d.n}개 데이터로 확인`} />
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'stretch' }}>
        <div className="pd-opt rec" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}><div className="t" style={{ color: '#A9B1C6' }}>유입 반영도</div><div style={{ fontSize: 54, fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1, color: 'var(--lime)', margin: '8px 0' }}>{tr.verdict}</div><div style={{ fontSize: 11.5, color: '#A9B1C6' }}>{tr.verdict === '높음' ? '클릭·유입이 순위를 가르는 시장 — 리워드 효과가 바로 나오는 유형' : tr.verdict === '보통' ? '리뷰와 유입이 함께 작용 — 유입으로 진입 후 리뷰 축적 필요' : '리뷰 비중이 큰 시장 — 유입 + 리뷰 확보를 같이 가야 함'}</div></div>
        <div className="pd-box"><h4>근거</h4>{tr.why.map((w, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--line)' : undefined, fontSize: 12.5, alignItems: 'start' }}><span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--ink)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span><span><Hl t={w} /></span></div>)}</div>
      </div>
      <div className="pd-two">
        <div className="pd-box"><h4>클릭지수 — 상위 10 vs 11~40위</h4>
          <div className="pd-bar"><span className="pd-muted">상위 10개</span><div className="tr"><i style={{ width: `${(tr.hitTop / 5) * 100}%`, background: 'var(--blue)' }} /></div><b>{tr.hitTop} /5</b></div>
          <div className="pd-bar"><span className="pd-muted">11~40위</span><div className="tr"><i style={{ width: `${(tr.hitMid / 5) * 100}%`, background: '#C7CCDA' }} /></div><b>{tr.hitMid} /5</b></div>
          <div style={{ fontSize: 12, marginTop: 8 }}><Hl t={tr.hitTop - tr.hitMid >= 0.3 ? `차이 「${(tr.hitTop - tr.hitMid).toFixed(1)}」 — 클릭·유입이 순위를 가름` : `차이 ${(tr.hitTop - tr.hitMid).toFixed(1)} — 클릭보다 다른 요인 비중 큼`} /></div></div>
        <div className="pd-box"><h4>판매지수 — 상위 10 vs 11~40위</h4>
          <div className="pd-bar"><span className="pd-muted">상위 10개</span><div className="tr"><i style={{ width: `${(tr.saleTop / 5) * 100}%`, background: 'var(--blue)' }} /></div><b>{tr.saleTop} /5</b></div>
          <div className="pd-bar"><span className="pd-muted">11~40위</span><div className="tr"><i style={{ width: `${(tr.saleMid / 5) * 100}%`, background: '#C7CCDA' }} /></div><b>{tr.saleMid} /5</b></div>
          <div style={{ fontSize: 12, marginTop: 8 }}><Hl t={`유입 → 구매가 이어지면 판매지수까지 같이 오름`} /></div></div>
      </div>
      <div className="pd-box" style={{ padding: '14px 20px 6px' }}><h4>상위 10개 — 순위 vs 리뷰 vs 클릭지수 (리뷰 순이 아님)</h4>
        <table><thead><tr><th style={{ width: 40 }}>순위</th><th>상품</th><th className="r">리뷰</th><th className="r">클릭지수</th><th className="r">판매지수</th></tr></thead><tbody>
          {d.top.map(p => <tr key={p.rank} className={tgt && p.rank === tgt.rank ? 'me' : ''}><td style={{ fontWeight: 900 }}>{p.rank}</td><td><div style={{ maxWidth: 380, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{p.productTitle}</div></td><td className="r" style={{ color: p.reviewCount < medTop ? 'var(--red)' : undefined, fontWeight: p.reviewCount < medTop ? 800 : 400 }}>{fmtCnt(p.reviewCount)}{p.reviewCount < medTop ? ' ↓' : ''}</td><td className="r" style={{ fontWeight: 700, color: 'var(--blue)' }}>{p.hitStarScore || '-'}</td><td className="r">{p.saleStarScore || '-'}</td></tr>)}
        </tbody></table>
        <div className="pd-muted" style={{ fontSize: 11, padding: '8px 0 6px' }}>↓ = 상위 10개 리뷰 중간값({fmtCnt(medTop)}개)보다 적은데 상위권 — 리뷰 외 요인(클릭·유입)으로 올라온 상품</div>
      </div>
      <div className="pd-navy"><div className="t">요약</div>{tr.verdict === '높음' ? <>리뷰보다 <mark>클릭·유입</mark>이 순위를 가르는 시장 — {tgt ? '귀사 상품' : '신규 상품'}도 유입을 채우면 올라갈 수 있는 구조</> : tr.verdict === '보통' ? <><mark>유입 + 리뷰</mark>가 같이 작용 — 유입으로 첫 화면 진입 후 구매·리뷰 축적</> : <>리뷰 비중 큰 시장 — <mark>유입으로 구매를 만들고</mark> 리뷰를 쌓는 순서로 접근</>}</div>
    </div>{foot(pn)}
  </div>);

  // 5 해결 + 옵션
  pn++;
  pages.push(<div className="pd-page" key="solution">
    <div className="pd-in">
      <Sec n="03" t="진행 방식" k="HOW IT WORKS" lead={`'${d.keyword}' 실제 검색 유입 매일 일정량 → 「자연 검색 순위」 반영 (광고 영역 아님)`} />
      <div className="pd-tl">
        <div className="s"><i>1</i><div className="t">시작</div><div className="d">상품·키워드 등록<br />시작 순위 기록</div></div>
        <div className="s"><i>2</i><div className="t">매일</div><div className="d">검색 유입 진행<br />아침 순위 확인</div></div>
        <div className="s"><i>3</i><div className="t">진행 중</div><div className="d">순위 변동 시<br />담당자 연락</div></div>
        <div className="s"><i>4</i><div className="t">종료일</div><div className="d">기간 리포트 전달<br />연장 여부 결정</div></div>
      </div>
      <div className="pd-two">
        <div className="pd-box" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}><h4 style={{ margin: 0 }}>종료일에 받는 리포트 (양식)</h4>
          <svg viewBox="0 0 300 100" style={{ width: '100%', height: 100, display: 'block', background: 'var(--soft)', borderRadius: 8 }}>
            {[1, 20, 40].map(v => <g key={v}><line x1="34" x2="290" y1={14 + (v - 1) * 1.6} y2={14 + (v - 1) * 1.6} stroke="#E6E8EE" /><text x="30" y={17 + (v - 1) * 1.6} fontSize="9" textAnchor="end" fill="#9AA1B4">{v}위</text></g>)}
            <polyline fill="none" stroke="#2857FF" strokeWidth="2.2" points="40,84 68,78 96,68 124,54 152,40 180,32 208,26 236,24 264,22 288,22" /><circle cx="288" cy="22" r="3" fill="#2857FF" />
            <text x="40" y="96" fontSize="9" fill="#6B7280">시작</text><text x="288" y="96" fontSize="9" fill="#6B7280" textAnchor="end">종료</text>
          </svg>
          <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.6 }}>시작 → 현재 순위 · 기간 최고 순위 · 날짜별 순위표 → 연장 여부 결정</div></div>
        <div className="pd-box"><h4>자주 묻는 것</h4><div className="pd-faq">
          <div><b>Q</b><span>'광고' 표시 — <b style={{ color: 'var(--ink)' }}>없음.</b> 자연 검색 순위 반영</span></div>
          <div><b>Q</b><span>스토어 계정 접근 — <b style={{ color: 'var(--ink)' }}>불필요.</b> 상품 URL · 키워드만</span></div>
          <div><b>Q</b><span>종료 후 — 쌓인 클릭·구매·리뷰는 유지. <b style={{ color: 'var(--ink)' }}>특정 순위 보장 없음</b></span></div>
          <div><b>Q</b><span>기간 — <b style={{ color: 'var(--ink)' }}>10일 단위</b> 시작 → 리포트 보고 판단</span></div>
        </div></div>
      </div>
      <div className="pd-box" style={{ padding: '14px 20px' }}><h4>진행 순서</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, fontSize: 12 }}>
          {[['회신', '전화 · 문자 · 카톡'], ['키워드 · 옵션 확정', '연관 키워드 순위 확인 후'], ['입금 · 세금계산서', '사업자 기준 발행'], ['익일 시작', '시작 순위 기록 → 매일 확인']].map(([t, d1], i) => <div key={t} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8, alignItems: 'start' }}><span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--blue)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span><span><b>{t}</b><br /><span className="pd-muted" style={{ fontSize: 11 }}>{d1}</span></span></div>)}
        </div></div>
      <div className="pd-two">
        <div className="pd-opt"><div className="t">기본</div><div className="p">{price(d.offer.basic)}</div><ul><li>키워드 1개 · 10일</li><li>매일 아침 순위 확인</li><li>종료 리포트</li></ul></div>
        <div className="pd-opt rec"><span className="tag">같은 키워드 고객 다수 선택</span><div className="t">권장</div><div className="p">{price(d.offer.rec)}</div><ul><li>키워드 1개 · 10일 · 유입량 상향</li><li>연관 키워드 1개 순위 추적 포함</li><li>매일 순위 확인 · 변동 시 연락 · 종료 리포트</li></ul></div>
      </div>
      <div className="pd-muted" style={{ fontSize: 10.5 }}>※ 결과는 키워드 경쟁도·상품 반응에 따라 다름 · 특정 순위 보장 없음 · 10일 단위 진행, 연장은 리포트 보고 결정</div>
    </div>{foot(pn)}
  </div>);

  // 6 행동
  pages.push(<div className="pd-page dark" key="next">
    <div className="pd-in" style={{ gap: 0, justifyContent: 'flex-start' }}>
      <div className="pd-logo"><i />{d.brand.nameEn}</div>
      <div style={{ margin: 'auto 0', paddingBottom: 40 }}>
        <div style={{ display: 'inline-block', background: 'var(--lime)', color: '#fff', fontSize: 11, letterSpacing: '.14em', fontWeight: 800, padding: '6px 12px', borderRadius: 4 }}>CONTACT</div>
        <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.18, margin: '18px 0 16px' }}>{tgt ? <>{tgt.rank > 100 ? '100위 밖' : `${tgt.rank}위`}에서 <span style={{ color: 'var(--lime)' }}>첫 화면</span>까지</> : <>'{d.keyword}' <span style={{ color: 'var(--lime)' }}>첫 화면</span>까지</>}</div>
        <p style={{ fontSize: 15, color: '#A9B1C6', lineHeight: 1.7, margin: 0, maxWidth: 540 }}>회신 시 <mark>연관 키워드 현재 순위</mark> 확인 → 전달 → 진행 여부 결정</p>
        <div className="pd-cta">
          <div className="c g"><div className="l">담당</div><div className="v">{d.brand.owner || d.brand.name}</div><div className="d">{d.brand.phone && <div style={{ fontSize: 18, color: '#fff', fontWeight: 800 }}>{d.brand.phone}</div>}{d.brand.email}</div></div>
          <div className="c"><div className="l">회신 시</div><div className="v">연관 키워드 순위 확인</div><div className="d">{d.related.length ? d.related.slice(0, 4).join(' · ') : `'${d.keyword}' 연관 키워드`}<br />진행 방식 · 옵션 안내</div></div>
        </div>
      </div>
      <div style={{ marginTop: 'auto', marginBottom: 20, fontSize: 11, color: '#8E97AD', lineHeight: 1.6 }}>{d.brand.name} · 네이버쇼핑 검색 결과 공개 데이터 기준 ({d.date})</div>
    </div>
  </div>);

  return <div className="pd">{pages}</div>;
}
export function docPageCount(_d: Doc) { return 5; }
