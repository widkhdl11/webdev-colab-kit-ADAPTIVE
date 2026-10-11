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

/**
 * 쿠키 없이 브라우저 키로 부르는 공개 읽기 클라이언트 — 로그인과 상관없는 공개 이미지 라우트용.
 * 공개 읽기 함수만 부른다. 요청마다 새로 만든다.
 */
export function createPublicReadSupabase(): SupabaseClient {
  const { url, anonKey } = readSupabaseConfig(process.env);
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 공개 저장소 주소의 앞부분(Supabase 주소) — 공개 파일 주소를 만든다. */
export function readPublicStorageBase(): string {
  return readSupabaseConfig(process.env).url;
}
