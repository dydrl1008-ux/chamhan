// 내 DB — 직원 개인별 가망 고객(DB) 정리 대시보드. 직원은 본인 것만, 팀장은 팀원 것 읽기, 총괄·어드민은 전체 + 지운 DB + 재배분
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getProfile } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { todayKST } from '@/lib/date/kst';
import { PageHeader } from '@/components/ui';
import { dbList } from './actions';
import MyDbClient from './MyDbClient';
export const dynamic = 'force-dynamic';
export default async function MyDbPage({ searchParams }: { searchParams: { u?: string; v?: string } }) {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const boss = me.role === 'head' || me.role === 'admin'; const mgr = me.role === 'manager'; const sb = supabaseAdmin(); const today = todayKST();
  let people: { id: string; name: string; team_id: number | null }[] = [];
  { const q = sb.from('profiles').select('id,name,team_id').eq('is_active', true).neq('role', 'admin').order('name'); const { data } = boss ? await q : mgr ? await q.eq('team_id', me.team_id ?? -1) : await q; people = (data ?? []) as any[]; }
  const canPick = boss || mgr; const target = canPick && searchParams.u && people.some(p => p.id === searchParams.u) ? searchParams.u : me.id;
  const trash = searchParams.v === 'trash'; const who = people.find(p => p.id === target)?.name ?? me.name;
  const r = await dbList(target, trash);
  // 사람별 요약 (팀장·총괄) — 방치 DB 는 자동으로 풀지 않고 여기서 보고 총괄이 판단
  let sum: { id: string; name: string; n: number; due: number; hot: number; paid: number; stale: number; del: number }[] = [];
  if (canPick) {
    const { data } = await sb.from('my_db').select('owner_id,grade,status,next_on,updated_at,deleted_at').in('owner_id', people.map(p => p.id)).limit(20000);
    const cut = new Date(Date.now() - 30 * 86400e3).toISOString();
    sum = people.map(p => { const m = (data ?? []).filter((x: any) => x.owner_id === p.id); const a = m.filter((x: any) => !x.deleted_at); const live = a.filter((x: any) => x.status === '진행');
      return { id: p.id, name: p.name, n: a.length, due: live.filter((x: any) => x.next_on && x.next_on <= today).length, hot: live.filter((x: any) => ['S', 'A', 'B'].includes(x.grade)).length, paid: a.filter((x: any) => x.status === '결제').length, stale: live.filter((x: any) => x.updated_at < cut).length, del: m.length - a.length }; })
      .filter(x => x.n || x.del || x.id === me.id).sort((a, b) => b.n - a.n);
  }
  const href = (u: string, v?: string) => `/my-db?${[u !== me.id ? `u=${u}` : '', v ? `v=${v}` : ''].filter(Boolean).join('&')}`;
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title={(target === me.id ? '내 DB' : `${who} · DB`) + (trash ? ' · 휴지통' : '')} desc="내 가망 고객을 한곳에 모아 등급·다음 연락일로 관리합니다. 엑셀로 올리거나 콜 리스트에서 「내 DB」로 담을 수 있습니다 · 결제로 바꾸면 줄이 노랗게 표시됩니다"
      actions={<span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{trash ? <Link href={href(target)} className="btn ghost">← 목록으로</Link> : <Link href={href(target, 'trash')} className="btn ghost">휴지통</Link>}{target !== me.id && <Link href="/my-db" className="btn ghost">내 DB</Link>}</span>} />
    {canPick && sum.length > 0 && <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}><b>사람별 현황</b> <span className="cell-sub">이름을 누르면 그 사람 DB · 방치 = 30일 넘게 기록 없는 진행 건{boss ? ' · 지운 DB 는 총괄 화면에 계속 남습니다' : ''}</span></div>
      <div style={{ overflow: 'auto' }}><table><thead><tr><th>이름</th><th className="num">전체</th><th className="num">오늘·지난 약속</th><th className="num">S·A·B 등급</th><th className="num">결제</th><th className="num">방치</th>{boss && <th className="num">지운 DB</th>}</tr></thead>
        <tbody>{sum.map(x => <tr key={x.id} style={{ background: x.id === target ? 'var(--bg)' : undefined }}>
          <td><Link href={href(x.id)} style={{ fontWeight: 700 }}>{x.name}</Link></td><td className="num">{x.n}</td>
          <td className="num" style={{ color: x.due ? '#B54708' : undefined, fontWeight: x.due ? 700 : undefined }}>{x.due || '-'}</td><td className="num">{x.hot || '-'}</td>
          <td className="num" style={{ color: x.paid ? '#067647' : undefined, fontWeight: x.paid ? 700 : undefined }}>{x.paid || '-'}</td><td className="num" style={{ color: x.stale ? '#B42318' : undefined }}>{x.stale || '-'}</td>
          {boss && <td className="num">{x.del ? <Link href={href(x.id, 'trash')} className="help">{x.del}</Link> : '-'}</td>}</tr>)}</tbody></table></div>
    </div>}
    <MyDbClient key={`${target}:${trash}`} me={{ id: me.id, boss }} target={target} who={who} trash={trash} today={today} rows0={r.ok ? r.rows : []} err={r.ok ? '' : r.msg} people={people.map(p => ({ id: p.id, name: p.name }))} />
  </div>;
}
