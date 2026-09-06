// 비밀번호 확인 전용 클라이언트. **쿠키를 읽지도 쓰지도 않는다.**
//
// 근거: docs/specs/password-change.md INV-C2. 현재 비밀번호를 확인하는 방법은 그 비밀번호로
// 로그인을 해 보는 것인데, 세션 클라이언트로 하면 그 호출이 성공하든 실패하든 세션 쿠키를
// 건드린다. 그러면 **비밀번호를 틀렸을 때조차 로그인 상태가 흔들린다** — 실패해야 할 요청이
// 로그아웃을 일으킨다.
//
// 여기서 만든 연결은 세션을 저장하지 않으므로, 로그인에 성공해도 그 결과가 아무 데도 안 남고
// 함수가 끝나면 사라진다. (인증 서버 쪽에는 세션 행이 하나 생기므로 부르는 쪽이
// `signOut({ scope: "local" })` 로 즉시 끊는다 — `features/change-password`)
//
// **설정을 `server-client` 에서 가져오지 않는다.** 그 파일은 `next/headers` 를 들이므로,
// 여기서 그것을 import 하면 "쿠키를 안 만진다"고 적은 모듈이 쿠키 모듈에 묶인다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config";

export async function createVerifierSupabase(): Promise<SupabaseClient> {
  const { projectUrl, publishableKey } = readSupabaseConfig();

  return createClient(projectUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
