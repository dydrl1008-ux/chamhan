// 공개 수신거부 페이지 /unsub — 수동(BCC 묶음) 발송은 수신자별 링크를 넣을 수 없어, 받는 사람이 자기 주소를 직접 적는다. 로그인·IP 제한 없음(middleware 제외)
import UnsubForm from './UnsubForm';
export const metadata = { title: '메일 수신거부', robots: { index: false, follow: false } };
export default function UnsubPage() {
  return <div style={{ minHeight: '100vh', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'Pretendard, -apple-system, "Malgun Gothic", sans-serif' }}>
    <div style={{ width: '100%', maxWidth: 440, background: '#fff', padding: '32px 28px', borderRadius: 14, boxShadow: '0 1px 3px rgba(15,23,42,.08)' }}>
      <UnsubForm />
      <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid #E2E8F0', color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>참한기획</div>
    </div>
  </div>;
}
