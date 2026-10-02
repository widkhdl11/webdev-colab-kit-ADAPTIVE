import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { readSupabaseConfig } from "./config";
import { createSessionClient } from "./session-cookies";

/**
 * 요청한 사람의 세션으로 부르는 클라이언트 — 서버 컴포넌트·라우트 핸들러용.
 * 서버 컴포넌트에서는 응답 쿠키를 쓸 수 없어 갱신된 토큰을 버린다. 갱신은 proxy 가 요청마다 먼저 한다.
 */
export async function createRequestSupabase(): Promise<SupabaseClient> {
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
  );
}
