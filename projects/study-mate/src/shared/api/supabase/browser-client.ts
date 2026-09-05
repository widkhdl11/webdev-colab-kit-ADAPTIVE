"use client";

// 브라우저에서 쓰는 Supabase 클라이언트. 실시간 구독이 이것을 쓴다.
//
// 여기 들어가는 키는 **공개 키뿐이다** — 어차피 번들에 실려 나가는 값이라 비밀이 아니고,
// 그 연결로 할 수 있는 일은 행 수준 접근 정책이 정한다. 비밀 키는 절대 오지 않는다.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * 설정이 없으면 **던진다.** 조용히 null 을 돌려주면 "실시간이 안 붙었다"와
 * "아무도 말을 안 했다"가 화면에서 같아진다.
 */
export function browserSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase 설정이 없어 실시간 연결을 만들 수 없다: NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  client = createBrowserClient(url, key);
  return client;
}
