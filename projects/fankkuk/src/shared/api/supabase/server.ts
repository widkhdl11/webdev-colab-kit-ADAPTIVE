import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { readSupabaseConfig } from "./config";
import { createSessionClient, deferSessionCookieWrites, isSessionOnly } from "./session-cookies";

/**
 * 요청한 사람의 세션으로 부르는 클라이언트 — 서버 컴포넌트·라우트 핸들러용.
 * 서버 컴포넌트에서는 응답 쿠키를 쓸 수 없어 갱신된 토큰을 버린다. 갱신은 proxy 가 요청마다 먼저 한다.
 * 로그인 쿠키를 만료 시각 없이 쓸지(session-login INV-L15)는 요청의 표시 쿠키로 정한다.
 * 로그인 라우트만 방금 고른 값을 sessionOnly 로 넘긴다 — 남아 있는 표시보다 그 값이 이긴다.
 */
export async function createRequestSupabase(opts: { sessionOnly?: boolean; maxAge?: number } = {}): Promise<SupabaseClient> {
  const store = await cookies();
  return createSessionClient(
    readSupabaseConfig(process.env),
    {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // 서버 컴포넌트(읽기 전용 쿠키). 위 주석의 이유로 버린다.
        }
      },
    },
    process.env,
    // maxAge(session-login INV-L16): 역할을 아는 쪽만 넘긴다. 안 넘기면 만료 시각을 뗀다 — 요청마다 갱신(proxy)이 역할 기간으로 다시 쓴다
    { sessionOnly: opts.sessionOnly ?? isSessionOnly(store), maxAge: opts.maxAge },
  );
}

/**
 * 결과를 알기 전에 쿠키를 쓸 수 있는 라우트(로그인·가입 직후 자동 로그인)용 — session-login INV-L15.
 * 로그인 쿠키 쓰기는 decide 를 부를 때까지 모아 두고, decide 한 규칙(만료 시각을 뗄지)으로 쓴다.
 * 부르는 쪽은 성공이면 고른 값, 아니면 storedSessionOnly(요청에 남은 표시)를 decide 에 넘긴다.
 * 만료 시각은 여기서 한 번만 뗀다 — 세션 클라이언트에는 끔을 넘기지 않는다.
 */
export async function createDeferredRequestSupabase(): Promise<{
  supabase: SupabaseClient;
  storedSessionOnly: boolean;
  decide(sessionOnly: boolean, maxAge?: number): void;
}> {
  const store = await cookies();
  const deferred = deferSessionCookieWrites((list) => {
    try {
      for (const { name, value, options } of list) store.set(name, value, options);
    } catch {
      // 읽기 전용 쿠키(서버 컴포넌트). 라우트 핸들러에서만 쓰므로 실제로는 오지 않는다.
    }
  });
  const supabase = createSessionClient(
    readSupabaseConfig(process.env),
    { getAll: () => store.getAll(), setAll: deferred.setAll },
    process.env,
    { sessionOnly: false },
  );
  return { supabase, storedSessionOnly: isSessionOnly(store), decide: deferred.decide };
}
