import { getProfile } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { PageHeader, Section, Cell, Empty } from '@/components/ui';
import { markAllRead, openNotification } from './actions';
export const dynamic = 'force-dynamic';
const kst = (s: string) => new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

export default async function NotificationsPage() {
  const me = (await getProfile())!;
  const { data } = await supabaseServer().from('notifications').select('id,kind,title,body,link,created_at,read_at')
    .eq('user_id', me.id).order('created_at', { ascending: false }).limit(100);
  const unread = (data ?? []).filter(n => !n.read_at).length;
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <PageHeader title="알림" desc={unread ? `안 읽은 알림 ${unread}건` : '모두 읽음'}
        actions={unread ? <form action={markAllRead}><button className="btn ghost sm" type="submit">모두 읽음</button></form> : null} />
      <Section flush>
        {data?.length ? <div className="tbl-wrap"><table><tbody>
          {data.map(n => <tr key={n.id} style={{ background: n.read_at ? undefined : 'var(--accent-soft)' }}>
            <td style={{ width: 8 }}>{!n.read_at && <span className="badge" style={{ padding: '1px 5px' }}> </span>}</td>
            <td><Cell main={n.title} sub={n.body} /></td>
            <td style={{ width: 110 }} className="muted">{kst(n.created_at)}</td>
            <td style={{ width: 90 }}>{(n.link || !n.read_at) && <form action={openNotification}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="link" value={n.link ?? ''} />
              <button className="btn ghost xs" type="submit">{n.link ? '열기' : '읽음'}</button></form>}</td>
          </tr>)}
        </tbody></table></div> : <div style={{ padding: 20 }}><Empty>알림이 없습니다.</Empty></div>}
      </Section>
    </div>
  );
}
