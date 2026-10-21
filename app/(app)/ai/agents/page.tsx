import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { PageHeader, Section, Cell, Status } from '@/components/ui';
import { syncSchedules } from '../actions';
import { AiStats, Flash, KIND, cronKST, kst } from '../shared';
export const dynamic = 'force-dynamic';

/** AI팀 › 에이전트 · 자동 일정 */
export default async function AiAgentsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const me = await requireRole(['admin', 'head']);
  const sb = supabaseServer();
  const [{ data: agents }, { data: scheds }] = await Promise.all([
    sb.from('ai_agents').select('slug,name,team,role_desc,requires_review,active').order('sort'),
    sb.from('ai_schedules').select('slug,name,cron_utc,kind,active,last_enqueued_at').order('cron_utc'),
  ]);
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="AI팀 · 에이전트 · 자동 일정" badge={<span className="pill">테스트</span>} desc="일하는 에이전트 목록과 매일 도는 일정" />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <AiStats />
      <Section title="에이전트" sub={`${agents?.length ?? 0}명`} flush>
        <div className="tbl-wrap"><table><thead><tr><th>이름 · 팀</th><th>하는 일</th><th>상태</th></tr></thead><tbody>
          {(agents ?? []).map(a => <tr key={a.slug}><td style={{ width: 170 }}><Cell main={a.name} sub={a.team} /></td>
            <td><Cell main={a.role_desc} sub={a.requires_review ? '결과는 감사팀 검증 후 완료' : ''} /></td>
            <td><Status kind={a.active ? 'ok' : 'off'}>{a.active ? '활성' : '꺼짐'}</Status></td></tr>)}
        </tbody></table></div>
      </Section>
      <Section title="자동 일정" flush right={me.role === 'admin' ? <form action={syncSchedules}><input type="hidden" name="back" value="/ai/agents" /><button className="btn ghost xs" type="submit">일정 다시 등록</button></form> : null}>
        <div className="tbl-wrap"><table><thead><tr><th>일정</th><th>종류</th><th>마지막 생성</th><th>상태</th></tr></thead><tbody>
          {(scheds ?? []).map(s => <tr key={s.slug}><td><Cell main={s.name} sub={cronKST(s.cron_utc)} /></td><td>{KIND[s.kind] ?? s.kind}</td>
            <td className="muted">{kst(s.last_enqueued_at)}</td><td><Status kind={s.active ? 'ok' : 'off'}>{s.active ? '사용' : '중지'}</Status></td></tr>)}
        </tbody></table></div>
      </Section>
    </div>
  );
}
