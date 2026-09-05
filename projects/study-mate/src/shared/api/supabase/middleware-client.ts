// 요청 프록시(미들웨어)에서 쓰는 Supabase 클라이언트.
// 쿠키를 요청에서 읽고 갱신분을 응답에 실어 준다 — 세션 갱신이 여기서 일어난다.

import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export type CookieBridge = {
  /** Supabase 에 넘길 쿠키 어댑터. */
  readonly cookies: CookieMethodsServer;
  /** 갱신된 인증 쿠키가 실린 응답. setAll 이 응답을 갈아끼우므로 호출 시점에 읽는다. */
  readonly response: () => NextResponse;
};

export type MiddlewareSupabase = {
  /** 설정이 없어 세션을 읽을 방법이 없으면 null. 판단은 부르는 쪽이 한다. */
  readonly auth: SupabaseClient["auth"] | null;
  readonly response: () => NextResponse;
};

/**
 * 요청의 쿠키와 응답의 쿠키를 잇는다.
 *
 * 따로 떼어 둔 이유: 세션 갱신이 실제로 일어나는 자리가 여기인데, Supabase 클라이언트
 * 안에 묻어 두면 갱신을 일으키려면 네트워크가 필요해서 아무도 검증하지 못한다.
 */
export function createCookieBridge(request: NextRequest): CookieBridge {
  let response = NextResponse.next({ request });

  return {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        // 다음 핸들러가 갱신된 값을 보도록 요청 쪽도 갱신한 뒤 응답을 다시 만든다.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // 두 번째 인자는 "이 응답을 캐시하지 마라"는 헤더다. 버리면 인증 쿠키가 실린
        // 응답이 CDN·리버스 프록시에 저장돼 **한 사용자의 세션 토큰이 다른 사용자에게
        // 나갈 수 있다.** 타입 검사가 아니었으면 그냥 흘렸다.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
    response: () => response,
  };
}

// 요청마다 같은 경고를 찍지 않는다. 한 번이면 원인에 도달하기에 충분하다.
let warnedMissingConfig = false;

export function createMiddlewareSupabase(request: NextRequest): MiddlewareSupabase {
  const bridge = createCookieBridge(request);

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!projectUrl || !publishableKey) {
    // 설정이 없으면 부르는 쪽이 전원을 '비로그인'으로 본다. 안전한 방향이지만 증상이
    // "아무도 로그인이 안 된다"로만 보여서, 어느 변수가 비었는지 한 번은 남긴다.
    // (값은 절대 찍지 않는다 — 이름만.)
    //
    // ⚠ 이 방식은 **인가를 판정하는 자리에만** 맞다. 설정이 없을 때 데이터를 읽는
    // 클라이언트가 조용히 빈 결과를 돌려주면 "권한 없음"과 "설정 없음"이 구분되지
    // 않는다 — 그런 클라이언트는 이 패턴을 베끼지 말고 던져야 한다.
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      const missing = [
        projectUrl ? null : "NEXT_PUBLIC_SUPABASE_URL",
        publishableKey ? null : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ].filter(Boolean);
      console.warn(
        `[supabase] 설정이 없어 모든 요청을 비로그인으로 처리한다. 비어 있는 항목: ${missing.join(", ")}`,
      );
    }
    return { auth: null, response: bridge.response };
  }

  const client = createServerClient(projectUrl, publishableKey, { cookies: bridge.cookies });

  return { auth: client.auth, response: bridge.response };
}
