// 요청 경로와 세션 유무만으로 접근을 판정한다.
// 근거: docs/specs/auth-session.md — INV-A1(보호 경로) · INV-A2(비로그인 전용 경로)
//
// 판정을 순수 함수로 떼어 둔 이유: 강제 위치는 서버(요청 프록시)지만, 판정 자체는
// 요청 객체도 쿠키도 필요 없다. 떼어 두면 데이터베이스 없이 불변식을 검증할 수 있다.

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";

/** INV-A1: 세션 없이 들어오면 화면을 그리기 전에 로그인 페이지로 보내는 경로들. */
export const PROTECTED_PATHS = [
  "/posts/create",
  "/studies",
  "/profile",
  "/chats",
] as const;

/**
 * INV-A1: 중간에 id 가 끼어 접두사로는 표현되지 않는 보호 경로.
 *
 * `/posts` 목록과 `/posts/[id]` 상세는 공개다(발견이 로그인 앞에 있어야 한다).
 * 그 사이에서 `/posts/[id]/edit` 만 보호해야 해서 접두사 목록으로는 안 걸린다.
 */
export const PROTECTED_PATTERNS = [/^\/posts\/[^/]+\/edit(?:\/|$)/] as const;

/** INV-A2: 이미 로그인한 사용자가 오면 홈으로 보내는 경로들. */
export const SIGNED_OUT_ONLY_PATHS = [LOGIN_PATH, "/signup"] as const;

export type RouteAccess =
  | { readonly kind: "allow" }
  | { readonly kind: "redirect"; readonly to: string };

// 비교 전에 경로를 정리한다. 정리하지 않으면 `/Studies/123` 과 `//studies/123` 이
// 목록에 안 걸려 그냥 통과한다 — 지금은 그 경로들을 Next 가 404 로 떨구지만,
// 그건 이 함수가 아니라 프레임워크가 지켜 주는 것이고 어디에도 적혀 있지 않았다.
// 인증 표면에서는 "아마 안 열릴 것"보다 "닫아 둔다"가 맞다.
function normalize(pathname: string): string {
  return pathname.toLowerCase().replace(/\/{2,}/g, "/");
}

// 경로는 '그 자체이거나 그 아래'일 때만 걸린다.
// 단순 startsWith 면 /posts/created 가 /posts/create 에 걸린다.
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function decideRouteAccess(input: {
  readonly pathname: string;
  readonly signedIn: boolean;
}): RouteAccess {
  const { signedIn } = input;
  const pathname = normalize(input.pathname);

  const protectedPath =
    PROTECTED_PATHS.some((base) => isUnder(pathname, base)) ||
    PROTECTED_PATTERNS.some((re) => re.test(pathname));

  if (!signedIn && protectedPath) {
    return { kind: "redirect", to: LOGIN_PATH };
  }

  if (signedIn && SIGNED_OUT_ONLY_PATHS.some((base) => isUnder(pathname, base))) {
    return { kind: "redirect", to: HOME_PATH };
  }

  return { kind: "allow" };
}
