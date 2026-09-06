// INV-A1 · INV-A2 의 강제 위치. 판정은 entities/session 의 순수 함수가 하고,
// 여기서는 요청에서 세션을 읽어 그 판정을 실행에 옮긴다.
//
// 본체를 handleRequest 로 떼어 둔 이유: 이 파일이 강제 위치인데 여기 테스트가 없으면
// 판정 함수만 초록불이고 실행 쪽은 통째로 지워도 아무도 모른다(실제로 그랬다).

import { NextResponse, type NextRequest } from "next/server";
import { decideRouteAccess, readVerifiedUser } from "@/entities/session";
import { createMiddlewareSupabase } from "@/shared/api/supabase/middleware-client";

/**
 * 리다이렉트 목적지의 오리진을 **못 박는 자리.** 안 정하면 요청의 Host 헤더에서 나온다.
 *
 * Next 미들웨어는 Location 을 `new URL()` 로 파싱하므로 상대 경로를 쓸 수 없다
 * (실측: `Location: /login` 이면 `ERR_INVALID_URL` 로 500 이 난다). 그래서 오리진은
 * 반드시 어디선가 와야 하고, 요청이 주는 값 말고 다른 출처를 두는 것이 이 상수다.
 *
 * **모양이 틀리면 여기서 한 번만 버린다.** 요청마다 파싱하면 값을 잘못 넣은 날
 * 모든 요청이 500 이 된다 — 로그인 자체가 통째로 멈춘다.
 */
const SITE_ORIGIN = ((): string | null => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    // **안 정해 둔 것도 알린다.** 전에는 값이 없으면 아무 말 없이 요청 Host 로 떨어졌다 —
    // 「정해 뒀다고 생각했는데 안 정해진」 상태가 오류 하나 없이 만들어진다.
    //
    // 특히 이 이름은 `NEXT_PUBLIC_` 이라 Next 가 **빌드할 때** 값으로 박아 넣는다.
    // 배포처에서 런타임 환경변수로만 넣으면 여기는 여전히 null 이고, 그것을 알려 주는
    // 자리가 이 줄뿐이다.
    console.warn(
      "NEXT_PUBLIC_SITE_URL 이 없어 리다이렉트 목적지를 요청 Host 에서 받는다" +
        " (빌드하는 환경에 넣어야 한다 — 런타임에만 넣으면 안 들어간다)",
    );
    return null;
  }
  try {
    return new URL(raw).origin;
  } catch {
    // 값은 안 찍는다 — 이름만 찍는 것이 이 레포의 규칙이다(`middleware-client.ts`).
    // 지금 이 값이 비밀이 아니어도, 옆에 변수가 하나 더 붙는 날 이 줄이 본보기가 된다.
    console.warn(`NEXT_PUBLIC_SITE_URL 이 URL 이 아니라 무시한다 (길이 ${raw.length})`);
    return null;
  }
})();

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

  // 307 은 메서드와 본문을 유지한다 — 비로그인 상태의 POST 가 폼 본문을 그대로
  // 로그인 경로로 재전송하게 된다. GET 이 아니면 303 으로 본문을 떨군다.
  const redirect = NextResponse.redirect(
    new URL(decision.to, SITE_ORIGIN ?? request.nextUrl.origin),
    request.method === "GET" ? 307 : 303,
  );
  // **이 응답은 세션에 따라 달라진다.** 같은 경로가 비로그인에게는 로그인으로 가는
  // 리다이렉트고 로그인한 사람에게는 화면이다. 공유 캐시가 이것을 저장하면 남의 판정이
  // 다른 사람에게 나가고, 목적지의 오리진이 요청 Host 에서 온 값이면 그 오리진까지 같이 나간다.
  //
  // **이 한 줄이 설정 없이도 그 경로를 닫는다.** 위의 SITE_ORIGIN 은 배포할 때 오리진을
  // 못 박는 자리이고, 안 정해 두면 예전처럼 요청 Host 를 쓴다 — 그래서 캐시를 막는 쪽이
  // 기본 방어여야 한다.
  redirect.headers.set("Cache-Control", "no-store");
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
