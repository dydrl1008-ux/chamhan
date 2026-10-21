'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/components/Toast';
import { Section, Status } from '@/components/ui';
import { uploadExport, setAgencyStatus, saveAgency, redraft } from './actions';

export type Agency = { id: number; name: string; sender: string; kakao: string; phone: string; other: string; products: string; category: string; source_room: string; sample: string; status: string; draft: string; note: string; sent_at: string | null; created_at: string };

const CAT: Record<string, string> = { shopping_reward: '쇼핑 리워드', place: '플레이스', blog_cafe: '블로그·카페', sns: 'SNS', other: '기타' };
const ST: Record<string, [string, 'ok' | 'wait' | 'bad' | 'off']> = {
  new: ['초안 없음', 'off'], drafted: ['초안', 'wait'], approved: ['승인', 'ok'], sent: ['보냄', 'ok'],
  replied: ['회신', 'ok'], joined: ['합류', 'ok'], rejected: ['거절', 'bad'], excluded: ['제외', 'off'],
};

// ── 카톡 내보내기에서 홍보글만 추리기 (브라우저에서 줄여서 보냄 → 큰 파일도 업로드 가능) ──
const HEAD = [/^\[[^\]]{1,60}\] \[(?:오전|오후|AM|PM) ?\d{1,2}:\d{2}\]/, /^\d{4}[.년]\s*\d{1,2}[.월]\s*\d{1,2}[.일]?\.?\s*(?:오전|오후)?\s*\d{1,2}:\d{2},\s*[^:]{1,60}?\s*:/, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},"/];
const CONTACT = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|open\.kakao\.com|pf\.kakao\.com|https?:\/\/|카톡|카카오|오픈채팅|텔레그램/;
const SIGNAL = /리워드|트래픽|상위노출|대행|슬롯|문의|상담|작업|마케팅|광고/;
function slimExport(raw: string): { text: string; msgs: number; kept: number } {
  const lines = raw.replace(/\r\n/g, '\n').split('\n'); const msgs: string[] = []; let cur = '';
  for (const l of lines) { if (HEAD.some(h => h.test(l))) { if (cur) msgs.push(cur); cur = l; } else if (cur && l.trim() && !l.startsWith('---------------')) cur += '\n' + l; }
  if (cur) msgs.push(cur);
  const seen = new Set<string>(); const kept: string[] = [];
  for (const m of msgs) {
    if (!CONTACT.test(m) && !(m.length >= 60 && SIGNAL.test(m))) continue;
    const key = m.replace(/^\[[^\]]*\] \[[^\]]*\]|^[^,]*,/, '').replace(/\s+/g, '').slice(0, 300);
    if (seen.has(key)) continue; seen.add(key); kept.push(m.slice(0, 2000));
  }
  return { text: kept.join('\n'), msgs: msgs.length, kept: kept.length };
}
async function readText(f: File): Promise<string> {
  const buf = await f.arrayBuffer(); const utf = new TextDecoder('utf-8').decode(buf);
  return (utf.match(/�/g)?.length ?? 0) > 20 ? new TextDecoder('euc-kr').decode(buf) : utf;
}

