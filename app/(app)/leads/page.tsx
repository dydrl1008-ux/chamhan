import { requireRole } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import { PageHeader, Section, Cell, Empty } from '@/components/ui';
import { AiStats, kst } from '../ai/shared';
import LeadsClient from './LeadsClient';
export const dynamic = 'force-dynamic';

const LS: Record<string, string> = { new: '배분 대기', assigned: '오늘 배분', called: '연결 안 됨', interested: '관심', rejected: '거절', won: '계약', excluded: '제외' };

/** 콜 리스트 관리 */
export default async function LeadsAdminPage() {
  const me = await requireRole(['admin', 'head']);
  const sb = supabaseServer(); const today = todayKST();
  const [{ data: st }, { data: settings }, { data: todayRows }, { data: people }, { data: imports }, { data: hot }] = await Promise.all([
    sb.from('leads').select('status'),
    sb.from('app_settings').select('key,value').in('key', ['lead_score_weights', 'lead_daily_per_person', 'lead_recontact_days', 'lead_recipients']),
    sb.from('leads').select('assigned_to,status').eq('assigned_date', today),
    sb.from('v_sales_people').select('id,name,team_id').order('name'),
    sb.from('lead_imports').select('id,file_name,rows_in,added,updated,skipped,created_at').order('id', { ascending: false }).limit(5),
    sb.from('proposals').select('code,title,views,last_view_at,owner_id').gt('views', 0).order('last_view_at', { ascending: false }).limit(15),
  ]);
  const cnt: Record<string, number> = {}; (st ?? []).forEach(r => { cnt[r.status] = (cnt[r.status] ?? 0) + 1; });
  const s = Object.fromEntries((settings ?? []).map(x => [x.key, x.value]));
  const w = JSON.parse(s.lead_score_weights || '{}'); const name = Object.fromEntries((people ?? []).map(p => [p.id, p.name]));
  const per: Record<string, Record<string, number>> = {};
  (todayRows ?? []).forEach(r => { const k = r.assigned_to ?? '-'; per[k] = per[k] ?? {}; per[k][r.status] = (per[k][r.status] ?? 0) + 1; });

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="콜 리스트 관리" desc="업체 업로드 → 점수 → 평일 09:00 영업사원별 자동 배분 (AI 사용 안 함)" />
      <AiStats />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {Object.entries(LS).map(([k, l]) => <span key={k} className="pill" style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--ink)' }}>{l} {cnt[k] ?? 0}</span>)}
      </div>
      <LeadsClient isAdmin={me.role === 'admin'} w={w} per={Number(s.lead_daily_per_person || 30)} recontact={Number(s.lead_recontact_days || 30)} people={(people ?? []) as { id: string; name: string; team_id: number | null }[]} recipients={(() => { try { return JSON.parse(s.lead_recipients || '[]') as string[]; } catch { return []; } })()} />
      <div className="grid2">
        <Section title="오늘 배분 · 결과" sub={today} flush>
          {Object.keys(per).length ? <div className="tbl-wrap"><table><thead><tr><th>영업사원</th><th>배분</th><th>남음</th><th>관심</th><th>계약</th><th>거절·부재</th></tr></thead><tbody>
            {Object.entries(per).map(([id, c]) => { const tot = Object.values(c).reduce((a, b) => a + b, 0);
              return <tr key={id}><td>{name[id] ?? '-'}</td><td className="num">{tot}</td><td className="num">{c.assigned ?? 0}</td><td className="num">{c.interested ?? 0}</td><td className="num">{c.won ?? 0}</td><td className="num">{(c.rejected ?? 0) + (c.called ?? 0)}</td></tr>; })}
          </tbody></table></div> : <div style={{ padding: 20 }}><Empty>오늘 배분된 리스트가 없습니다.</Empty></div>}
        </Section>
        <Section title="제안서 열람 (최근)" flush>
          {hot?.length ? <div className="tbl-wrap"><table><tbody>
            {hot.map(h => <tr key={h.code}><td><Cell main={h.title || h.code} sub={name[h.owner_id ?? ''] ?? ''} /></td><td className="num">{h.views}회</td><td className="muted">{kst(h.last_view_at)}</td></tr>)}
          </tbody></table></div> : <div style={{ padding: 20 }}><Empty>아직 열람 기록이 없습니다.</Empty></div>}
        </Section>
      </div>
      {imports?.length ? <Section title="최근 업로드" flush><div className="tbl-wrap"><table><tbody>
        {imports.map(i => <tr key={i.id}><td>{i.file_name}</td><td className="muted">{i.rows_in}행 · 새 {i.added} · 갱신 {i.updated} · 건너뜀 {i.skipped}</td><td className="muted">{kst(i.created_at)}</td></tr>)}
      </tbody></table></div></Section> : null}
    </div>
  );
}
