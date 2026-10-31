import { NextResponse, type NextRequest } from "next/server";
import { sessionActivityOf } from "@/entities/session/api/session-activity";
import { LOGIN_HINT_COOKIE, LOGIN_HINT_HEADER, LOGIN_HINT_LINK, LOGIN_HINT_MAX_AGE_SECONDS, SESSION_END_REASON } from "@/entities/session/model/session-end-notice";
import { safeNextPath } from "@/entities/session/model/safe-next-path";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { guardSession, type SessionGuardResult } from "@/features/auth/model/session-guard";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { readSupabaseConfig } from "@/shared/api/supabase/config";
import { createSessionClient, deferSessionCookieWrites, isAuthCookieName, isSessionOnly, sessionCookieOptions, sessionOnlyMarker } from "@/shared/api/supabase/session-cookies";
import { firstTouchUtmCookie, UTM_COOKIE, utmCookieOptions } from "@/shared/lib/attribution/utm";
import { isProduction } from "@/shared/lib/env/is-production";

// 요청마다 로그인 쿠키를 갱신한다. 서버 컴포넌트는 응답 쿠키를 쓸 수 없으므로 만료된 토큰을 새로 받는 일은 여기서 한다.
// 접근 판정은 하지 않는다 — 누가 무엇을 보는지는 각 화면·라우트가 readVerifiedUserId 와 DB 함수로 정한다.
// session-login INV-L16: 로그인 유지 기간(역할별 미사용·절대)은 여기서 요청마다 판정한다. 넘었으면 그 세션을 서버에서 끝내고 쿠키를 지운 뒤
// 화면 요청은 로그인 화면(돌아갈 곳 = 그 경로, 안내 표시 reason 하나)으로, API·로그인 화면·로그인 링크 페이지는 로그인 안 된 요청으로 넘긴다.
// 갱신해 다시 쓰는 로그인 쿠키의 유효기간은 그 역할의 절대 기간이다(INV-L15·L16) — 역할을 안 뒤에 쓰려고 쓰기를 판정 뒤로 미룬다.
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

/** INV-L19: 남은 시간 확인은 사용으로 치지 않는다 — 화면이 기다리며 묻는 요청이 미사용 기간을 늘리면 안 된다 */
const NOT_A_USE = new Set(["/api/auth/session/status"]);
/** 끝났을 때 로그인 화면으로 돌리지 않는 경로 — 로그인 화면 자신, 로그인 링크 페이지(# 뒤 토큰이 돌린 주소에 따라붙지 않게, link-login INV-K5) */
const NO_REDIRECT = new Set(["/login", "/login/link"]);

type Write = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

/** INV-L16: 판정 재료를 못 읽으면 로그인 안 함으로 보는 운영자 주소 — 관리자 화면과 관리자 API */
function isOperatorPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/") || path === "/api/admin" || path.startsWith("/api/admin/");
}

/** INV-L17: 알림톡 안내 줄 표시 쿠키 — 로그인 화면에만 가고(Path=/login) 스크립트가 읽지 못한다 */
function loginHintOptions(maxAge: number) {
  return { ...sessionCookieOptions(process.env), path: "/login", maxAge };
}

/**
 * INV-L17: 브라우저가 보낸 안내 머리는 늘 지운다. 로그인 화면 요청이고 표시 쿠키가 있으면 머리로 화면에 넘기고, 응답에서 쿠키를 지운다(한 번만 쓰인다).
 * 돌려준 값이 true 면 응답에서 표시 쿠키를 지운다.
 */
function takeLoginHint(request: NextRequest): boolean {
  request.headers.delete(LOGIN_HINT_HEADER);
  if (request.nextUrl.pathname !== "/login" || !request.cookies.has(LOGIN_HINT_COOKIE)) return false;
  if (request.cookies.get(LOGIN_HINT_COOKIE)?.value === LOGIN_HINT_LINK) request.headers.set(LOGIN_HINT_HEADER, LOGIN_HINT_LINK);
  request.cookies.delete(LOGIN_HINT_COOKIE);
  return true;
}

function clearLoginHint(response: NextResponse, clear: boolean): NextResponse {
  if (clear) response.cookies.set(LOGIN_HINT_COOKIE, "", loginHintOptions(0));
  return response;
}

