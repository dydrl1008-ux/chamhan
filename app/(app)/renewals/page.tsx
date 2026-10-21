import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { todayKST } from '@/lib/date/kst';
import { PageHeader, Section, Empty, Stat } from '@/components/ui';
import RenewalsClient, { type Churn, type Person } from './RenewalsClient';
export const dynamic = 'force-dynamic';

const COLS = 'id,owner_id,cust_name,prod_name,biz_no,slots,date_to,status,alert_level,give_up_reason,given_up_at,assignee_id,assigned_at,closed_reason,renewed_at';

/** 이탈 고객 — 연장 안 된 업체 관리. 영업사원: 내 미결제·넘어온 업체 / 어드민·총괄: 포기 업체 분배 */
export default async function RenewalsPage() {
  const me = (await getProfile())!;
  const lead = me.role === 'admin' || me.role === 'head';
  const sb = supabaseServer(); const today = todayKST();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: mine }, { data: toMe }, { data: all }, { data: people }, { data: names }] = await Promise.all([
    sb.from('renewal_churn').select(COLS).eq('owner_id', me.id).in('status', ['open', 'given_up']).order('date_to'),
    sb.from('renewal_churn').select(COLS).eq('assignee_id', me.id).eq('status', 'reassigned').order('assigned_at', { ascending: false }),
    lead ? sb.from('renewal_churn').select(COLS).or(`status.in.(open,given_up,reassigned),updated_at.gte.${since}`).order('date_to').limit(1000) : Promise.resolve({ data: [] }),
    lead ? sb.from('v_sales_people').select('id,name').order('name') : Promise.resolve({ data: [] }),
    lead ? sb.from('profiles').select('id,name') : Promise.resolve({ data: [] }),
  ]);
  const nm: Record<string, string> = Object.fromEntries(((names ?? []) as Person[]).map(p => [p.id, p.name]));
  const a = (all ?? []) as Churn[];
  const waiting = a.filter(x => x.status === 'given_up'), open = a.filter(x => x.status === 'open'), moved = a.filter(x => x.status === 'reassigned');
  const done = a.filter(x => x.status === 'renewed' || x.status === 'closed');
  const m = (mine ?? []) as Churn[], t = (toMe ?? []) as Churn[];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="이탈 고객" badge={<span className="pill">테스트</span>}
        desc="작업이 끝났는데 연장 정산이 없는 업체"
        help={<>종료 후 <b>7일·14일</b>이 지나도 연장이 없으면 알림이 옵니다. 연장이 어렵다고 판단되면 「포기」를 누르세요 → 어드민·총괄이 다른 영업사원에게 분배합니다. 누가 팔든 같은 업체·상품 정산이 새로 올라오면 자동으로 「연장됨」 처리됩니다. 매일 평일 09:05 연장 체크 때 갱신.</>} />

      {lead && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Stat label="미결제 (담당자 진행 중)" value={`${open.length}곳`} desc={`2주 넘음 ${open.filter(x => x.alert_level >= 2).length}곳`} tone={open.some(x => x.alert_level >= 2) ? 'bad' : undefined} />
        <Stat label="포기 · 분배 대기" value={`${waiting.length}곳`} tone={waiting.length ? 'wait' : undefined} />
        <Stat label="분배됨 (진행 중)" value={`${moved.length}곳`} />
        <Stat label="최근 30일 결과" value={`연장 ${done.filter(x => x.status === 'renewed').length}`} desc={`종료 ${done.filter(x => x.status === 'closed').length}`} />
      </div>}

      {lead && <Section title="포기 업체 · 분배" sub={waiting.length ? `${waiting.length}곳 대기` : '대기 없음'} flush>
        {waiting.length ? <RenewalsClient mode="distribute" rows={waiting} people={(people ?? []) as Person[]} names={nm} today={today} />
          : <div style={{ padding: 20 }}><Empty>담당자가 포기한 업체가 없습니다.</Empty></div>}
      </Section>}

      {!lead || m.length ? <Section title="내 미결제" sub={m.length ? `${m.length}곳` : ''} flush>
        {m.length ? <RenewalsClient mode="mine" rows={m} today={today} /> : <div style={{ padding: 20 }}><Empty>연장 안 된 업체가 없습니다.</Empty></div>}
      </Section> : null}

      {t.length ? <Section title="나에게 넘어온 업체" sub={`${t.length}곳 · 다른 담당자가 포기한 고객`} flush>
        <RenewalsClient mode="tome" rows={t} today={today} />
      </Section> : null}

      {lead && <Section title="전체 현황" sub="담당자별 미결제 · 분배 진행 · 최근 결과" flush>
        {open.length + moved.length + done.length ? <RenewalsClient mode="all" rows={[...open, ...moved, ...done]} names={nm} today={today} />
          : <div style={{ padding: 20 }}><Empty>아직 쌓인 이탈 고객이 없습니다. 연장 체크가 한 번 돌면 채워집니다.</Empty></div>}
      </Section>}
    </div>
  );
}
