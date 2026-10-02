import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * INV-L7: Auth 서버에서 이 세션을 끝내고(남은 갱신 토큰도 못 쓰게) 쿠키를 지운다.
 * scope local = 이 기기의 세션만. 다른 기기의 로그인은 그대로 둔다.
 */
export async function signOut(auth: Pick<SupabaseClient["auth"], "signOut">): Promise<void> {
  await auth.signOut({ scope: "local" });
}
