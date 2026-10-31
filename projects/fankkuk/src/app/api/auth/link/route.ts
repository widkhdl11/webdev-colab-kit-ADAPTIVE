import { NextResponse, type NextRequest } from "next/server";
import { loginLinksOf } from "@/entities/session/api/login-links";
import { sessionActivityOf, sessionCookieMaxAgeFor } from "@/entities/session/api/session-activity";
import { LINK_LOGIN_FAILED_PATH, LINK_LOGIN_SIGNED_OUT_PATH, LINK_LOGIN_SUCCESS_PATH } from "@/entities/session/model/login-link";
import { linkSignIn } from "@/features/auth/model/link-sign-in";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createDeferredRequestSupabase } from "@/shared/api/supabase/server";
import { sessionOnlyMarker } from "@/shared/api/supabase/session-cookies";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 로그인 링크의 토큰 쓰기 (docs/specs/link-login.md INV-K3·K4·K6). /login/link 페이지의 스크립트만 부른다.
// 같은 사이트의 JSON 요청만 받는다(INV-K3 — 다른 사이트가 피해자를 남의 계정으로 로그인시키지 못하게, 링크 미리보기 로봇은 POST 를 하지 않는다).
// 성공하면 로그인 쿠키(HttpOnly, 유지 켬 = 그 역할의 절대 기간 — session-login INV-L16, 크리에이터 30일)를 응답에 쓰고 승인 대기 목록으로, 실패는 응답 하나로 로그인 화면(INV-K4).
// 이미 로그인해 있으면(카드 d1): 같은 계정·쓸 수 없는 토큰은 그 로그인 그대로 승인 대기 목록, 다른 계정은 로그아웃(쿠키·표시 지움) 뒤 안내 없는 로그인 화면.
// 응답 본문에 토큰·로그인 값을 싣지 않는다.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest) {
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json({ message: "유효하지 않은 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." }, { status: 403, headers: NO_STORE });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  // 로그인 쿠키 쓰기 규칙은 결과를 안 뒤에 정한다 — 성공이면 유지 켬, 실패면 요청에 남은 표시(session-login INV-L15)
  const { supabase, storedSessionOnly, decide } = await createDeferredRequestSupabase();
  let ok = false;
  let maxAge: number | undefined;
  try {
    const admin = createAdminSupabase();
    const result = await linkSignIn({ links: loginLinksOf(admin), authAdmin: admin.auth.admin, auth: supabase.auth, env: process.env }, body);
    // session-login INV-L16·link-login INV-K6: 「유지」 켬 쿠키 유효기간은 그 계정 역할의 절대 기간(크리에이터 30일)
    maxAge = await sessionCookieMaxAgeFor(supabase.auth, sessionActivityOf(admin));
    if (result.outcome === "failed") return NextResponse.json({ ok: false, next: LINK_LOGIN_FAILED_PATH }, { headers: NO_STORE });
    if (result.outcome === "kept") return NextResponse.json({ ok: true, next: LINK_LOGIN_SUCCESS_PATH }, { headers: NO_STORE });
    if (result.outcome === "signed_out") {
      // session-login INV-L7·L15: 로그아웃처럼 표시 쿠키도 지운다. 로그인 쿠키를 지우는 쓰기(만료 0)는 쓰기 규칙과 상관없이 지운다
      const out = NextResponse.json({ ok: false, next: LINK_LOGIN_SIGNED_OUT_PATH }, { headers: NO_STORE });
      const marker = sessionOnlyMarker(false, process.env);
      out.cookies.set(marker.name, marker.value, marker.options);
      return out;
    }
    ok = true;
    const response = NextResponse.json({ ok: true, next: LINK_LOGIN_SUCCESS_PATH }, { headers: NO_STORE });
    // INV-K4: 유지 켬 — 끔 표시가 남아 있으면 지운다(다음 요청부터 갱신이 역할 기간으로 쓴다, INV-K6)
    const marker = sessionOnlyMarker(false, process.env);
    response.cookies.set(marker.name, marker.value, marker.options);
    return response;
  } finally {
    decide(ok ? false : storedSessionOnly, maxAge);
  }
}
