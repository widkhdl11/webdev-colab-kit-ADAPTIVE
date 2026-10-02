import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * INV-L2: 지금 요청한 사람의 ID. 쿠키 내용을 직접 해석하지 않고 Supabase Auth 서버에 토큰을 확인받는다
 * (getUser 는 매번 Auth 서버를 부른다 — 서명이 틀리거나 로그아웃된 세션이면 오류).
 * 확인에 실패하면 로그인하지 않은 것으로 본다. 사람 판정은 이 함수 하나만 한다.
 */
export async function readVerifiedUserId(auth: Pick<SupabaseClient["auth"], "getUser">): Promise<string | null> {
  try {
    const { data, error } = await auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
