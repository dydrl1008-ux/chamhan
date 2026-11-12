import { createClient } from '@supabase/supabase-js';
// 서버 전용. 절대 클라이언트로 내보내지 않음.
// cache: 'no-store' — Next 가 서버의 조회(fetch GET)를 캐시해 예전 데이터를 돌려주는 일이 없게 (토큰으로 여는 화면·크론에서 예전 값이 읽히던 문제)
export const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }) },
  });
