export default function Blocked({ searchParams }: { searchParams: { ip?: string } }) {
  return (
    <main style={{ maxWidth: 440, margin: '80px auto', textAlign: 'center' }}>
      <div className="card">
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>등록되지 않은 네트워크입니다</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>사내 시스템은 허용된 IP에서만 접속할 수 있습니다.</p>
        <code style={{ display: 'block', fontSize: 22, fontWeight: 700, margin: '16px 0' }}>{searchParams.ip || '알 수 없음'}</code>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>위 IP를 관리자에게 전달하면 등록 후 접속할 수 있습니다.</p>
      </div>
    </main>
  );
}
