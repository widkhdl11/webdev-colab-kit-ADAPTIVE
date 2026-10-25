import { createServerClient, type CookieMethodsServer, type CookieOptions } from "@supabase/ssr";
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

/**
 * session-login INV-L15: 「로그인 상태 유지」를 끄고 로그인했다는 표시. 값이 이것일 때만 끔이다.
 * 쿠키를 어떻게 쓸지만 정한다 — 누가 로그인했는지 판정에는 쓰지 않는다(INV-L2).
 */
export const SESSION_ONLY_COOKIE = "fk_session_only";
const SESSION_ONLY_VALUE = "1";

type CookieReader = { get(name: string): { value: string } | undefined };

/** INV-L15: 요청 쿠키에 표시가 있으면 끔(브라우저를 닫으면 지워지는 쿠키로 쓴다). proxy·라우트가 같은 판정을 쓴다. */
export function isSessionOnly(cookies: CookieReader): boolean {
  return cookies.get(SESSION_ONLY_COOKIE)?.value === SESSION_ONLY_VALUE;
}

/** INV-L15·INV-L1: 끔이면 표시를 만료 시각 없이 쓰고, 켬이면 지운다(만료 0). */
export function sessionOnlyMarker(sessionOnly: boolean, env: EnvLike): { name: string; value: string; options: CookieOptions } {
  const base = sessionCookieOptions(env);
  return sessionOnly
    ? { name: SESSION_ONLY_COOKIE, value: SESSION_ONLY_VALUE, options: { ...base } }
    : { name: SESSION_ONLY_COOKIE, value: "", options: { ...base, maxAge: 0 } };
}

/**
 * INV-L15: 끔이면 쓰기 옵션에서 만료 시각(maxAge·expires)을 뗀다. 지우는 쓰기(maxAge 0 이하)는 그대로 둔다.
 * 라이브러리(@supabase/ssr)는 쓸 때마다 maxAge 를 400일로 강제하고 cookieOptions 로는 못 덮는다 — 그래서 쓰는 자리에서 뗀다.
 */
export function sessionOnlyWriteOptions(options: CookieOptions, sessionOnly: boolean): CookieOptions {
  if (!sessionOnly) return options;
  if (typeof options.maxAge === "number" && options.maxAge <= 0) return options;
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  return rest;
}

type SetAll = NonNullable<CookieMethodsServer["setAll"]>;

/**
 * INV-L15: 쓰기 규칙(만료 시각을 뗄지)을 나중에 정한다. 정하기 전의 로그인 쿠키 쓰기는 모아 두었다가
 * decide 때 그 규칙으로 한꺼번에 쓰고, 정한 뒤의 쓰기는 바로 그 규칙으로 쓴다. 처음 decide 한 값만 이긴다.
 * 로그인처럼 결과(성공이면 고른 값, 실패면 원래 표시)를 알기 전에 라이브러리가 쿠키를 쓸 수 있는 곳에서 쓴다.
 */
export function deferSessionCookieWrites(setAll: SetAll): { setAll: SetAll; decide(sessionOnly: boolean): void } {
  let decided: boolean | null = null;
  const pending: Parameters<SetAll>[0] = [];
  let lastHeaders: Parameters<SetAll>[1] = {};
  const write = (list: Parameters<SetAll>[0], headers: Parameters<SetAll>[1], sessionOnly: boolean) =>
    setAll(
      list.map((c) => ({ ...c, options: sessionOnlyWriteOptions(c.options, sessionOnly) })),
      headers,
    );
  return {
    setAll: (list, headers) => {
      if (decided === null) {
        pending.push(...list);
        lastHeaders = headers;
        return;
      }
      return write(list, headers, decided);
    },
    decide: (sessionOnly) => {
      if (decided !== null) return;
      decided = sessionOnly;
      const list = pending.splice(0);
      if (list.length > 0) void write(list, lastHeaders, sessionOnly);
    },
  };
}

/**
 * 요청마다 새로 만든다 — 클라이언트를 요청 사이에 나눠 쓰면 남의 세션이 섞인다.
 * sessionOnly(INV-L15): 로그인 쿠키를 쓰는 모든 경로(로그인·요청마다 갱신·화면 읽기)가 이 함수로 쓰므로 여기 한 곳에서 뗀다.
 */
export function createSessionClient(
  config: SupabaseConfig,
  cookies: CookieMethodsServer,
  env: EnvLike,
  opts: { sessionOnly?: boolean } = {},
): SupabaseClient {
  const sessionOnly = opts.sessionOnly === true;
  const setAll = cookies.setAll;
  const methods: CookieMethodsServer = setAll
    ? {
        ...cookies,
        setAll: (list, headers) =>
          setAll(
            list.map((c) => ({ ...c, options: sessionOnlyWriteOptions(c.options, sessionOnly) })),
            headers,
          ),
      }
    : cookies;
  return createServerClient(config.url, config.anonKey, { cookies: methods, cookieOptions: sessionCookieOptions(env) });
}
