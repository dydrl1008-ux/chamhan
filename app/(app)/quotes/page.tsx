import { getProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import QuoteClient from './QuoteClient';
import { listQuotes } from './actions';
import { DEFAULT_SUPPLIERS } from '@/lib/quote';
export const dynamic = 'force-dynamic';

/** 견적서 — 입력하면 오른쪽에 바로 그려지고, 이미지로 복사·저장해서 카톡으로 보냄 */
export default async function QuotesPage() {
  const me = await getProfile(); if (!me || !me.is_active) redirect('/login');
  const r = await listQuotes();
  return <div style={{ display: 'grid', gap: 20 }}>
    <PageHeader title="견적서" desc="입력하면 바로 견적서가 그려집니다 — 「이미지 복사」로 카톡에 바로 붙여넣기" />
    {!r.ok && <div className="card" style={{ color: '#c0392b' }}>{r.msg}</div>}
    <QuoteClient rows={r.rows ?? []} suppliers={r.suppliers ?? DEFAULT_SUPPLIERS} canEditSupplier={!!r.canEditSupplier} me={me.name} />
  </div>;
}
