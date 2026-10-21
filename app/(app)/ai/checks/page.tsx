import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { PageHeader, Section, Cell, Status, Empty } from '@/components/ui';
import { runCheckNow } from '../actions';
import { AiStats, Flash, CK, kst } from '../shared';
export const dynamic = 'force-dynamic';

/** AI팀 › 점검 결과 */
export default async function AiChecksPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireRole(['admin', 'head']);
  const sb = supabaseServer();
  const [{ data: latest }, { data: checks }, { data: history }] = await Promise.all([
    sb.from('ai_check_latest').select('check_slug,name,status,seen,detail,run_at').order('sort'),
    sb.from('ai_checks').select('slug,name,description,active').order('sort'),
    sb.from('ai_check_results').select('id,check_slug,status,seen,detail,run_at').neq('status', 'ok').order('run_at', { ascending: false }).limit(50),
  ]);
  const name = Object.fromEntries((checks ?? []).map(c => [c.slug, c.name]));
  const desc = Object.fromEntries((checks ?? []).map(c => [c.slug, c.description]));
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="AI팀 · 점검 결과" badge={<span className="pill">테스트</span>} desc="매일 07:30 자동 점검. 빨간불은 텔레그램과 알림으로 전달"
        actions={<form action={runCheckNow}><input type="hidden" name="back" value="/ai/checks" /><button className="btn sm" type="submit">지금 점검</button></form>} />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <AiStats />
      <Section title="검사기별 최신 결과" flush>
        {latest?.length ? <div className="tbl-wrap"><table><thead><tr><th>검사</th><th>결과</th><th>본 대상</th><th>시각</th></tr></thead><tbody>
          {latest.map(c => <tr key={c.check_slug}><td style={{ width: 200 }}><Cell main={<Status kind={CK[c.status] ?? 'off'}>{c.name}</Status>} sub={desc[c.check_slug]} /></td>
            <td>{c.detail}</td><td className="num">{c.seen}</td><td className="muted">{kst(c.run_at)}</td></tr>)}
        </tbody></table></div> : <div style={{ padding: 20 }}><Empty>아직 점검 기록이 없습니다. 실행기를 켠 뒤 「지금 점검」을 눌러 보세요.</Empty></div>}
      </Section>
      <Section title="최근 이상 기록" sub="노란불·빨간불 50건" flush>
        {history?.length ? <div className="tbl-wrap"><table><tbody>
          {history.map(h => <tr key={h.id}><td style={{ width: 200 }}><Status kind={CK[h.status] ?? 'off'}>{name[h.check_slug] ?? h.check_slug}</Status></td><td>{h.detail}</td><td className="muted" style={{ width: 110 }}>{kst(h.run_at)}</td></tr>)}
        </tbody></table></div> : <div style={{ padding: 20 }}><Empty>이상 기록 없음</Empty></div>}
      </Section>
    </div>
  );
}