async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let config;
  try {
    config = readSupabaseConfig(process.env);
  } catch {
    request.headers.delete(LOGIN_HINT_HEADER);
    return NextResponse.next({ request }); // 설정이 없으면 갱신할 세션도 없다. 화면 쪽 읽기가 설정 없음을 오류로 드러낸다.
  }

  const hintTaken = takeLoginHint(request);
  const sessionOnly = isSessionOnly(request.cookies);
  const writes: Write[] = [];
  const writeHeaders: Record<string, string> = {};
  const deferred = deferSessionCookieWrites((list, headers) => {
    for (const c of list) writes.push({ name: c.name, value: c.value, options: c.options });
    Object.assign(writeHeaders, headers);
  });
  const supabase = createSessionClient(
    config,
    { getAll: () => request.cookies.getAll(), setAll: deferred.setAll },
    process.env,
    // session-login INV-L15: 끄고 로그인한 사람은 갱신해 다시 쓰는 로그인 쿠키에도 만료 시각을 붙이지 않는다
    { sessionOnly },
  );

  // getUser 가 필요하면 토큰을 갱신하고 쿠키를 다시 쓴다(INV-L2 의 확인도 같은 호출)
  const userId = await readVerifiedUserId(supabase.auth);
  let guard: SessionGuardResult | null = null;
  if (userId) {
    try {
      guard = await guardSession({ auth: supabase.auth, activity: sessionActivityOf(createAdminSupabase()) }, userId, {
        countsAsUse: !NOT_A_USE.has(request.nextUrl.pathname),
      });
    } catch {
      guard = { kind: "unknown", cause: "facts_failed" }; // 서버 키가 없는 환경 등
    }
  }
  deferred.decide(sessionOnly, guard?.kind === "ok" ? guard.maxAge : undefined);

  if (guard?.kind === "ended") return clearLoginHint(endedResponse(request, writes, writeHeaders, guard.byLifetime, guard.linkHint), hintTaken);

  // 다음 단계(화면)가 갱신된 값을 보도록 요청 쿠키도 바꾼 뒤 응답을 만든다.
  for (const { name, value } of writes) request.cookies.set(name, value);
  if (guard?.kind === "unknown") {
    // INV-L16: 판정 재료를 못 읽음 — 서버 오류 기록(토큰·ID 원문 없이 원인만). 운영자 주소는 로그인 안 함으로(요청에서 로그인 쿠키를 뺀다 — 세션은 끝내지 않는다),
    // 그 밖은 통과시킨다. 쿠키에는 오래 가는 만료를 붙이지 않는다(위 decide 가 유효기간 없이 썼다)
    console.error("[session-lifetime] 판정 재료를 읽지 못했다", guard.cause);
    if (isOperatorPath(request.nextUrl.pathname)) {
      for (const c of request.cookies.getAll()) if (isAuthCookieName(c.name)) request.cookies.delete(c.name);
    }
  }
  const response = clearLoginHint(NextResponse.next({ request }), hintTaken);
  for (const { name, value, options } of writes) response.cookies.set(name, value, options);
  // 인증 쿠키가 실린 응답을 공유 캐시가 저장하지 않게 하는 헤더 — 버리면 남의 세션이 나갈 수 있다.
  for (const [key, value] of Object.entries(writeHeaders)) response.headers.set(key, value);
  return response;
}

/**
 * INV-L16·L17: 끝난 세션의 응답 — 로그인 쿠키(로그아웃이 쓴 지우기)와 표시 쿠키를 지운다.
 * 기간으로 끝낸 때만 주소에 reason=session 을 붙이고(누구에게나 같은 값), 알림톡 안내 줄 표시는 짧은 HttpOnly 쿠키로만 남긴다.
 */
function endedResponse(request: NextRequest, writes: Write[], headers: Record<string, string>, byLifetime: boolean, linkHint: boolean): NextResponse {
  const path = request.nextUrl.pathname;
  const marker = sessionOnlyMarker(false, process.env);
  let response: NextResponse;
  if (path.startsWith("/api/") || NO_REDIRECT.has(path)) {
    // 그 요청은 로그인 안 된 요청으로 넘긴다 — 라우트·화면이 끝난 세션의 쿠키를 보지 않게 요청 쿠키에서도 뺀다
    for (const { name } of writes) request.cookies.delete(name);
    request.cookies.delete(marker.name);
    response = NextResponse.next({ request });
  } else {
    // 돌아갈 곳은 그 요청의 경로(INV-L13 — 같은 사이트 경로만), 안내 표시는 reason 하나(INV-L17 — 계정·역할 값은 싣지 않는다)
    const to = new URL("/login", request.nextUrl.origin);
    to.searchParams.set("next", safeNextPath(`${path}${request.nextUrl.search}`));
    if (byLifetime) to.searchParams.set("reason", SESSION_END_REASON);
    response = NextResponse.redirect(to, 307);
  }
  if (byLifetime && linkHint) response.cookies.set(LOGIN_HINT_COOKIE, LOGIN_HINT_LINK, loginHintOptions(LOGIN_HINT_MAX_AGE_SECONDS));
  for (const { name, value, options } of writes) response.cookies.set(name, value, options);
  response.cookies.set(marker.name, marker.value, marker.options);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

// 정적 파일·이미지는 거른다. 접근 판정을 여기 걸지 않으므로 matcher 는 성능 필터일 뿐이다.
export const config = {
  matcher: ["/((?!_next/|img/|favicon\\.ico$).*)"],
};
