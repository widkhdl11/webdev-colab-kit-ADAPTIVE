// 서버 컴포넌트·서버 액션에서 쓰는 Supabase 클라이언트.
// 세션 쿠키를 실어 보내므로 행 수준 접근 정책이 "지금 이 사용자"로 판정된다.

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export class SupabaseConfigMissingError extends Error {
  constructor(missing: readonly string[]) {
    super(`Supabase 설정이 없어 데이터를 읽을 수 없다. 비어 있는 항목: ${missing.join(", ")}`);
    this.name = "SupabaseConfigMissingError";
  }
}

/**
 * 설정이 없으면 **던진다.** 미들웨어의 판정 클라이언트는 설정이 없을 때 전원을
 * 비로그인으로 보지만(안전한 방향), 읽기 클라이언트가 같은 식으로 조용히 빈 결과를
 * 돌려주면 "권한이 없어서 안 보인다"와 "설정이 없어서 안 보인다"가 구분되지 않는다.
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const missing = [
    projectUrl ? null : "NEXT_PUBLIC_SUPABASE_URL",
    publishableKey ? null : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((name): name is string => name !== null);
  if (!projectUrl || !publishableKey) throw new SupabaseConfigMissingError(missing);

  const store = await cookies();

  return createServerClient(projectUrl, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        // 서버 컴포넌트에서는 응답 쿠키를 쓸 수 없다. 세션 갱신은 미들웨어가 이미
        // 했으므로 여기서 버려도 잃는 것이 없다 — 서버 액션·라우트 핸들러에서는
        // 쓸 수 있으니 그때만 반영한다.
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options);
        } catch {
          // 읽기 전용 컨텍스트. 위 주석의 이유로 무시한다.
        }
      },
    },
  });
}
