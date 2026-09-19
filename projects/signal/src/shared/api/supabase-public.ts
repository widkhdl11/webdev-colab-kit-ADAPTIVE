import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "./public-env";

/**
 * publishable 키로 만드는 클라이언트. 브라우저·서버 어디서나 쓴다. 도메인 지식은 없다.
 *
 * **이 클라이언트로는 쓸 수 없다.** 세 테이블 다 RLS 가 켜져 있고 select 정책만 있어서,
 * insert 는 42501 로 거절되고 update·delete 는 0행만 처리된다(통합 테스트가 확인한다).
 * 인가는 이 키가 아니라 RLS 가 한다 — 클라이언트의 `.eq(...)` 필터는 표시용일 뿐이다.
 */

let cached: SupabaseClient | null = null;

export function publicSupabase(): SupabaseClient {
  // 요청마다 새로 만들면 연결·헤더 준비를 매번 다시 한다. 상태(세션)를 안 들고 있으므로
  // 재사용해도 요청 간에 새어 나갈 것이 없다 — persistSession 을 끈 이유이기도 하다.
  if (cached) return cached;
  const env = publicEnv();
  cached = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  return cached;
}
