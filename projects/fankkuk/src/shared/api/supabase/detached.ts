import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config";

/**
 * 쿠키에 아무것도 쓰지 않는 일회용 Auth 클라이언트(브라우저 키). 서버가 비밀번호를 확인하거나
 * 한 계정의 세션을 모두 끝낼 때 잠깐 로그인하는 데만 쓴다 — 여기서 생긴 세션은 요청한 사람의 쿠키로 가지 않는다.
 * 요청마다 새로 만든다.
 */
export function createDetachedAuth(): SupabaseClient["auth"] {
  const { url, anonKey } = readSupabaseConfig(process.env);
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth;
}
