import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { PageHeader, Section, Cell, Status, Empty } from '@/components/ui';
import { AiStats, kst } from '../shared';
import AgenciesClient, { type Agency } from './AgenciesClient';
export const dynamic = 'force-dynamic';

const TABS: [string, string][] = [['drafted', '초안'], ['approved', '승인'], ['sent', '보냄'], ['replied', '회신'], ['joined', '합류'], ['new', '초안 없음'], ['rejected', '거절'], ['excluded', '제외'], ['all', '전체']];
const IMP: Record<string, ['ok' | 'wait' | 'bad', string]> = { queued: ['wait', '대기'], running: ['wait', '추출 중'], done: ['ok', '완료'], failed: ['bad', '실패'] };

/** AI팀 › 대행사 컨택 */
export default async function AgenciesPage({ searchParams }: { searchParams: { s?: string; c?: string } }) {
  await requireRole(['admin', 'head']);
  const tab = TABS.some(t => t[0] === searchParams.s) ? searchParams.s! : 'drafted';
  const cat = searchParams.c || '';
  const sb = supabaseServer();
  let q = sb.from('agencies').select('id,name,sender,kakao,phone,other,products,category,source_room,sample,status,draft,note,sent_at,created_at').order('id', { ascending: false }).limit(300);
  if (tab !== 'all') q = q.eq('status', tab);
  if (cat) q = q.eq('category', cat);
  const [{ data: rows }, { data: counts }, { data: imports }] = await Promise.all([
    q,
    sb.from('agencies').select('status'),
    sb.from('agency_imports').select('id,file_name,source_room,status,found,added,drafted,message,created_at').order('id', { ascending: false }).limit(8),
  ]);
  const cnt: Record<string, number> = {}; (counts ?? []).forEach(r => { cnt[r.status] = (cnt[r.status] ?? 0) + 1; }); cnt.all = counts?.length ?? 0;
  const link = (s: string, c = cat) => `/ai/agencies?s=${s}${c ? `&c=${c}` : ''}`;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="AI팀 · 대행사 컨택" badge={<span className="pill">테스트</span>} desc="홍보방 대화 → 대행사 목록 → 메시지 초안 → 승인 후 발송"
        help={<>카카오톡 오픈채팅방 › 메뉴 › 대화 내보내기로 받은 txt 파일을 올리면, 연락처가 있는 대행사만 뽑아 권용기 부장 명의 첫 메시지 초안을 씁니다. 크몽 판매자·연락처 없는 곳·원문에 없는 연락처는 자동 제외됩니다. 발송은 사람이 합니다.</>} />
      <AiStats />
      <AgenciesClient mode="upload" rows={[]} />
      {imports?.length ? <Section title="최근 업로드" flush><div className="tbl-wrap"><table><tbody>
        {imports.map(i => <tr key={i.id}><td style={{ width: 60 }}>#{i.id}</td><td><Cell main={i.source_room || i.file_name} sub={i.message ?? ''} /></td>
          <td style={{ width: 110 }}><Status kind={IMP[i.status]?.[0] ?? 'off'}>{IMP[i.status]?.[1] ?? i.status}</Status></td><td className="muted" style={{ width: 110 }}>{kst(i.created_at)}</td></tr>)}
      </tbody></table></div></Section> : null}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(([k, label]) => <a key={k} href={link(k)} className={'btn xs ' + (tab === k ? '' : 'ghost')}>{label} {cnt[k] ?? 0}</a>)}
        <span style={{ flex: 1 }} />
        {[['', '전체 분야'], ['shopping_reward', '쇼핑 리워드'], ['place', '플레이스'], ['blog_cafe', '블로그·카페'], ['sns', 'SNS'], ['other', '기타']].map(([k, l]) =>
          <a key={k} href={link(tab, k)} className="help" style={{ fontWeight: cat === k ? 800 : 500, textDecoration: cat === k ? 'underline' : 'none' }}>{l}</a>)}
        <a className="btn ghost xs" href="/ai/agencies/export?status=approved">승인 목록 CSV</a>
      </div>
      {rows?.length ? <AgenciesClient mode="table" rows={rows as Agency[]} /> : <Section><Empty>해당 상태의 대행사가 없습니다.</Empty></Section>}
    </div>
  );
}
