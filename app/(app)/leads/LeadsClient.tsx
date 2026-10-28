'use client';
import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { Section } from '@/components/ui';
import { importLeads, saveLeadSettings, assignNow, recallToday, saveRecipients } from './actions';

// 열 이름 → 필드 (애드대시보드·엑셀 어떤 이름이든 아래 중 하나면 인식)
const MAP: Record<string, string[]> = {
  store_name: ['업체명', '상호', '상호명', '스토어명', '스토어', '광고주', '판매자', '몰이름', 'store', 'name', 'mall'],
  store_url: ['url', '링크', '주소', '스토어url', '스토어주소', '도메인', 'domain', 'link'],
  keyword: ['키워드', '검색어', 'keyword'],
  category: ['카테고리', '업종', '분야', 'category'],
  phone: ['전화', '전화번호', '연락처', '휴대폰', 'phone', 'tel'],
  ad_running: ['광고', '광고여부', '광고집행', '파워링크', '쇼핑검색광고', '쇼핑광고', 'ad'],
  rank_now: ['순위', '현재순위', '노출순위', 'rank'],
  rank_prev: ['이전순위', '전순위', '지난순위'],
  review_cnt: ['리뷰', '리뷰수', '리뷰개수', 'review', 'reviews'],
  opened_on: ['개설일', '오픈일', '등록일', '개설', 'opened'],
};
const norm = (h: string) => h.replace(/[\s_()\-\/.]/g, '').toLowerCase();
function parseCSV(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter(r => r.some(x => x.trim()));
}
const yes = (v: string) => /^(y|yes|o|1|예|true|집행|진행|있음|on)$/i.test(v.trim());
const int = (v: string) => { const n = parseInt(v.replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : null; };
const date = (v: string) => { const m = v.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null; };
async function readText(f: File) { const b = await f.arrayBuffer(); const u = new TextDecoder('utf-8').decode(b); return (u.match(/�/g)?.length ?? 0) > 5 ? new TextDecoder('euc-kr').decode(b) : u; }

type Person = { id: string; name: string; team_id: number | null };
export default function LeadsClient({ isAdmin, w, per, recontact, people, recipients }: { isAdmin: boolean; w: Record<string, number>; per: number; recontact: number; people: Person[]; recipients: string[] }) {
  const [sel, setSel] = useState<string[]>(recipients); const toggle = (id: string) => setSel(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
  const r = useRouter(); const [busy, start] = useTransition(); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState('');
  const upload = () => start(async () => {
    const rows = parseCSV(await readText(file!)); if (rows.length < 2) { notify('읽을 행이 없습니다. 첫 줄이 열 이름인 CSV인지 확인하세요.', 'bad'); return; }
    const head = rows[0].map(norm); const idx: Record<string, number> = {};
    for (const [f, names] of Object.entries(MAP)) { const i = head.findIndex(h => names.map(norm).includes(h)); if (i >= 0) idx[f] = i; }
    if (idx.store_name === undefined) { notify(`업체명 열을 못 찾았습니다. 첫 줄: ${rows[0].slice(0, 8).join(', ')}`, 'bad'); return; }
    const data = rows.slice(1).map(c => {
      const g = (f: string) => (idx[f] !== undefined ? (c[idx[f]] ?? '').trim() : '');
      const o: Record<string, unknown> = { store_name: g('store_name') };
      for (const f of ['store_url', 'keyword', 'category', 'phone']) if (g(f)) o[f] = g(f);
      if (idx.ad_running !== undefined) o.ad_running = yes(g('ad_running'));
      for (const f of ['rank_now', 'rank_prev', 'review_cnt']) { const n = int(g(f)); if (n !== null) o[f] = n; }
      const d = date(g('opened_on')); if (d) o.opened_on = d;
      return o;
    });
    setPreview(`인식한 열: ${Object.keys(idx).join(', ')} · ${data.length}행`);
    let add = 0, upd = 0, skip = 0;
    for (let i = 0; i < data.length; i += 500) {
      const x = await importLeads(data.slice(i, i + 500), file!.name);
      if (!x.ok) { notify(x.msg, 'bad'); return; }
      const m = x.msg.match(/\d+/g)!.map(Number); add += m[0]; upd += m[1]; skip += m[2];
    }
    notify(`업로드 완료 — 새 업체 ${add} · 갱신 ${upd} · 건너뜀 ${skip}`); setFile(null); r.refresh();
  });
  const act = (p: Promise<{ ok: boolean; msg: string }>) => start(async () => { const x = await p; notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) r.refresh(); });

  return (
    <div className="grid2">
      <Section title="업체 올리기" sub="CSV (엑셀 › 다른 이름으로 저장 › CSV)">
        <div style={{ display: 'grid', gap: 10 }}>
          <input type="file" accept=".csv,.txt,.tsv" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <div className="muted">필수: 업체명. 있으면 반영: 스토어URL · 키워드 · 업종 · 전화 · 광고여부 · 순위 · 이전순위 · 리뷰수 · 개설일. 같은 업체는 정보만 갱신(순위가 바뀌면 이전 순위 자동 보관).</div>
          {preview && <div className="muted">{preview}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" disabled={!file || busy} onClick={upload}>{busy ? '처리 중…' : '올리기'}</button>
            <button className="btn ghost sm" disabled={busy} onClick={() => act(assignNow())}>지금 배분</button>
            <button className="btn ghost sm" disabled={busy} style={{ color: 'var(--bad-ink)' }} onClick={() => { if (confirm('오늘 배분된 건 중 결과를 안 남긴 것을 전부 회수해서 배분 대기로 돌립니다. 계속할까요?')) act(recallToday()); }}>오늘 배분 수거</button>
          </div>
        </div>
      </Section>
      <Section title="배분 대상" sub={sel.length ? `${sel.length}명에게만 배분` : '영업사원 전원에게 배분'} style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {people.map(p => <label key={p.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: sel.includes(p.id) ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer' }}><input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} />{p.name}</label>)}
          <button type="button" className="btn ghost sm" onClick={() => setSel(people.map(p => p.id))}>전체</button>
          <button type="button" className="btn ghost sm" onClick={() => setSel([])}>해제(전원)</button>
          <button type="button" className="btn sm" disabled={busy} onClick={() => act(saveRecipients(sel))}>저장</button>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>체크한 사람에게만 아침 자동 배분·「지금 배분」이 나갑니다. 아무도 안 고르면 영업사원 전원.</div>
      </Section>
      <Section title="점수 · 배분 기준" sub={isAdmin ? '어드민 수정 가능' : '어드민만 수정'}>
        <form action={fd => act(saveLeadSettings(fd))} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, alignItems: 'center' }}>
          {([['ad_running', '광고 집행 중'], ['rank_drop', '순위 하락'], ['review_vs_rank', '리뷰 100+인데 40위 밖'], ['new_store', '개설 6개월 이내'], ['has_phone', '전화번호 있음']] as const).map(([k, l]) =>
            <Fragment key={k}><label htmlFor={k}>{l} (점)</label><input id={k} name={k} type="number" defaultValue={w[k] ?? 0} disabled={!isAdmin} /></Fragment>)}
          <label htmlFor="per">1인당 하루 배분 (곳)</label><input id="per" name="per" type="number" defaultValue={per} disabled={!isAdmin} />
          <label htmlFor="recontact">거절 후 다시 배분까지 (일)</label><input id="recontact" name="recontact" type="number" defaultValue={recontact} disabled={!isAdmin} />
          {isAdmin && <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}><button className="btn sm" disabled={busy}>저장</button></div>}
        </form>
      </Section>
    </div>
  );
}