export default function AgenciesClient({ mode, rows }: { mode: 'upload' | 'table'; rows: Agency[] }) {
  const r = useRouter(); const [busy, start] = useTransition();
  const [room, setRoom] = useState(''); const [file, setFile] = useState<File | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set()); const [open, setOpen] = useState<number | null>(null);
  const [edit, setEdit] = useState<Record<number, { draft: string; note: string }>>({});
  const run = (p: Promise<{ ok: boolean; msg: string }>) => start(async () => { const x = await p; notify(x.msg, x.ok ? 'ok' : 'bad'); if (x.ok) { setSel(new Set()); r.refresh(); } });

  if (mode === 'upload') return (
    <Section title="홍보방 대화 올리기" sub="카카오톡 › 대화 내보내기 txt (여러 개면 하나씩)">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="file" accept=".txt,.csv" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <input placeholder="홍보방 이름 (예: 리워드 대행사 홍보방)" value={room} onChange={e => setRoom(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <button className="btn sm" disabled={!file || busy} onClick={() => start(async () => {
          const raw = await readText(file!); const s = slimExport(raw);
          if (!s.kept) { notify(`홍보글을 찾지 못했습니다 (메시지 ${s.msgs}개 인식). 카톡 대화 내보내기 파일인지 확인하세요.`, 'bad'); return; }
          const x = await uploadExport(file!.name, room, s.text);
          notify(x.ok ? `${x.msg} (메시지 ${s.msgs}개 중 홍보글 ${s.kept}개)` : x.msg, x.ok ? 'ok' : 'bad');
          if (x.ok) { setFile(null); setRoom(''); r.refresh(); }
        })}>{busy ? '올리는 중…' : '올리고 추출 시작'}</button>
      </div>
    </Section>
  );

  const ids = [...sel]; const all = rows.length > 0 && sel.size === rows.length;
  const toggle = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const copy = async (a: Agency) => { await navigator.clipboard.writeText(edit[a.id]?.draft ?? a.draft); notify(`${a.name} 메시지 복사됨`); };
  return (
    <Section flush title={`대행사 ${rows.length}곳`} right={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn xs" disabled={!sel.size || busy} onClick={() => run(setAgencyStatus(ids, 'approved'))}>승인</button>
      <button className="btn ghost xs" disabled={!sel.size || busy} onClick={() => run(setAgencyStatus(ids, 'sent'))}>보냄 표시</button>
      <button className="btn ghost xs" disabled={!sel.size || busy} onClick={() => run(redraft(ids))}>초안 다시</button>
      <button className="btn danger xs" disabled={!sel.size || busy} onClick={() => run(setAgencyStatus(ids, 'excluded'))}>제외</button>
    </div>}>
      <div className="tbl-wrap"><table>
        <thead><tr><th style={{ width: 32 }}><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map(x => x.id)))} /></th><th>업체 · 상품</th><th>연락처</th><th>메시지 초안</th><th>상태</th></tr></thead>
        <tbody>{rows.map(a => {
          const e = edit[a.id] ?? { draft: a.draft, note: a.note }; const isOpen = open === a.id;
          return <tr key={a.id} style={{ verticalAlign: 'top' }}>
            <td><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} /></td>
            <td style={{ minWidth: 180 }}><div className="cell-main">{a.name}</div><div className="cell-sub">{CAT[a.category] ?? a.category} · {a.products}</div><div className="cell-sub">{a.source_room}{a.sender && a.sender !== a.name ? ` · ${a.sender}` : ''}</div></td>
            <td style={{ minWidth: 170, fontSize: 13 }}>
              {a.kakao && <div><a href={a.kakao.startsWith('http') ? a.kakao : `https://${a.kakao}`} target="_blank" rel="noreferrer">{a.kakao.replace(/^https?:\/\//, '').slice(0, 34)}</a></div>}
              {a.phone && <div>{a.phone}</div>}{a.other && <div className="cell-sub">{a.other.slice(0, 60)}</div>}
            </td>
            <td style={{ minWidth: 320 }}>
              {isOpen ? <div style={{ display: 'grid', gap: 6 }}>
                <textarea rows={9} value={e.draft} onChange={ev => setEdit(s => ({ ...s, [a.id]: { ...e, draft: ev.target.value } }))} />
                <input placeholder="메모 (회신 내용 등)" value={e.note} onChange={ev => setEdit(s => ({ ...s, [a.id]: { ...e, note: ev.target.value } }))} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn xs" disabled={busy} onClick={() => run(saveAgency(a.id, e.draft, e.note))}>저장</button>
                  <button className="btn ghost xs" onClick={() => copy(a)}>복사</button>
                  <button className="btn ghost xs" onClick={() => setOpen(null)}>닫기</button>
                </div>
              </div> : <div style={{ cursor: 'pointer' }} onClick={() => setOpen(a.id)}>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, maxHeight: 64, overflow: 'hidden' }}>{a.draft || <span className="muted">초안 없음</span>}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {a.draft && <button className="btn ghost xs" onClick={ev => { ev.stopPropagation(); copy(a); }}>복사</button>}
                  <span className="help" style={{ fontSize: 12.5 }}>열어서 수정</span>
                </div>
              </div>}
            </td>
            <td style={{ minWidth: 110 }}>
              <Status kind={(ST[a.status] ?? ['', 'off'])[1]}>{(ST[a.status] ?? [a.status])[0]}</Status>
              {a.note && <div className="cell-sub" style={{ marginTop: 4 }}>{a.note.slice(0, 40)}</div>}
              {['sent', 'replied'].includes(a.status) && <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {a.status === 'sent' && <button className="btn ghost xs" disabled={busy} onClick={() => run(setAgencyStatus([a.id], 'replied'))}>회신</button>}
                <button className="btn ghost xs" disabled={busy} onClick={() => run(setAgencyStatus([a.id], 'joined'))}>합류</button>
                <button className="btn ghost xs" disabled={busy} onClick={() => run(setAgencyStatus([a.id], 'rejected'))}>거절</button>
              </div>}
            </td>
          </tr>;
        })}</tbody>
      </table></div>
    </Section>
  );
}
