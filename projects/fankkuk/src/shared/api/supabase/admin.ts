import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSecretKey, readSupabaseConfig } from "./config";

/**
 * 관리자 키(Supabase 비밀 키) 클라이언트 — RLS 를 거치지 않는다.
 * INV-L4: 서버 전용(server-only — 브라우저 코드가 가져오면 빌드가 실패한다).
 * INV-L3: 이 클라이언트로 부르는 쓰기에는 readVerifiedUserId 로 얻은 ID 만 넘긴다.
 */
export function createAdminSupabase(): SupabaseClient {
  const { url } = readSupabaseConfig(process.env);
  return createClient(url, readSecretKey(process.env), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
