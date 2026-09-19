// 클라이언트에서 import 하면 빌드가 깨진다 (INV-S4). supabase-public.ts 와 파일을 가른 이유가 이것뿐이다 —
// 한 파일에 두면 공개 클라이언트를 쓰려던 컴포넌트가 secret 키 경로까지 끌고 들어온다.
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "./public-env";
import { supabaseSecretKey } from "./server-env";

/**
 * secret 키로 만드는 클라이언트. **RLS 를 우회한다.**
 *
 * 쓰기가 필요한 경로(수집·적재)에서만 쓴다. 화면 조회에는 쓰지 않는다 —
 * 공개 클라이언트로 읽어야 "브라우저에서도 같은 것이 보인다"가 보장된다.
 */

let cached: SupabaseClient | null = null;

export function serverSupabase(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    supabaseSecretKey(),
    { auth: { persistSession: false } },
  );
  return cached;
}
