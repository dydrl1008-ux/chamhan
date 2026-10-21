import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { PageHeader, Section, Cell, Status, Empty } from '@/components/ui';
import { sendOrder } from '../actions';
import { AiStats, Flash, KIND, ST, SRC, kst } from '../shared';
export const dynamic = 'force-dynamic';

type Task = { id: number; kind: string; agent: string | null; parent_id: number | null; title: string; instruction: string; status: string; source: string; requested_by: string | null; result: string | null; audit_note: string | null; created_at: string };

/** AI팀 › 지시 · 작업 현황 */
export default async function AiOrdersPage({ searchParams }: { searchParams: { task?: string; msg?: string; err?: string } }) {
  await requireRole(['admin', 'head']);
  const sb = supabaseServer();
  const [{ data: tasks }, { data: agents }] = await Promise.all([
    sb.from('ai_tasks').select('id,kind,agent,parent_id,title,instruction,status,source,requested_by,result,audit_note,created_at').in('kind', ['order', 'check', 'briefing']).order('id', { ascending: false }).limit(50),
    sb.from('ai_agents').select('slug,name'),
  ]);
  const agentName = Object.fromEntries((agents ?? []).map(a => [a.slug, a.name]));
  const tid = Number(searchParams.task) || 0;
  let detail: Task | null = null; let subs: Task[] = [];
  if (tid) {
    const [{ data: d }, { data: s }] = await Promise.all([
      sb.from('ai_tasks').select('*').eq('id', tid).maybeSingle(),
      sb.from('ai_tasks').select('*').eq('parent_id', tid).eq('kind', 'work').order('id'),
    ]);
    detail = d as Task | null; subs = (s ?? []) as Task[];
  }
  const stat = (s: string) => <Status kind={(ST[s] ?? ['', 'off'])[1]}>{(ST[s] ?? [s])[0]}</Status>;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="AI팀 · 지시 · 작업 현황" badge={<span className="pill">테스트</span>} desc="비서실장에게 지시하고 처리 결과·검증 판정을 확인" help={<>
        텔레그램 봇에 말로 지시하거나 아래 입력칸으로 지시합니다. 사실·숫자가 들어간 결과는 감사팀 검증 담당이 근거를 다시 확인한 뒤에만 「완료」가 됩니다.</>} />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <AiStats />

      {detail && (
        <Section title={`#${detail.id} ${KIND[detail.kind] ?? detail.kind}`} sub={`${SRC[detail.source] ?? detail.source} · ${detail.requested_by ?? ''} · ${kst(detail.created_at)}`} right={<a className="btn ghost xs" href="/ai/orders">닫기</a>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><div className="muted">지시</div><div style={{ whiteSpace: 'pre-wrap' }}>{detail.instruction}</div></div>
            <div><div className="muted">상태</div>{stat(detail.status)}</div>
            {detail.result && <div><div className="muted">결과</div><div style={{ whiteSpace: 'pre-wrap' }}>{detail.result}</div></div>}
            {detail.audit_note && <div><div className="muted">감사팀 판정</div><div>{detail.audit_note}</div></div>}
            {subs.length > 0 && (
              <div className="tbl-wrap"><table><thead><tr><th>#</th><th>담당</th><th>지시</th><th>상태</th><th>결과 · 검증</th></tr></thead><tbody>
                {subs.map(s => <tr key={s.id}><td>{s.id}</td><td>{agentName[s.agent ?? ''] ?? s.agent}</td><td style={{ maxWidth: 260 }}>{s.instruction}</td><td>{stat(s.status)}</td>
                  <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}><Cell main={(s.result ?? '').slice(0, 300)} sub={s.audit_note ?? ''} /></td></tr>)}
              </tbody></table></div>)}
          </div>
        </Section>
      )}

      <Section title="비서실장에게 지시">
        <form action={sendOrder} style={{ display: 'grid', gap: 10 }}>
          <input type="hidden" name="back" value="/ai/orders" />
          <textarea name="instruction" rows={3} placeholder="예) 신규 셀러용 리워드 소개 메일 초안 써줘" required />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn sm" type="submit">지시 보내기</button></div>
        </form>
      </Section>

      <Section title="최근 지시 · 점검 · 브리핑" sub="50건" flush>
        {tasks?.length ? <div className="tbl-wrap"><table>
          <thead><tr><th>#</th><th>종류</th><th>내용</th><th>상태</th><th>접수</th></tr></thead>
          <tbody>{(tasks as Task[]).map(t => <tr key={t.id}>
            <td><a href={`/ai/orders?task=${t.id}`}>{t.id}</a></td>
            <td>{KIND[t.kind] ?? t.kind}</td>
            <td style={{ maxWidth: 520 }}><a href={`/ai/orders?task=${t.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><Cell main={t.title || t.instruction.slice(0, 80)} sub={(t.audit_note ? `검증: ${t.audit_note} · ` : '') + (t.result ?? '').replace(/\s+/g, ' ').slice(0, 120)} /></a></td>
            <td>{stat(t.status)}</td>
            <td><Cell main={kst(t.created_at)} sub={`${SRC[t.source] ?? t.source}${t.requested_by ? ' · ' + t.requested_by : ''}`} /></td>
          </tr>)}</tbody></table></div> : <div style={{ padding: 20 }}><Empty>아직 작업이 없습니다.</Empty></div>}
      </Section>
    </div>
  );
}
