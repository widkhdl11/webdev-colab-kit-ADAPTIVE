import { NextResponse, type NextRequest } from "next/server";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { readSupabaseConfig } from "@/shared/api/supabase/config";
import { createSessionClient } from "@/shared/api/supabase/session-cookies";
import { firstTouchUtmCookie, UTM_COOKIE, utmCookieOptions } from "@/shared/lib/attribution/utm";
import { isProduction } from "@/shared/lib/env/is-production";

// 요청마다 로그인 쿠키를 갱신한다. 서버 컴포넌트는 응답 쿠키를 쓸 수 없으므로 만료된 토큰을 새로 받는 일은 여기서 한다.
// 접근 판정은 하지 않는다 — 누가 무엇을 보는지는 각 화면·라우트가 readVerifiedUserId 와 DB 함수로 정한다.
// 공유 링크의 utm 도 여기서 쿠키에 남긴다(metrics INV-Q4) — 서버 컴포넌트는 쿠키를 쓸 수 없고, 어느 주소로 들어와도 첫 방문을 잡으려면 이 자리다.

export async function proxy(request: NextRequest): Promise<NextResponse> {
  return withFirstTouchUtm(request, await refreshSession(request));
}

/** metrics INV-Q4: 처음 들어온 공유 링크의 utm 을 거른 뒤 30일 쿠키로 남긴다. 이미 남은 값이 있으면 덮어쓰지 않는다. */
function withFirstTouchUtm(request: NextRequest, response: NextResponse): NextResponse {
  const value = firstTouchUtmCookie(request.nextUrl.searchParams, request.cookies.get(UTM_COOKIE)?.value);
  if (value) response.cookies.set(UTM_COOKIE, value, utmCookieOptions(isProduction(process.env)));
  return response;
}

async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  let config;
  try {
    config = readSupabaseConfig(process.env);
  } catch {
    return response; // 설정이 없으면 갱신할 세션도 없다. 화면 쪽 읽기가 설정 없음을 오류로 드러낸다.
  }

  const supabase = createSessionClient(
    config,
    {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        // 다음 단계(화면)가 갱신된 값을 보도록 요청 쿠키도 바꾼 뒤 응답을 다시 만든다.
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        // 인증 쿠키가 실린 응답을 공유 캐시가 저장하지 않게 하는 헤더 — 버리면 남의 세션이 나갈 수 있다.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
    process.env,
  );

  // getUser 가 필요하면 토큰을 갱신하고 setAll 로 쿠키를 다시 쓴다(INV-L2 의 확인도 같은 호출).
  await readVerifiedUserId(supabase.auth);
  return response;
}

// 정적 파일·이미지는 거른다. 접근 판정을 여기 걸지 않으므로 matcher 는 성능 필터일 뿐이다.
export const config = {
  matcher: ["/((?!_next/|img/|favicon\\.ico$).*)"],
};
