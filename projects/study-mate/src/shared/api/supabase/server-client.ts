// 서버 컴포넌트·서버 액션에서 쓰는 Supabase 클라이언트.
// 세션 쿠키를 실어 보내므로 행 수준 접근 정책이 "지금 이 사용자"로 판정된다.

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { readSupabaseConfig } from "./config";

// 설정 읽기와 오류 클래스의 정본은 `config.ts` 다 — 같은 여덟 줄이 네 클라이언트에
// 복사돼 있었고, 변수 이름이 바뀌거나 옛 키 이름 대체를 한쪽에만 넣는 날 다른 화면은
// 다 도는데 한 화면만 죽는 모양이었다. 여기서 다시 내보내 기존 import 는 그대로 둔다.
export { SupabaseConfigMissingError } from "./config";

/**
 * 설정이 없으면 **던진다.** 미들웨어의 판정 클라이언트는 설정이 없을 때 전원을
 * 비로그인으로 보지만(안전한 방향), 읽기 클라이언트가 같은 식으로 조용히 빈 결과를
 * 돌려주면 "권한이 없어서 안 보인다"와 "설정이 없어서 안 보인다"가 구분되지 않는다.
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const { projectUrl, publishableKey } = readSupabaseConfig();

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
