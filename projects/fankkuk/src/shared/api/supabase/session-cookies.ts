import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseConfig } from "./config";

// 로그인 쿠키를 읽고 쓰는 Supabase 클라이언트. 쿠키를 어디서 읽고 어디에 쓰는지(Next 의 요청·응답 쿠키,
// 시험의 메모리 저장소)는 부르는 쪽이 넘긴다 — 그래서 쿠키 판정을 네트워크 없이도, 실제 Auth 로도 확인할 수 있다.

type EnvLike = { NODE_ENV?: string; VERCEL_ENV?: string };

/** INV-L1: 스크립트가 읽을 수 없는 쿠키. 운영에서는 https 로만 보낸다. */
export function sessionCookieOptions(env: EnvLike) {
  const production = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  return { path: "/", sameSite: "lax", httpOnly: true, secure: production } as const;
}

/** 요청마다 새로 만든다 — 클라이언트를 요청 사이에 나눠 쓰면 남의 세션이 섞인다. */
export function createSessionClient(config: SupabaseConfig, cookies: CookieMethodsServer, env: EnvLike): SupabaseClient {
  return createServerClient(config.url, config.anonKey, { cookies, cookieOptions: sessionCookieOptions(env) });
}
