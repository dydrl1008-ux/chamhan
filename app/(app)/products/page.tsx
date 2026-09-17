import { supabaseServer } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const sb = supabaseServer();
  const [{ data: rows }, { data: people }] = await Promise.all([sb.from('products').select('*').eq('is_active', true).order('sort_order').order('id'), sb.from('profiles').select('id,name').eq('is_active', true)]);
  const nm = (id: string | null) => people?.find(x => x.id === id)?.name ?? '-';
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>상품 안내 · 접수방법</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {(rows ?? []).map(p => <div className="card" key={p.id}><h3 style={{ margin: '0 0 10px', fontSize: 15, display: 'flex', justifyContent: 'space-between' }}><span>{p.name}</span><span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{p.category}</span></h3>
          <table style={{ fontSize: 13 }}><tbody>
            {p.description && <tr><td style={{ width: 90, color: 'var(--muted)', verticalAlign: 'top' }}>설명</td><td style={{ whiteSpace: 'pre-wrap' }}>{p.description}</td></tr>}
            <tr><td style={{ color: 'var(--muted)' }}>단가</td><td>{p.unit_price ?? '-'}</td></tr>
            <tr><td style={{ color: 'var(--muted)', verticalAlign: 'top' }}>접수 절차</td><td style={{ whiteSpace: 'pre-wrap' }}>{p.intake_process ?? '-'}</td></tr>
            <tr><td style={{ color: 'var(--muted)', verticalAlign: 'top' }}>필요 자료</td><td style={{ whiteSpace: 'pre-wrap' }}>{p.required_materials ?? '-'}</td></tr>
            <tr><td style={{ color: 'var(--muted)' }}>담당</td><td>{nm(p.owner_id)}</td></tr>
            {p.caution && <tr><td style={{ color: 'var(--muted)' }}>주의</td><td style={{ color: '#D97706' }}>{p.caution}</td></tr>}</tbody></table></div>)}
        {(rows ?? []).length === 0 && <div className="card" style={{ color: 'var(--muted)' }}>등록된 상품이 없습니다.</div>}
      </div>
    </div>
  );
}
