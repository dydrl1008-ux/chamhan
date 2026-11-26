/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];
const nextConfig = {
  async headers() { return [{ source: '/(.*)', headers: securityHeaders }]; }, reactStrictMode: true,
  // 대행사 홍보방 업로드·콜 리스트 CSV (Vercel 요청 한도 4.5MB 안쪽)
  experimental: { serverActions: { bodySizeLimit: '4mb' }, outputFileTracingIncludes: { '/meta-edu/doc/[slug]': ['./content/meta-edu/*.html'] } } };   // 메타팀 교육자료 파일을 배포 묶음에 포함
export default nextConfig;
