'use client';
import { useEffect, useRef, useState } from 'react';
import { Pv3CommonDoc, PV3_CSS, PV3_FONT, PV3G_PAGES } from '@/components/Pv3Doc';
import type { KwData, KwAi } from '@/lib/proposalV3';
import { BRAND } from '@/lib/proposalDoc';
import { notify } from '@/components/Toast';
import { kwImport } from '../../kw-calls/actions';
import { manualPlan, manualExport, manualCommonV3, recordManualSent, manualUnrecord, getRecontactDays, setRecontactDays, getExportForm, saveExportForm, importManualTargets, type ManualRow, type Tpl } from '../actions';

const A: Tpl = { subject: "{업체명} '{키워드}' 지수 확인 후 연락드립니다 — 카톡 주시면 테스트부터 봐드립니다", body: `안녕하세요, {업체명} 대표님. {담당자}입니다.

'{키워드}' 검색 결과에서 {업체명} 상품을 보고 연락드립니다.

저희는 키워드마다 상위 100개 상품을 클릭지수·판매지수·리뷰지수로 쪼개서 봅니다.
'{키워드}'는 상위 10개와 그 아래가 리뷰 수로 갈리는 게 아니라 클릭·유입 지수에서 벌어지는 키워드고, 그 지수를 채우면 올라가는 구조입니다.
어느 지수가 비는지, 상위 10개는 어디까지 채워져 있는지 한 장씩 정리했습니다.
아래는 해당 제안서 내용입니다.
{제안서링크}

저희 일은 그 비는 지수를 메우고 고객들에게 상품을 노출하는 겁니다.
진행 중에는 순위를 매일 확인하고, 변동은 주간 리포트로 공유하며, 요청은 당일 반영합니다.

자료 보시고 아래 카카오톡 오픈채팅으로 메시지 주시면 {업체명} 상품 기준으로 어느 지수가 비는지 바로 짚어드리겠습니다.
{오픈채팅}

꼭 읽어보시고 카톡 주세요.` };
const B: Tpl = { subject: "{업체명} '{키워드}' 상위 10개와 벌어진 지수, 한 장으로 정리했습니다", body: `안녕하세요, {업체명} 대표님. {담당자}입니다.

'{키워드}'에서 {업체명} 상품을 보고 연락드립니다.

같은 키워드 상위 100개를 클릭·판매·리뷰 지수로 나눠 보면, 상위 10개와 그 아래는 리뷰 수가 아니라 클릭·유입 지수에서 갈립니다. '{키워드}'도 그 구조입니다.
{업체명} 상품은 어느 지수가 비는지, 상위 10개는 어디까지 채워져 있는지 아래 자료에 정리했습니다.
{제안서링크}

저희는 그 비는 지수를 채워 상품을 노출시키는 일을 합니다. 진행 중엔 순위를 매일 확인하고, 변동은 주간 리포트로, 요청은 당일 반영합니다.

회신 주시면 {업체명} 기준으로 비는 지수부터 짚어드리겠습니다.` };
const C: Tpl = { subject: "'{키워드}' {업체명} 순위, 리뷰 문제가 아닙니다", body: `안녕하세요, {업체명} 대표님. {담당자}입니다.

'{키워드}' 검색 결과를 보다가 {업체명} 상품에서 멈춰서 연락드립니다.

'{키워드}' 상위 100개를 지수별로 놓고 보면 리뷰가 많은 상품이 위에 있는 게 아닙니다. 상위 10개를 가르는 건 클릭·유입 지수고, 그 지수가 채워지면 순위가 움직입니다.
{업체명} 상품은 지금 어느 지수가 비어 있는지, 상위 10개 기준선은 어디인지 정리했습니다.
{제안서링크}

저희는 그 지수를 채우는 작업을 합니다. 매일 순위 확인, 주간 리포트, 요청 당일 반영이 기본입니다.

회신 주시면 {업체명} 상품 기준으로 먼저 봐드리겠습니다.` };

