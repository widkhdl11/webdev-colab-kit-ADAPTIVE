// INV-A1 · INV-A2 의 강제 위치. 판정은 entities/session 의 순수 함수가 하고,
// 여기서는 요청에서 세션을 읽어 그 판정을 실행에 옮긴다.
//
// 본체를 handleRequest 로 떼어 둔 이유: 이 파일이 강제 위치인데 여기 테스트가 없으면
// 판정 함수만 초록불이고 실행 쪽은 통째로 지워도 아무도 모른다(실제로 그랬다).

import { NextResponse, type NextRequest } from "next/server";
import { decideRouteAccess, readVerifiedUser } from "@/entities/session";
import { createMiddlewareSupabase } from "@/shared/api/supabase/middleware-client";

export async function handleRequest(
  request: NextRequest,
  createSupabase: typeof createMiddlewareSupabase = createMiddlewareSupabase,
): Promise<NextResponse> {
  const { auth, response } = createSupabase(request);

  // 설정이 없어 세션을 읽을 수 없으면 '비로그인'으로 친다.
  // 보호된 경로는 닫히고 공개 경로는 열린 채로 남는다.
  const user = auth === null ? null : await readVerifiedUser(auth);

  const decision = decideRouteAccess({
    pathname: request.nextUrl.pathname,
    signedIn: user !== null,
  });

  const passthrough = response();
  if (decision.kind === "allow") return passthrough;

  const target = request.nextUrl.clone();
  target.pathname = decision.to;
  target.search = "";
  // 307 은 메서드와 본문을 유지한다 — 비로그인 상태의 POST 가 폼 본문을 그대로
  // 로그인 경로로 재전송하게 된다. GET 이 아니면 303 으로 본문을 떨군다.
  const redirect = NextResponse.redirect(target, request.method === "GET" ? 307 : 303);
  // 갱신된 인증 쿠키를 옮기지 않으면 리다이렉트 직후에 세션이 사라진다.
  for (const cookie of passthrough.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  return handleRequest(request);
}

// matcher 는 성능 필터일 뿐 정확성을 걸지 않는다.
// 확장자로 거르면 안 된다 — 정규식의 `.` 은 `/` 도 먹어서 `/studies/1.png` 처럼
// 경로 어디에 있든 그 확장자로 끝나면 미들웨어가 통째로 건너뛰어진다(실측 확인).
// 정적 파일은 _next/ 아래이거나 파일명이 고정된 것들뿐이라 접두사·완전일치로만 뺀다.
export const config = {
  matcher: ["/((?!_next/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)"],
};
