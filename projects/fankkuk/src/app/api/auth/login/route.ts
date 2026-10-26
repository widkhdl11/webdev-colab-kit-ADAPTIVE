import { NextResponse, type NextRequest } from "next/server";
import { passwordAttemptsOf } from "@/entities/session/api/password-attempts";
import { keepSignedInOf, signIn } from "@/features/auth/model/sign-in";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createDeferredRequestSupabase } from "@/shared/api/supabase/server";
import { sessionOnlyMarker } from "@/shared/api/supabase/session-cookies";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 아이디 로그인. 성공하면 Supabase 클라이언트가 세션 쿠키(HttpOnly)를 응답에 쓴다(INV-L1).
// 실패 응답은 하나다(INV-L5). 응답 본문에 토큰을 싣지 않는다.
// 같은 사이트의 JSON 요청만 받는다 — 다른 사이트가 피해자를 공격자 계정으로 로그인시키지 못하게.
export async function POST(req: NextRequest) {
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json({ message: "유효하지 않은 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const sessionOnly = !keepSignedInOf(body);
  // INV-L15: 로그인 쿠키 쓰기 규칙은 결과를 안 뒤에 정한다 — 성공이면 고른 값, 실패(예외 포함)면 요청에 남은 표시.
  // 라이브러리가 시작 때 토큰을 갱신해 쓰는 쿠키도 이 규칙을 따른다(S13e).
  const { supabase, storedSessionOnly, decide } = await createDeferredRequestSupabase();
  let ok = false;
  try {
    // INV-L14: 아이디별 확인 횟수는 서버 전용 키로 센다
    const result = await signIn({ attempts: passwordAttemptsOf(createAdminSupabase()), auth: supabase.auth, env: process.env }, body);
    // 실패 응답에는 표시 쿠키를 건드리지 않는다 — 고른 값과 상관없이 같은 응답(INV-L5)
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status, headers: { "Cache-Control": "no-store" } });
    ok = true;
    // 돌아갈 주소는 경로 그대로 준다 — 사이트 주소에 붙여 만들지 않는다(INV-L13)
    const response = NextResponse.json({ ok: true, next: result.next }, { headers: { "Cache-Control": "no-store" } });
    // INV-L15: 끔이면 표시를 만료 시각 없이 쓰고, 켬이면 지운다 — 다음 요청부터 갱신(proxy)이 이 표시를 본다
    const marker = sessionOnlyMarker(sessionOnly, process.env);
    response.cookies.set(marker.name, marker.value, marker.options);
    return response;
  } finally {
    decide(ok ? sessionOnly : storedSessionOnly);
  }
}