export default function ExportClient({ owner: o0, phone: p0 }: { owner: string; phone: string }) {
  const [total, setTotal] = useState(1000); const [per, setPer] = useState(50); const [owner, setOwner] = useState(o0); const [phone, setPhone] = useState(p0);
  const [basic, setBasic] = useState(''); const [rec, setRec] = useState(''); const [kakao, setKakao] = useState('https://open.kakao.com/o/saz4cuKi'); const [onlyA, setOnlyA] = useState(true); const [chunk, setChunk] = useState('10');
  const [tpl, setTpl] = useState(A); const [tplB, setTplB] = useState(B); const [tplC, setTplC] = useState(C);
  const [busy, setBusy] = useState(false); const [log, setLog] = useState<string[]>([]); const [planState, setPlan] = useState<{ keyword: string; n: number }[] | null>(null); const plan = planState;
  // ── 맞춤 제안서 공용판 이미지 (키워드마다 9장 · 화면 밖에서 그려 캡처 → zip) ──
  const [imgMode, setImgMode] = useState(true); const [imgKws, setImgKws] = useState<string[]>([]); const [imgBusy, setImgBusy] = useState('');
  const [cur, setCur] = useState<{ k: KwData; ka: KwAi } | null>(null); const stage = useRef<HTMLDivElement>(null); const ready = useRef<(() => void) | null>(null);
  useEffect(() => { if (cur && ready.current) { const f = ready.current; ready.current = null; requestAnimationFrame(() => requestAnimationFrame(f)); } }, [cur]);
  /** 키워드마다 공용판 9장을 그려 캡처 → { 'zip 안 경로': 바이트 } */
  const makeImages = async (kws: string[]) => {
    const files: Record<string, Uint8Array> = {}; const fails: string[] = [];
    const h = await import('html-to-image'); let fontCss: string | undefined; const safe = (t: string) => t.replace(/[\\/:*?"<>|]/g, '_');
    try { await Promise.all([400, 500, 600, 700, 800].map(w => (document as any).fonts.load(`${w} 20px Pretendard`, '가'))); } catch {}
    for (let x = 0; x < kws.length; x++) {
      const kw = kws[x]; setImgBusy(`${x + 1}/${kws.length} · ${kw}`);
      const r = await manualCommonV3(kw); if (!r.ok || !r.k || !r.ka) { fails.push(r.msg || kw); continue; }
      await new Promise<void>(res => { ready.current = res; setCur({ k: r.k!, ka: r.ka! }); });
      try { await (document as any).fonts?.ready; } catch {}
      const els = Array.from(stage.current?.querySelectorAll<HTMLElement>('.pv3g') ?? []);
      if (fontCss === undefined && els[0]) { try { fontCss = await h.getFontEmbedCSS(els[0]); } catch { fontCss = ''; } }   // 글꼴은 한 번만 내려받아 모든 장에 재사용
      for (let n = 0; n < els.length; n++) {
        // dataURL(base64 문자열)로 받으면 장마다 수 MB 문자열이 쌓여 탭 메모리가 터진다 — 캔버스에서 바로 바이트로 받고 캔버스는 즉시 비운다
        const cv = await h.toCanvas(els[n], { pixelRatio: 1.5, backgroundColor: '#ffffff', ...(fontCss ? { fontEmbedCSS: fontCss } : {}) });
        const blob = await new Promise<Blob | null>(res => cv.toBlob(b => res(b), 'image/jpeg', 0.88)); cv.width = 0; cv.height = 0;
        if (blob) files[`${safe(kw)}/${safe(kw)}_제안서_${String(n + 1).padStart(2, '0')}.jpg`] = new Uint8Array(await blob.arrayBuffer());
      }
      setCur(null); await new Promise(res => setTimeout(res, 60));   // 화면 밖 무대를 비우고 한 박자 쉬어 메모리 회수 기회를 준다
    }
    setCur(null); return { files, fails };
  };
  const saveZip = async (files: Record<string, Uint8Array>, name: string) => {
    const { zipSync } = await import('fflate'); const zip = zipSync(files, { level: 0 });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); const href = a.href; setTimeout(() => URL.revokeObjectURL(href), 20000);
  };
  const ymd = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
  const getImages = async () => {
    if (!imgKws.length) return notify('먼저 「대상 확인」 또는 「엑셀 받기」', 'bad');
    setImgBusy('준비 중…');
    try {
      const CH = 25; const parts = Math.ceil(imgKws.length / CH); const fails: string[] = []; let made = 0;
      for (let c = 0; c < parts; c++) {   // 25개 키워드씩 zip 하나 (많으면 여러 개로 나눠 저장)
        const r = await makeImages(imgKws.slice(c * CH, (c + 1) * CH)); fails.push(...r.fails); made += new Set(Object.keys(r.files).map(f => f.split('/')[0])).size;
        if (Object.keys(r.files).length) await saveZip(r.files, parts === 1 ? `제안서이미지_${ymd()}_키워드${made}개.zip` : `제안서이미지_${ymd()}_${String(c + 1).padStart(2, '0')}of${String(parts).padStart(2, '0')}.zip`);
        if (parts > 1) await new Promise(res => setTimeout(res, 800));
      }
      if (!made) { notify('만들어진 이미지가 없습니다 — ' + fails.slice(0, 2).join(' / '), 'bad'); return; }
      notify(`제안서 이미지 저장 — 키워드 ${made}개 × ${PV3G_PAGES}장${fails.length ? ` · 실패 ${fails.length}개` : ''}`, fails.length ? 'bad' : 'ok');
      if (fails.length) setLog(l => [...l, ...fails.map(f => `✕ 이미지: ${f}`)]);
    } catch (e: any) { notify('이미지 만들기 실패: ' + (e?.message ?? e), 'bad'); } finally { setImgBusy(''); setCur(null); }
  };
  const T = ({ v, set, label }: { v: Tpl; set: (t: Tpl) => void; label: string }) => <div key={label} className="card" style={{ display: 'grid', gap: 8 }}><div style={{ fontWeight: 800 }}>{label}</div><input value={v.subject} onChange={e => set({ ...v, subject: e.target.value })} placeholder="제목" /><textarea value={v.body} onChange={e => set({ ...v, body: e.target.value })} rows={12} style={{ fontSize: 13, lineHeight: 1.6 }} /></div>;

  const [planMsg, setPlanMsg] = useState('');
  // 이미 보낸 엑셀 올리기 — 기록 기능 이전에 뽑은 엑셀의 주소를 발송 기록으로 넣어 다음 뽑기에서 빠지게
  const [days, setDays] = useState(3); const [daysIn, setDaysIn] = useState('3'); const [upBusy, setUpBusy] = useState('');
  useEffect(() => { getRecontactDays().then(d => { setDays(d); setDaysIn(String(d)); }).catch(() => {}); }, []);
  const saveDays = async () => { const r = await setRecontactDays(Number(daysIn)); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) setDays(Math.max(1, Math.min(365, Math.round(Number(daysIn))))); };
  const uploadSent = async (files: FileList | null) => {
    if (!files?.length || upBusy) return; setUpBusy('읽는 중…');
    try {
      const XLSX = await import('xlsx'); const all: { email: string; store: string; keyword: string }[] = []; const seen = new Set<string>();
      for (const f of Array.from(files)) {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        for (const name of wb.SheetNames) for (const row of XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' })) {
          const pick = (...ks: string[]) => { for (const k of Object.keys(row)) if (ks.some(x => k.replace(/\s/g, '').includes(x))) return String(row[k] ?? '').trim(); return ''; };
          const e = pick('메일주소', '이메일', 'email', 'Email', 'E-mail').toLowerCase(); if (!e.includes('@') || seen.has(e)) continue; seen.add(e);
          all.push({ email: e, store: pick('스토어명', '업체명'), keyword: pick('키워드') });
        }
      }
      if (!all.length) { notify('메일 주소가 든 열(메일주소·이메일)을 찾지 못했습니다', 'bad'); return; }
      if (!confirm(`메일 주소 ${all.length.toLocaleString()}개를 '수동 엑셀' 발송 기록으로 넣습니다.\n지금부터 ${days}일 동안 수동 뽑기·자동 발송에서 빠집니다. 진행할까요?`)) return;
      let done = 0;
      for (let i = 0; i < all.length; i += 2000) { setUpBusy(`기록 중 ${done.toLocaleString()}/${all.length.toLocaleString()}`); const r = await recordManualSent(all.slice(i, i + 2000)); if (!r.ok) { notify(`${done.toLocaleString()}개까지 넣고 멈춤 — ${r.msg}`, 'bad'); return; } done += r.n ?? 0; }
      notify(`${done.toLocaleString()}개 기록됨 — ${days}일 동안 다시 뽑히지 않습니다`, 'ok'); setLog(l => [...l, `이미 보낸 엑셀 ${done.toLocaleString()}개를 발송 기록에 넣었습니다 (금지 기간 ${days}일)`]);
    } catch (e: any) { notify('엑셀 읽기 실패: ' + String(e?.message ?? e).slice(0, 80), 'bad'); } finally { setUpBusy(''); }
  };
  // 추출기 CSV 올리기 — 메일 대상에 '수동 전용'으로 추가 (자동 발송에는 안 나옴)
  const [impBusy, setImpBusy] = useState('');
  const uploadTargets = async (files: FileList | null) => {
    if (!files?.length || impBusy) return; setImpBusy('읽는 중…');
    try {
      const XLSX = await import('xlsx'); const all: { store_name: string; store_url: string; keyword: string; email: string; phone: string }[] = []; const seen = new Set<string>(); let banned = 0, noMail = 0; const contacts: Record<string, string>[] = []; const seenC = new Set<string>();
      for (const f of Array.from(files)) {
        const buf = await f.arrayBuffer();
        const wb = /\.csv$/i.test(f.name) ? XLSX.read(new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/, ''), { type: 'string', raw: true }) : XLSX.read(buf, { type: 'array' });
        for (const name of wb.SheetNames) for (const row of XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '', raw: false })) {
          const pick = (...ks: string[]) => { for (const k of Object.keys(row)) if (ks.some(x => k.replace(/\s/g, '').includes(x))) return String(row[k] ?? '').trim(); return ''; };
          if (pick('상태').includes('영업금지')) { banned++; continue; }
          const email = pick('이메일', '메일주소', 'email', 'Email').toLowerCase(); const store_name = pick('스토어명', '업체명') || pick('판매자명', '상호'); const keyword = pick('키워드');
          const phone = pick('전화번호', '연락처'); const store_url = pick('스토어링크', '스토어URL', '링크');
          if (store_name && (phone || email.includes('@'))) { const ck = `${keyword}|${store_url || store_name}`; if (!seenC.has(ck)) { seenC.add(ck); contacts.push({ store_name, store_url, keyword, company: pick('판매자명', '상호'), rep: pick('대표자'), email: email.includes('@') ? email : '', phone, address: pick('소재지', '주소'), biz_no: pick('사업자등록번호', '사업자번호') }); } }   // 키워드 콜 리스트용 — 이메일 없어도 전화가 있으면 포함
          if (!email.includes('@') || !store_name) { noMail++; continue; }
          const key = `${keyword}|${email}|${store_name}`; if (seen.has(key)) continue; seen.add(key);
          all.push({ store_name, store_url, keyword, email, phone });
        }
      }
      if (!all.length && !contacts.length) { notify(`올릴 수 있는 행이 없습니다 (이메일 없음 ${noMail} · 영업금지 ${banned})`, 'bad'); return; }
      if (!confirm(`메일 대상(수동 전용) ${all.length.toLocaleString()}행 · 키워드 콜 리스트 ${contacts.length.toLocaleString()}행을 넣습니다 (영업금지 ${banned} 제외 · 이메일 없는 ${noMail}행은 콜 리스트에만).\n수동 뽑기에만 나오고 직원 자동 발송에는 안 나옵니다. 진행할까요?`)) return;
      let add = 0, upd = 0, skip = 0, done = 0;
      for (let i = 0; i < all.length; i += 1000) { setImpBusy(`넣는 중 ${done.toLocaleString()}/${all.length.toLocaleString()}`); const r = await importManualTargets(all.slice(i, i + 1000)); if (!r.ok) { notify(`${done.toLocaleString()}행까지 넣고 멈춤 — ${r.msg}`, 'bad'); return; } add += r.added ?? 0; upd += r.updated ?? 0; skip += r.skipped ?? 0; done += Math.min(1000, all.length - i); }
      let cAdd = 0, cUpd = 0, cErr = '';
      for (let i = 0; i < contacts.length; i += 1000) { setImpBusy(`콜 리스트 넣는 중 ${i.toLocaleString()}/${contacts.length.toLocaleString()}`); const r = await kwImport(contacts.slice(i, i + 1000)); if (!r.ok) { cErr = r.msg; break; } cAdd += r.added ?? 0; cUpd += r.updated ?? 0; }
      const m = `추출기 CSV: 메일 대상 새 업체 ${add.toLocaleString()} · 키워드 추가 ${upd.toLocaleString()}${skip ? ` · 건너뜀 ${skip}` : ''} / 키워드 콜 리스트 ${cErr ? `실패 — ${cErr}` : `새 업체 ${cAdd.toLocaleString()} · 갱신 ${cUpd.toLocaleString()}`}`; notify(m, cErr ? 'bad' : 'ok'); setLog(l => [...l, m]);
    } catch (e: any) { notify('파일 읽기 실패: ' + String(e?.message ?? e).slice(0, 80), 'bad'); } finally { setImpBusy(''); }
  };
  // 입력값 저장·불러오기 (문구 A/B/C·오픈채팅·담당자·연락처·가격·A형만)
  const [formBusy, setFormBusy] = useState(false); const [savedAt, setSavedAt] = useState('');
  useEffect(() => { getExportForm().then(f => { if (!f) return; const s = (x: unknown) => typeof x === 'string' ? x : null; const t = (x: any): Tpl | null => x && typeof x.subject === 'string' && typeof x.body === 'string' ? { subject: x.subject, body: x.body } : null;
    const a = t(f.tpl), b = t(f.tplB), c = t(f.tplC); if (a) setTpl(a); if (b) setTplB(b); if (c) setTplC(c);
    if (s(f.kakao) !== null) setKakao(s(f.kakao)!); if (s(f.owner)) setOwner(s(f.owner)!); if (s(f.phone) !== null && s(f.phone)) setPhone(s(f.phone)!); if (s(f.basic) !== null) setBasic(s(f.basic)!); if (s(f.rec) !== null) setRec(s(f.rec)!);
    if (typeof f.onlyA === 'boolean') setOnlyA(f.onlyA); if (s(f.at)) setSavedAt(s(f.at)!); }).catch(() => {}); }, []);
  const saveForm = async () => { setFormBusy(true); const at = new Date().toISOString(); const r = await saveExportForm({ tpl, tplB, tplC, kakao, owner, phone, basic, rec, onlyA, at }).catch(e => ({ ok: false, msg: '저장 실패: ' + String(e?.message ?? e).slice(0, 60) })); setFormBusy(false); notify(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) setSavedAt(at); };
  const FAILED_KEY = 'wh.export.failed'; const [failedKws, setFailedKws] = useState<{ keyword: string; n: number }[]>([]);
  useEffect(() => { try { const j = JSON.parse(localStorage.getItem(FAILED_KEY) || 'null'); if (j?.kws?.length && Date.now() - j.at < 3 * 86400e3) setFailedKws(j.kws); } catch {} }, []);
  const saveFailed = (kws: { keyword: string; n: number }[]) => { setFailedKws(kws); try { if (kws.length) localStorage.setItem(FAILED_KEY, JSON.stringify({ at: Date.now(), kws })); else localStorage.removeItem(FAILED_KEY); } catch {} };
  const retryFailed = () => { if (!failedKws.length) return; setPlan(failedKws); setImgKws(failedKws.map(p => p.keyword)); setLog([`못 뽑은 키워드 ${failedKws.length}개 · ${failedKws.reduce((a, p) => a + p.n, 0)}건을 다시 뽑습니다 — 「2. 엑셀 받기」를 누르세요`]); };
  const doPlan = async (all = false) => {
    const T = all ? 100000 : total, P = all ? 100000 : per; if (all) { setTotal(T); setPer(P); }
    setBusy(true); setPlan(null); setPlanMsg('확인 중… 키워드 0개째'); setLog([all ? '전체 대상을 세는 중입니다 — 키워드 16개씩 확인합니다' : '대상을 세는 중입니다']); const acc: { keyword: string; n: number }[] = []; let avail = 0, from = 0, left = T;
    try {
      for (;;) {   // 키워드 16개씩 나눠서 확인 (많아도 시간 초과 없이)
        const r = await manualPlan(left, P, from);
        if (!r.ok || !r.plan) { notify(r.msg || '대상 확인 실패', 'bad'); return; }
        acc.push(...r.plan); avail += r.available ?? 0; left = T - acc.reduce((a, p) => a + p.n, 0);
        setPlanMsg(`확인 중… 키워드 ${Math.min(r.next ?? r.totalKw ?? 0, r.totalKw ?? 0)}/${r.totalKw ?? '?'} · ${acc.reduce((a, p) => a + p.n, 0)}건`);
        if (r.next == null || left <= 0) break; from = r.next;
      }
      const n = acc.reduce((a, p) => a + p.n, 0);
      if (!acc.length) { notify('지금 보낼 수 있는 대상이 없습니다', 'bad'); setLog(['보낼 수 있는 대상 0건 — 이메일 없음·수신거부·회신·최근 발송을 뺀 결과']); return; }
      setPlan(acc); setImgKws(acc.map(p => p.keyword)); notify(`${n}건 · 키워드 ${acc.length}개`, 'ok');
      setLog([`보낼 수 있는 대상 ${all ? n : `${avail}건 이상 중 ${n}`}건 배분 · 키워드 ${acc.length}개${all ? ' (전체)' : ` (키워드당 최대 ${P})`}`]);
    } catch (e: any) { notify('대상 확인 중 오류 — 다시 눌러 주세요: ' + String(e?.message ?? e).slice(0, 80), 'bad'); }
    finally { setBusy(false); setPlanMsg(''); }
  };
  // ── 중단돼도 이어서 뽑기 — 묶음마다 진행 상황을 브라우저에 적어 둔다. 탭이 죽어도(메모리 부족 등) 남은 키워드부터 이어 가고,
  //    저장 못 한 묶음의 '보냄' 기록은 지우고 다시 뽑는다. 이미지 묶음은 2개마다 화면을 새로 열어 메모리를 비운다
  type Resume = { at: number; rest: { keyword: string; n: number }[]; inflight: string[]; since: string; no: number; done: number; parts: number; d: string; ch: number; auto?: boolean;
    form: { owner: string; phone: string; basic: string; rec: string; kakao: string; onlyA: boolean; imgMode: boolean; tpl: Tpl; tplB: Tpl; tplC: Tpl } };
  const RESUME_KEY = 'wh.export.resume'; const RELOAD_EVERY = 2; const [resume, setResume] = useState<Resume | null>(null);
  const putResume = (r: Resume | null) => { try { if (r) localStorage.setItem(RESUME_KEY, JSON.stringify(r)); else localStorage.removeItem(RESUME_KEY); } catch {} };
  const runRef = useRef<(r?: Resume) => void>(() => {});
  useEffect(() => { try { const j = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null') as Resume | null; if (j?.rest?.length && Date.now() - j.at < 24 * 3600e3) { setResume(j); if (j.auto) setTimeout(() => runRef.current(j), 1500); } else if (j) localStorage.removeItem(RESUME_KEY); } catch {} }, []);
  const run = async (rs?: Resume) => {
    const plan = rs ? rs.rest : planState; const F = rs ? rs.form : { owner, phone, basic, rec, kakao, onlyA, imgMode, tpl, tplB, tplC };
    const { owner: fOwner, phone: fPhone, basic: fBasic, rec: fRec, kakao: fKakao, onlyA: fOnlyA, imgMode: fImg, tpl: fTpl, tplB: fTplB, tplC: fTplC } = F;
    if (!plan?.length) return notify('먼저 「대상 확인」', 'bad');
    const CH = rs ? rs.ch : Math.max(1, Math.min(200, Math.round(Number(chunk) || 10))); const parts = Math.ceil(plan.length / CH); const baseDone = rs ? rs.done : 0; const allParts = rs ? rs.parts : parts;
    if (!rs && !confirm(`${plan.reduce((a, p) => a + p.n, 0)}건을 뽑습니다 — 키워드 ${CH}개마다 묶음 하나씩(총 ${parts}개) 바로 저장됩니다.\n뽑은 대상은 발송 내역에 '수동 엑셀'로 기록되어, 재발송 금지 기간 동안 다시 뽑히지 않고 자동 발송에서도 빠집니다. 진행할까요?`)) return;
    setBusy(true); setResume(null); let no = rs ? rs.no : 1; const lg: string[] = []; const d = rs ? rs.d : ymd(); const pad = (n: number) => String(n).padStart(String(allParts).length < 2 ? 2 : String(allParts).length, '0');
    const state = (rest: { keyword: string; n: number }[], inflight: string[], done: number, auto = false): Resume => ({ at: Date.now(), rest, inflight, since: new Date().toISOString(), no, done, parts: allParts, d, ch: CH, auto, form: F });
    if (rs) { lg.push(`↻ 이어서 뽑기 — 남은 키워드 ${plan.length}개 (묶음 ${baseDone + 1}/${allParts}부터)`); setLog([...lg]);
      if (rs.inflight.length) { try { const u = await manualUnrecord(rs.inflight, rs.since); lg.push(u.ok ? `— 저장 못 한 묶음의 발송 기록 ${u.n ?? 0}건을 지우고 다시 뽑습니다` : `✕ 기록 정리 실패: ${u.msg}`); } catch { lg.push('✕ 기록 정리 실패 — 그 묶음 일부는 재발송 금지 기간 뒤에 뽑힙니다'); } setLog([...lg]); } }
    const failed: { keyword: string; n: number }[] = []; const seenEmail = new Set<string>(); let dup = 0, total = 0, saved = 0; const imgFails: string[] = [];   // 한 번에 뽑는 전체에서 같은 이메일은 한 번만 (여러 키워드에 걸친 업체)
    const XLSX = await import('xlsx');
    const book = (rows: ManualRow[], part: { keyword: string; n: number }[]) => {
      const ws = XLSX.utils.json_to_sheet(rows.map(r => fOnlyA
        ? { 번호: r.no, 스토어명: r.store, 메일주소: r.email, 키워드: r.keyword, 현재순위: r.rank, 제목: r.subject, 본문: r.body, 제안서링크: r.link, 수신거부링크: r.unsub, 발송계정: '', 발송일: '', 비고: '' }
        : { 번호: r.no, 스토어명: r.store, 메일주소: r.email, 키워드: r.keyword, 현재순위: r.rank, '제목 A': r.subject, '본문 A': r.body, '제목 B': r.subjectB, '본문 B': r.bodyB, '제목 C': r.subjectC, '본문 C': r.bodyC, 제안서링크: r.link, 수신거부링크: r.unsub, 발송계정: '', 발송일: '', 비고: '' }));
      ws['!cols'] = (fOnlyA ? [4, 22, 30, 14, 8, 50, 70, 46, 46, 18, 12, 20] : [4, 22, 30, 14, 8, 50, 70, 50, 70, 50, 70, 46, 46, 18, 12, 20]).map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '발송');
      const cnt = new Map<string, number>(); for (const r of rows) cnt.set(r.keyword, (cnt.get(r.keyword) ?? 0) + 1);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(part.filter(p => cnt.has(p.keyword)).map(p => ({ 키워드: p.keyword, 건수: cnt.get(p.keyword) }))), '키워드별');
      return wb;
    };
    try {
      for (let c = 0; c < parts; c++) {
        const part = plan.slice(c * CH, (c + 1) * CH); const rows: ManualRow[] = []; const bn = baseDone + c + 1;
        putResume(state(plan.slice(c * CH), part.map(p => p.keyword), baseDone + c));   // 이 묶음이 저장되기 전에 죽으면: 이 묶음 키워드의 기록을 지우고 여기서부터 다시
        for (const p of part) {
          let r: Awaited<ReturnType<typeof manualExport>>;
          try { r = await manualExport({ keyword: p.keyword, n: p.n, owner: fOwner, phone: fPhone, offer: { basic: fBasic, rec: fRec }, tpl: fTpl, tplB: fTplB, tplC: fTplC, startNo: no, kakao: fKakao }); }
          catch (e: any) { r = { ok: false, msg: `${p.keyword}: 서버 호출 실패 — ${String(e?.message ?? e).slice(0, 60)}` }; }
          lg.push(`${r.ok ? '✓' : '✕'} ${r.msg}`); setLog([...lg]);
          if (r.ok && r.rows) { for (const row of r.rows) { const e = row.email.trim().toLowerCase(); if (seenEmail.has(e)) { dup++; continue; } seenEmail.add(e); row.no = no++; rows.push(row); } } else if (!r.ok) { failed.push(p); saveFailed([...failed]); }   // 못 뽑은 키워드는 그때그때 기억 (중간에 창이 닫혀도 남게)
        }
        if (!rows.length) { lg.push(`— 묶음 ${pad(bn)}/${pad(allParts)}: 뽑힌 행 없음 (건너뜀)`); setLog([...lg]); putResume(state(plan.slice((c + 1) * CH), [], baseDone + c + 1)); continue; }
        if (fImg) rows.forEach(r => { const strip = (t: string) => (r.link ? t.split(r.link).join('') : t).replace(/\n{3,}/g, '\n\n').trim(); r.body = strip(r.body); r.bodyB = strip(r.bodyB); r.bodyC = strip(r.bodyC); r.link = ''; });   // 본문에 이미지를 넣어 보내는 방식 — 제안서 링크는 뺀다
        const wb = book(rows, part); const base = allParts === 1 ? `메일발송_수동_${d}_${rows.length}건` : `메일발송_수동_${d}_묶음${pad(bn)}of${pad(allParts)}_${rows.length}건`;
        if (!fImg) XLSX.writeFile(wb, `${base}.xlsx`);
        else {
          const kws = [...new Set(rows.map(r => r.keyword))]; setImgBusy('준비 중…');
          let files: Record<string, Uint8Array> = {};
          try { const m = await makeImages(kws); files = m.files; imgFails.push(...m.fails); } catch (e: any) { imgFails.push(`묶음 ${pad(bn)} 이미지 실패 — ${String(e?.message ?? e).slice(0, 60)}`); }
          files[`${base}.xlsx`] = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
          await saveZip(files, `${base}.zip`); setImgBusy(''); setCur(null);
        }
        total += rows.length; saved++; lg.push(`■ 묶음 ${pad(bn)}/${pad(allParts)} 저장됨 — ${rows.length}건 (이번 화면 누적 ${total.toLocaleString()}건) · 지금 바로 쓸 수 있습니다`); setLog([...lg]);
        const restAfter = plan.slice((c + 1) * CH); putResume(restAfter.length ? state(restAfter, [], baseDone + c + 1) : null);
        if (parts > 1) await new Promise(r => setTimeout(r, 800));
        if (fImg && restAfter.length && (c + 1) % RELOAD_EVERY === 0) {   // 이미지 묶음은 메모리를 많이 쓴다 — 2묶음마다 화면을 새로 열고 자동으로 이어 간다
          putResume(state(restAfter, [], baseDone + c + 1, true)); lg.push('↻ 메모리를 비우려고 화면을 새로 엽니다 — 자동으로 이어서 뽑습니다 (창을 닫지 마세요)'); setLog([...lg]);
          await new Promise(r => setTimeout(r, 4000)); location.reload(); await new Promise(() => {}); }
      }
      if (dup) lg.push(`— 같은 이메일 ${dup}건은 한 번만 남겼습니다`);
      if (imgFails.length) lg.push(...imgFails.map(f => `✕ 이미지: ${f}`));
      if (failed.length) lg.push(`— 못 뽑은 키워드 ${failed.length}개는 「못 뽑은 키워드만 다시」로 이어서 뽑을 수 있습니다 (조회 한도는 자정에 풀림)`);
      setLog([...lg]); saveFailed(failed); putResume(null);
      if (!total) notify('뽑힌 행이 없습니다', 'bad');
      else { notify(`${total.toLocaleString()}건 · 묶음 ${saved}개 저장됨${imgFails.length ? ` · 이미지 실패 ${imgFails.length}개` : ''}${saved > 1 ? ' — 브라우저가 "여러 파일 다운로드"를 물으면 허용' : ''}`, imgFails.length ? 'bad' : 'ok'); setPlan(null); }
    } catch (e: any) { lg.push(`✕ 중단됨 — ${String(e?.message ?? e).slice(0, 80)} (이미 저장된 묶음 ${saved}개는 그대로 쓸 수 있고, 남은 건 「대상 확인」부터 다시 누르면 이어서 뽑힙니다)`); setLog([...lg]); notify('뽑는 중 오류 — 저장된 묶음까지는 사용 가능', 'bad'); }
    finally { setBusy(false); setImgBusy(''); setCur(null); }
  };
  runRef.current = run;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <label>총 건수<input type="number" value={total} onChange={e => setTotal(Number(e.target.value))} /></label>
        <label>키워드당 최대<input type="number" value={per} onChange={e => setPer(Number(e.target.value))} /></label>
        <label title="이 개수의 키워드를 뽑을 때마다 엑셀+이미지 묶음(zip) 하나를 바로 저장합니다">묶음 크기 (키워드 수)<input type="number" min={1} max={200} value={chunk} onChange={e => setChunk(e.target.value)} /></label>
        <label>담당자 (서명)<input value={owner} onChange={e => setOwner(e.target.value)} /></label>
        <label>연락처<input value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <label>제안서 기본 가격<input value={basic} onChange={e => setBasic(e.target.value)} placeholder="비우면 담당자 안내" /></label>
        <label>제안서 추천 가격<input value={rec} onChange={e => setRec(e.target.value)} placeholder="비우면 담당자 안내" /></label>
        <label>오픈채팅 링크 ({'{오픈채팅}'})<input value={kakao} onChange={e => setKakao(e.target.value)} placeholder="https://open.kakao.com/o/…" /></label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'end' }}><input type="checkbox" checked={onlyA} onChange={e => setOnlyA(e.target.checked)} style={{ width: 'auto' }} /> A형만 (제목·본문 1칸)</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'end' }} title="본문에 맞춤 제안서 이미지를 넣어 보내는 방식 — 엑셀의 제안서링크 칸과 본문 속 링크를 비웁니다"><input type="checkbox" checked={imgMode} onChange={e => setImgMode(e.target.checked)} style={{ width: 'auto' }} /> 맞춤 제안서 이미지로 (링크 없음)</label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {T({ v: tpl, set: setTpl, label: 'A (기본)' })}{!onlyA && <>{T({ v: tplB, set: setTplB, label: 'B (변형)' })}{T({ v: tplC, set: setTplC, label: 'C (변형)' })}</>}
      </div>
      <div className="help">변수: {'{업체명} {키워드} {순위} {담당자} {연락처} {제안서링크} {수신거부링크} {오픈채팅}'} · {'{수신거부링크}'}는 「수신거부 목록」에 저장한 전용 페이지 주소로 들어갑니다</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={formBusy} onClick={saveForm}>{formBusy ? '저장 중…' : '문구 저장'}</button>
        <span className="help">{savedAt ? `마지막 저장 ${new Date(new Date(savedAt).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ')} — 제목·본문·오픈채팅·담당자·연락처·가격이 같이 저장됩니다` : '저장하지 않으면 새로고침할 때 기본 문구로 돌아갑니다'}</span>
      </div>
      {resume && !busy && <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderColor: '#F79009' }}>
        <b>중단된 뽑기가 있습니다</b><span>남은 키워드 {resume.rest.length}개 · 묶음 {resume.done + 1}/{resume.parts}부터{resume.inflight.length ? ` · 저장 못 한 묶음(키워드 ${resume.inflight.length}개)의 기록은 지우고 다시 뽑습니다` : ''}</span>
        <button type="button" className="btn" onClick={() => run(resume)}>이어서 뽑기</button>
        <button type="button" className="btn ghost" onClick={() => { putResume(null); setResume(null); }}>버리기</button>
        <span className="help">담당자·오픈채팅·문구는 중단되기 전 값 그대로 이어집니다</span></div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn ghost" disabled={busy} onClick={() => doPlan()}>{busy ? (planMsg || '확인 중…') : '1. 대상 확인'}</button>
        <button className="btn ghost" disabled={busy} onClick={() => doPlan(true)} title="총 건수·키워드당 최대와 상관없이, 지금 보낼 수 있는 대상을 전부 뽑습니다">전체 뽑기</button>
        {failedKws.length > 0 && <button className="btn ghost" disabled={busy} onClick={retryFailed} title="지난번에 조회 한도 등으로 못 뽑은 키워드만 다시 뽑습니다 (이미 뽑은 키워드는 제외)">못 뽑은 키워드만 다시 ({failedKws.length}개)</button>}
        <button className="btn" disabled={busy || !plan} onClick={() => run()}>{busy ? (imgBusy ? `이미지 만드는 중 ${imgBusy}` : '만드는 중…') : imgMode ? '2. 엑셀 + 제안서 이미지 받기' : '2. 엑셀 받기'}</button>
        <button className="btn ghost" disabled={busy || !!imgBusy || !imgKws.length} onClick={getImages} title="키워드마다 맞춤 제안서 공용판 9장을 만들어 zip 하나로 받습니다 (키워드별 폴더)">{imgBusy && !busy ? `이미지 만드는 중 ${imgBusy}` : `이미지만 다시 받기${imgKws.length ? ` (키워드 ${imgKws.length}개)` : ''}`}</button>
        {plan && <span className="help">키워드 {plan.length}개 · {plan.reduce((a, p) => a + p.n, 0)}건</span>}
      </div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <b style={{ fontSize: 13 }}>추출기 CSV 올리기 (수동 전용 메일 대상 + 키워드 콜 리스트)</b>
        <div className="help">추출기에서 받은 CSV·엑셀(여러 개 가능)을 올리면 메일 대상에 '수동 전용'으로 들어갑니다. 수동 뽑기에만 나오고 직원 자동 발송에는 안 나옵니다. 이미 있는 업체는 그대로 두고 키워드만 더합니다. 필요한 열: 키워드 · 스토어명 · 이메일 (스토어 링크 · 전화번호는 있으면 같이).</div>
        <div><label className="btn ghost" style={{ cursor: impBusy ? 'default' : 'pointer' }}>{impBusy || 'CSV 올리기 (.csv / .xlsx)'}<input type="file" accept=".csv,.xlsx,.xls" multiple hidden disabled={!!impBusy || busy} onChange={e => { const f = e.target.files; uploadTargets(f).finally(() => { e.target.value = ''; }); }} /></label></div>
      </div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <b style={{ fontSize: 13 }}>이미 보낸 엑셀 올리기 · 재발송 금지 기간</b>
        <div className="help">예전에 받아서 이미 보낸 엑셀(여러 개 가능)을 올리면, 그 안의 메일 주소가 발송 기록으로 들어가 다음 뽑기와 자동 발송에서 빠집니다. 금지 기간은 올린 시점부터 셉니다.</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="btn ghost" style={{ cursor: upBusy ? 'default' : 'pointer' }}>{upBusy || '엑셀 올리기 (.xlsx)'}<input type="file" accept=".xlsx,.xls,.csv" multiple hidden disabled={!!upBusy || busy} onChange={e => { const f = e.target.files; uploadSent(f).finally(() => { e.target.value = ''; }); }} /></label>
          <span className="help">재발송 금지 기간</span>
          <input type="number" min={1} max={365} value={daysIn} onChange={e => setDaysIn(e.target.value)} style={{ width: 80 }} /><span className="help">일</span>
          <button type="button" className="btn ghost" disabled={Number(daysIn) === days || !Number(daysIn)} onClick={saveDays}>저장</button>
          <span className="help">(자동 발송에도 같이 적용)</span>
        </div>
      </div>
      {plan && <div className="card" style={{ fontSize: 13, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{plan.map(p => <span key={p.keyword} className="chip">{p.keyword} {p.n}</span>)}</div>}
      <link rel="stylesheet" href={PV3_FONT} crossOrigin="anonymous" /><style dangerouslySetInnerHTML={{ __html: PV3_CSS }} />
      {cur && <div ref={stage} aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 720, pointerEvents: 'none' }}>
        {Array.from({ length: PV3G_PAGES }, (_, i) => <div key={i} className="pv3g" style={{ width: 720 }}><Pv3CommonDoc k={cur.k} ka={cur.ka} brand={{ name: BRAND.name, email: BRAND.email, kakao: '' }} page={i + 1} /></div>)}</div>}
      {log.length > 0 && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, background: 'var(--bg)', padding: 12, borderRadius: 8, margin: 0 }}>{log.join('\n')}</pre>}
    </div>
  );
}
